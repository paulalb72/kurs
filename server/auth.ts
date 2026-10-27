import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getMeta, setMeta } from './db.ts';

export const USERNAME = process.env.KURS_USERNAME ?? '';
const PASSWORD = process.env.KURS_PASSWORD ?? '';

if (!USERNAME || !PASSWORD) {
  console.error('KURS_USERNAME und KURS_PASSWORD müssen gesetzt sein (Umgebungsvariablen oder .env).');
  process.exit(1);
}
if (PASSWORD.length < 10) console.warn('Hinweis: KURS_PASSWORD ist kürzer als 10 Zeichen.');

const COOKIE = 'kurs_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

// Ohne SESSION_SECRET wird einmalig ein Secret erzeugt und in der DB abgelegt,
// damit Logins einen Neustart überleben.
const secret =
  process.env.SESSION_SECRET ||
  getMeta('session_secret') ||
  (() => {
    const generated = randomBytes(32).toString('hex');
    setMeta('session_secret', generated);
    return generated;
  })();

const digest = (s: string) => createHash('sha256').update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

// Das Passwort fließt in die Signatur ein: Passwort ändern = alle Sessions abgemeldet.
const sign = (expires: number) => createHmac('sha256', secret).update(`${USERNAME}\n${PASSWORD}\n${expires}`).digest('base64url');

/** Fingerabdruck der Zugangsdaten – OAuth-Tokens gelten nur, solange er gleich bleibt. */
export const credentialFingerprint = createHmac('sha256', secret).update(`oauth\n${USERNAME}\n${PASSWORD}`).digest('base64url');

export function checkCredentials(username: string, password: string) {
  // Beide Vergleiche laufen immer, damit die Antwortzeit nichts verrät.
  const userOk = safeEqual(username, USERNAME);
  const passOk = safeEqual(password, PASSWORD);
  return userOk && passOk;
}

function readCookie(req: IncomingMessage) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function isAuthenticated(req: IncomingMessage) {
  const [rawExpires, signature] = (readCookie(req) ?? '').split('.');
  const expires = Number(rawExpires);
  if (!signature || !Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

const isHttps = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-proto'] ?? '').startsWith('https') || 'encrypted' in req.socket;

function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function startSession(req: IncomingMessage, res: ServerResponse) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  setCookie(req, res, `${expires}.${sign(expires)}`, MAX_AGE);
}

export const endSession = (req: IncomingMessage, res: ServerResponse) => setCookie(req, res, '', 0);

// Schutz gegen Durchprobieren: nach 5 Fehlversuchen ist die IP 15 Minuten gesperrt.
const failures = new Map<string, { count: number; until: number }>();

export function clientIp(req: IncomingMessage) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return first || req.socket.remoteAddress || 'unbekannt';
}

export function isLocked(ip: string) {
  const f = failures.get(ip);
  return !!f && f.count >= MAX_FAILURES && f.until > Date.now();
}

export function recordFailure(ip: string) {
  const now = Date.now();
  const f = failures.get(ip);
  failures.set(ip, { count: f && f.until > now ? f.count + 1 : 1, until: now + LOCK_MS });
}

export const clearFailures = (ip: string) => void failures.delete(ip);
