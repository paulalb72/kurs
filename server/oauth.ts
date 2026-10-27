// Minimaler OAuth-2.1-Server für den Claude-Connector (MCP-Autorisierung):
// Dynamic Client Registration, Authorization Code + PKCE (S256), Refresh-Token-Rotation.
// Der Login auf der Freigabe-Seite nutzt dieselben Zugangsdaten wie die App.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { html, json, publicUrl, readJson, readParams } from './http.ts';
import {
  USERNAME,
  checkCredentials,
  clearFailures,
  clientIp,
  credentialFingerprint,
  isAuthenticated,
  isLocked,
  recordFailure,
} from './auth.ts';
import { findToken, getClient, saveClient, saveToken, type OAuthClient } from './db.ts';

const ACCESS_TTL = 24 * 3600; // Sekunden
const REFRESH_TTL = 90 * 24 * 3600;
const CODE_TTL_MS = 10 * 60_000;
const SCOPE = 'kurs';

const random = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const now = () => Math.floor(Date.now() / 1000);

/** Autorisierungscodes leben nur Minuten – im Speicher reicht. */
const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string; expires: number }>();

// ---------- Discovery ----------

export function protectedResourceMetadata(req: IncomingMessage, res: ServerResponse) {
  const base = publicUrl(req);
  json(res, 200, {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Kurs',
  });
}

export function authServerMetadata(req: IncomingMessage, res: ServerResponse) {
  const base = publicUrl(req);
  json(res, 200, {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [SCOPE],
  });
}

export const bearerChallenge = (req: IncomingMessage) =>
  `Bearer resource_metadata="${publicUrl(req)}/.well-known/oauth-protected-resource/mcp"`;

export function hasValidBearer(req: IncomingMessage) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  if (!match) return false;
  const entry = findToken(hash(match[1].trim()), 'access');
  return !!entry && entry.expiresAt > now() && entry.fingerprint === credentialFingerprint;
}

// ---------- Registrierung ----------

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
function isAllowedRedirect(uri: string) {
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.includes(u.hostname));
  } catch {
    return false;
  }
}

export async function register(req: IncomingMessage, res: ServerResponse) {
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!redirectUris.length || !redirectUris.every(isAllowedRedirect)) {
    return json(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris müssen https oder localhost sein.' });
  }
  const requested = body.token_endpoint_auth_method;
  const method = requested === 'client_secret_post' || requested === 'client_secret_basic' ? requested : 'none';
  const clientId = random();
  const secret = method === 'none' ? null : random();
  const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 80) : 'Unbekannte App';

  saveClient({ clientId, name, redirectUris, secretHash: secret && hash(secret) });
  json(res, 201, {
    client_id: clientId,
    client_id_issued_at: now(),
    ...(secret && { client_secret: secret, client_secret_expires_at: 0 }),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: method,
    scope: SCOPE,
  });
}

// ---------- Freigabe (Login-Seite) ----------

function redirectTo(res: ServerResponse, uri: string, params: Record<string, string | undefined>) {
  const target = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) target.searchParams.set(k, v);
  res.writeHead(302, { Location: target.toString(), 'Cache-Control': 'no-store' });
  res.end();
}

