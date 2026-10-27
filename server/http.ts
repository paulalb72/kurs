import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY = 5 * 1024 * 1024;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

export function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const contentType = (req: IncomingMessage) => String(req.headers['content-type'] ?? '');

async function readText(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Anfrage zu groß');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  // Nur JSON annehmen: Fremde Seiten können so keine Formulare an die API schicken (CSRF).
  if (!contentType(req).startsWith('application/json')) throw new HttpError(415, 'JSON erwartet');
  try {
    return JSON.parse(await readText(req));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Ungültiges JSON');
  }
}

/** Formular- oder JSON-Body als flaches Objekt – OAuth-Clients schicken beides. */
export async function readParams(req: IncomingMessage): Promise<Record<string, string>> {
  const text = await readText(req);
  if (contentType(req).startsWith('application/json')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed ?? {}).map(([k, v]) => [k, String(v)]));
    } catch {
      throw new HttpError(400, 'Ungültiges JSON');
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** Öffentliche Adresse, auch hinter einem Reverse Proxy. PUBLIC_URL hat Vorrang. */
export function publicUrl(req: IncomingMessage) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const first = (v: unknown) => String(v ?? '').split(',')[0].trim();
  const proto = first(req.headers['x-forwarded-proto']) || ('encrypted' in req.socket ? 'https' : 'http');
  const host = first(req.headers['x-forwarded-host']) || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}
