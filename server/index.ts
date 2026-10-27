import { readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { BadInput, Conflict, applySync, closeDb, dataDirIsMounted, dbPath, readAll, replaceAll } from './db.ts';
import {
  USERNAME,
  checkCredentials,
  clearFailures,
  clientIp,
  endSession,
  isAuthenticated,
  isLocked,
  recordFailure,
  startSession,
} from './auth.ts';
import { HttpError, json, readJson } from './http.ts';
import { authServerMetadata, authorize, bearerChallenge, hasValidBearer, protectedResourceMetadata, register, token } from './oauth.ts';
import { handleMcp } from './mcp.ts';

const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(import.meta.dirname, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');

// Neben der App liefert der Server nur PWA-Dateien aus (Manifest, Icons, Service Worker).
const STATIC_TYPES: Record<string, string> = {
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.js': 'text/javascript; charset=utf-8',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const type = STATIC_TYPES[path.extname(pathname)];
  if (!type) return false;
  let content: Buffer;
  try {
    const file = path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(DIST + path.sep)) return false; // kein Ausbrechen aus dist/
    content = readFileSync(file);
  } catch {
    return false;
  }
  res.writeHead(200, {
    'Content-Type': type,
    // Der Service Worker muss bei jedem Start frisch geprüft werden, Icons dürfen eine Woche bleiben.
    'Cache-Control': pathname === '/sw.js' || type.startsWith('application/manifest') ? 'no-cache' : 'public, max-age=604800',
  });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}

// Die App ist eine einzige HTML-Datei; komprimiert wird sie einmal pro Build.
let page: { mtime: number; raw: Buffer; gzip: Buffer } | null = null;

function serveApp(req: IncomingMessage, res: ServerResponse) {
  let mtime: number;
  try {
    mtime = statSync(INDEX).mtimeMs;
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Frontend fehlt – bitte zuerst "npm run build" ausführen.');
  }
  if (page?.mtime !== mtime) {
    const raw = readFileSync(INDEX);
    page = { mtime, raw, gzip: gzipSync(raw) };
  }
  const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    Vary: 'Accept-Encoding',
    ...(gzip && { 'Content-Encoding': 'gzip' }),
  });
  res.end(req.method === 'HEAD' ? undefined : gzip ? page.gzip : page.raw);
}

async function login(req: IncomingMessage, res: ServerResponse) {
  const ip = clientIp(req);
  if (isLocked(ip)) return json(res, 429, { error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });

  const body = (await readJson(req)) as { username?: unknown; password?: unknown } | null;
  if (checkCredentials(String(body?.username ?? ''), String(body?.password ?? ''))) {
    clearFailures(ip);
    startSession(req, res);
    return json(res, 200, { user: USERNAME });
  }
  recordFailure(ip);
  await new Promise((resolve) => setTimeout(resolve, 400));
  json(res, 401, { error: 'Benutzername oder Passwort ist falsch.' });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${pathname}`;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (route === 'GET /healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  // MCP-Connector für Claude – geschützt per OAuth (Login mit denselben Zugangsdaten)
  if (pathname === '/mcp') {
    if (!hasValidBearer(req)) return json(res, 401, { error: 'invalid_token' }, { 'WWW-Authenticate': bearerChallenge(req) });
    return handleMcp(req, res);
  }
  if (route === 'GET /.well-known/oauth-protected-resource' || route === 'GET /.well-known/oauth-protected-resource/mcp') {
    return protectedResourceMetadata(req, res);
  }
  if (route === 'GET /.well-known/oauth-authorization-server') return authServerMetadata(req, res);
  if (route === 'POST /oauth/register') return register(req, res);
  if (route === 'POST /oauth/token') return token(req, res);
  if (pathname === '/oauth/authorize') return authorize(req, res);

  if (!pathname.startsWith('/api/')) {
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname) || serveApp(req, res);
    return json(res, 405, { error: 'Methode nicht erlaubt' });
  }

  if (route === 'POST /api/login') return login(req, res);
  if (route === 'POST /api/logout') {
    endSession(req, res);
    return json(res, 200, { ok: true });
  }
  if (!isAuthenticated(req)) return json(res, 401, { error: 'Nicht angemeldet' });

  switch (route) {
    case 'GET /api/session':
      return json(res, 200, { user: USERNAME });
    case 'GET /api/data':
      return json(res, 200, readAll());
    case 'POST /api/sync':
      applySync(await readJson(req));
      return json(res, 200, { ok: true });
    case 'PUT /api/data':
      replaceAll(await readJson(req));
      return json(res, 200, { ok: true });
    default:
      return json(res, 404, { error: 'Nicht gefunden' });
  }
}

const server = createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    if (err instanceof BadInput) return json(res, 400, { error: err.message });
    if (err instanceof Conflict) return json(res, 409, { error: 'Daten wurden zwischenzeitlich geändert.' });
    console.error(err);
    json(res, 500, { error: 'Serverfehler' });
  });
});

server.listen(PORT, () => {
  console.log(`Kurs läuft auf http://localhost:${PORT}  ·  Datenbank: ${dbPath}`);
  if (dataDirIsMounted() === false) {
    console.warn(
      `WARNUNG: ${path.dirname(dbPath)} ist kein persistentes Volume – alle Daten gehen beim nächsten Deploy verloren. ` +
        'In Coolify unter "Persistent Storage" ein Volume mit Ziel /data anlegen.',
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    closeDb();
    process.exit(0);
  });
}