export async function authorize(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Methode nicht erlaubt' });
  const query = Object.fromEntries(new URL(req.url ?? '/', 'http://x').searchParams);
  const params = req.method === 'POST' ? { ...query, ...(await readParams(req)) } : query;

  // Solange App oder redirect_uri unklar sind, darf nicht weitergeleitet werden – Fehlerseite statt Redirect.
  const client = params.client_id ? getClient(params.client_id) : null;
  if (!client) return html(res, 400, page('Unbekannte App', `<h1>Unbekannte App</h1><p>Die Anfrage enthält keine gültige client_id. Verbinde den Connector bitte neu.</p>`));
  const redirectUri = params.redirect_uri || (client.redirectUris.length === 1 ? client.redirectUris[0] : '');
  if (!client.redirectUris.includes(redirectUri)) {
    return html(res, 400, page('Ungültige Weiterleitung', `<h1>Ungültige Weiterleitung</h1><p>Die redirect_uri passt nicht zur registrierten App.</p>`));
  }

  if (params.response_type !== 'code') return redirectTo(res, redirectUri, { error: 'unsupported_response_type', state: params.state });
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    return redirectTo(res, redirectUri, { error: 'invalid_request', error_description: 'PKCE (S256) ist Pflicht', state: params.state });
  }

  const loggedIn = isAuthenticated(req);
  if (req.method === 'GET') return html(res, 200, consentPage(client, redirectUri, params, loggedIn));

  if (params.action !== 'allow') return redirectTo(res, redirectUri, { error: 'access_denied', state: params.state });

  // Die App-Session zählt nur bei Anfragen von dieser Seite selbst (SameSite=Lax), sonst Passwort nötig.
  if (!loggedIn) {
    const ip = clientIp(req);
    if (isLocked(ip)) return html(res, 429, consentPage(client, redirectUri, params, false, 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.'));
    if (!checkCredentials(params.username ?? '', params.password ?? '')) {
      recordFailure(ip);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return html(res, 401, consentPage(client, redirectUri, params, false, 'Benutzername oder Passwort ist falsch.'));
    }
    clearFailures(ip);
  }

  const code = random();
  codes.set(hash(code), { clientId: client.clientId, redirectUri, challenge: params.code_challenge, expires: Date.now() + CODE_TTL_MS });
  redirectTo(res, redirectUri, { code, state: params.state });
}

// ---------- Tokens ----------

function issueTokens(clientId: string) {
  const access = random();
  const refresh = random();
  saveToken(hash(access), 'access', { clientId, fingerprint: credentialFingerprint, expiresAt: now() + ACCESS_TTL });
  saveToken(hash(refresh), 'refresh', { clientId, fingerprint: credentialFingerprint, expiresAt: now() + REFRESH_TTL });
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: SCOPE };
}

function authenticateClient(req: IncomingMessage, params: Record<string, string>): OAuthClient | null {
  let clientId = params.client_id;
  let secret = params.client_secret;
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? '');
  if (basic) {
    const [id, pass = ''] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
    clientId = decodeURIComponent(id);
    secret = decodeURIComponent(pass);
  }
  const client = clientId ? getClient(clientId) : null;
  if (!client) return null;
  if (client.secretHash && !(secret && sameHash(hash(secret), client.secretHash))) return null;
  return client;
}

export async function token(req: IncomingMessage, res: ServerResponse) {
  const params = await readParams(req);
  const fail = (status: number, error: string, description: string) => json(res, status, { error, error_description: description });

  const client = authenticateClient(req, params);
  if (!client) return fail(401, 'invalid_client', 'Unbekannte App oder falsches Secret');

  if (params.grant_type === 'authorization_code') {
    const key = hash(params.code ?? '');
    const entry = codes.get(key);
    codes.delete(key); // Codes sind nur einmal gültig
    if (!entry || entry.expires < Date.now() || entry.clientId !== client.clientId) return fail(400, 'invalid_grant', 'Code ungültig oder abgelaufen');
    if (params.redirect_uri && params.redirect_uri !== entry.redirectUri) return fail(400, 'invalid_grant', 'redirect_uri passt nicht');
    if (!params.code_verifier || !sameHash(hash(params.code_verifier), entry.challenge)) return fail(400, 'invalid_grant', 'PKCE-Prüfung fehlgeschlagen');
    return json(res, 200, issueTokens(client.clientId));
  }

  if (params.grant_type === 'refresh_token') {
    const entry = findToken(hash(params.refresh_token ?? ''), 'refresh', true);
    if (!entry || entry.clientId !== client.clientId || entry.expiresAt < now() || entry.fingerprint !== credentialFingerprint) {
      return fail(400, 'invalid_grant', 'Refresh-Token ungültig – bitte neu verbinden');
    }
    return json(res, 200, issueTokens(client.clientId));
  }

  fail(400, 'unsupported_grant_type', 'Unterstützt: authorization_code, refresh_token');
}

