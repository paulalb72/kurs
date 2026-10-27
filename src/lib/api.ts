export class ApiError extends Error {
  /** 0 = Server nicht erreichbar */
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Relative Pfade, damit die App auch hinter einem Unterpfad (z. B. /kurs/) läuft. */
export async function api<T = unknown>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      keepalive,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
  return data as T;
}