// ---------- HTML ----------

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const HIDDEN = ['client_id', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];

function consentPage(client: OAuthClient, redirectUri: string, params: Record<string, string>, loggedIn: boolean, error?: string) {
  const hidden = HIDDEN.filter((k) => params[k])
    .map((k) => `<input type="hidden" name="${k}" value="${esc(params[k])}">`)
    .join('');
  const login = loggedIn
    ? `<p class="who">Angemeldet als <strong>${esc(USERNAME)}</strong></p>`
    : `<label>Benutzername<input name="username" autocomplete="username" required autofocus value="${esc(params.username ?? '')}"></label>
       <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>`;

  return page(
    'Zugriff erlauben',
    `<h1>Mit Kurs verbinden</h1>
     <p class="lead"><strong>${esc(client.name)}</strong> möchte deine Ziele, Meilensteine und Aufgaben lesen und bearbeiten.</p>
     <form method="post" action="authorize">
       ${hidden}<input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
       ${login}
       ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
       <button name="action" value="allow" class="primary">Zugriff erlauben</button>
       <button name="action" value="deny" class="secondary" formnovalidate>Abbrechen</button>
     </form>
     <p class="meta">Weiterleitung an ${esc(new URL(redirectUri).host)}</p>`,
  );
}

const LOGO = `<svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" class="lr"/><g transform="rotate(40 12 12)"><path d="M12 4.5 14.6 12H9.4z" class="lp"/><path d="M9.4 12h5.2L12 19.5z" class="lp" opacity=".4"/></g></svg>`;

const CSS = `
:root{--bg:#f7f7f5;--surface:#fff;--border:#ebe9e4;--text:#22211e;--text-2:#5e5c56;--text-3:#96938c;--primary:#22211e;--on-primary:#fff;--ring:rgba(34,33,30,.12);--err:#b13b2f;--err-bg:#fbe7e4;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#1f1f1e;--surface:#222221;--border:#2e2e2c;--text:#ecebe8;--text-2:#b3b1ab;--text-3:#7f7d77;--primary:#ecebe8;--on-primary:#191918;--ring:rgba(236,235,232,.14);--err:#f0907f;--err-bg:rgba(235,105,85,.14);color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
.card{width:min(380px,100%);display:flex;flex-direction:column;gap:12px;padding:28px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:0 1px 2px rgba(20,19,15,.04),0 4px 14px rgba(20,19,15,.06)}
.lr{fill:var(--primary)}.lp{fill:var(--on-primary)}
h1{margin:4px 0 0;font-size:19px;font-weight:650;letter-spacing:-.015em}p{margin:0}.lead{color:var(--text-2)}
form{display:flex;flex-direction:column;gap:12px;margin-top:6px}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500;color:var(--text-2)}
input{height:38px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;outline:none}
input:focus{border-color:color-mix(in srgb,var(--text) 30%,var(--border));box-shadow:0 0 0 3px var(--ring)}
button{height:38px;border-radius:8px;font:500 13.5px/1 inherit;cursor:pointer}
.primary{border:0;background:var(--primary);color:var(--on-primary);margin-top:4px}.secondary{border:1px solid var(--border);background:transparent;color:var(--text-2)}
.who{padding:10px 12px;border-radius:8px;background:var(--bg);color:var(--text-2)}
.error{padding:8px 10px;border-radius:8px;background:var(--err-bg);color:var(--err);font-size:13px}
.meta{font-size:12px;color:var(--text-3);text-align:center}`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Kurs</title><style>${CSS}</style></head><body><main class="card">${LOGO}${body}</main></body></html>`;
}
