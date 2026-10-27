import { create } from 'zustand';
import type { Data } from './types';
import { EMPTY, useStore } from './store';
import { useUI } from './ui';
import { ApiError, api } from './api';

// Der Store bleibt die Wahrheit im Browser. Dieses Modul beobachtet ihn, sammelt
// geänderte und gelöschte Einträge und schickt sie gebündelt an den Server.

type Collection = keyof Data;
type Entity = Data[Collection][number];
type Pending = Record<Collection, Map<string, Entity | null>>;

const COLLECTIONS: Collection[] = ['goals', 'milestones', 'habits', 'habitLogs', 'tasks', 'reviews'];
const keyOf = (e: Entity) => ('week' in e ? e.week : e.id);
const emptyPending = () => Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()])) as Pending;
const snapshot = (): Data => {
  const { goals, milestones, habits, habitLogs, tasks, reviews } = useStore.getState();
  return { goals, milestones, habits, habitLogs, tasks, reviews };
};

export type SyncStatus = 'saved' | 'saving' | 'offline';
export const useSync = create<{ status: SyncStatus }>(() => ({ status: 'saved' }));

export type Phase = 'loading' | 'login' | 'ready' | 'unreachable';
export const useSession = create<{ phase: Phase; user: string | null }>(() => ({ phase: 'loading', user: null }));

let pending = emptyPending();
let replacePending = false;
let tracking = true;
let inFlight: Promise<unknown> | null = null;
let timer: number | undefined;
let retryDelay = 1000;

const hasPending = () => replacePending || COLLECTIONS.some((c) => pending[c].size > 0);
const setStatus = (status: SyncStatus) => useSync.setState({ status });

useStore.subscribe((state, prev) => {
  if (!tracking) return;
  // Steht ein Komplett-Ersatz an, wird ohnehin der ganze aktuelle Stand gesendet.
  if (!replacePending) {
    for (const c of COLLECTIONS) {
      const next = state[c] as Entity[];
      const before = prev[c] as Entity[];
      if (next === before) continue;
      // Unveränderte Einträge behalten ihre Objekt-Referenz – ein Vergleich per === genügt.
      const old = new Map(before.map((e) => [keyOf(e), e]));
      for (const e of next) {
        const key = keyOf(e);
        if (old.get(key) !== e) pending[c].set(key, e);
        old.delete(key);
      }
      for (const key of old.keys()) pending[c].set(key, null);
    }
  }
  if (hasPending()) schedule(600);
});

function schedule(ms: number) {
  window.clearTimeout(timer);
  if (useSync.getState().status !== 'offline') setStatus('saving');
  timer = window.setTimeout(() => void flush(), ms);
}

function silently(fn: () => void) {
  tracking = false;
  try {
    fn();
  } finally {
    tracking = true;
  }
}

/** Stand vom Server übernehmen, ohne ihn zurückzuschicken */
export const hydrate = (data: Data) => silently(() => useStore.getState().replaceAll(data));

/** Import, Beispiel, Alles löschen: ersetzt den kompletten Stand auf dem Server */
export function replaceEverything(data: Data) {
  silently(() => useStore.getState().replaceAll(data));
  pending = emptyPending();
  replacePending = true;
  schedule(0);
}

function send(batch: Pending, replace: boolean, keepalive: boolean) {
  if (replace) {
    return api('PUT', 'api/data', snapshot(), keepalive);
  }
  const upsert: Record<string, Entity[]> = {};
  const remove: Record<string, string[]> = {};
  for (const c of COLLECTIONS) {
    upsert[c] = [];
    remove[c] = [];
    for (const [key, entity] of batch[c]) entity ? upsert[c].push(entity) : remove[c].push(key);
  }
  return api('POST', 'api/sync', { upsert, delete: remove }, keepalive);
}

/** Fehlgeschlagene Änderungen zurücklegen – neuere Änderungen gewinnen. */
function restore(batch: Pending, replace: boolean) {
  if (replace) replacePending = true;
  for (const c of COLLECTIONS) for (const [key, entity] of batch[c]) if (!pending[c].has(key)) pending[c].set(key, entity);
}

export async function flush(keepalive = false): Promise<void> {
  window.clearTimeout(timer);
  if (inFlight) {
    await inFlight.catch(() => {});
    return flush(keepalive);
  }
  if (!hasPending()) return setStatus('saved');

  const batch = pending;
  const replace = replacePending;
  pending = emptyPending();
  replacePending = false;

  try {
    inFlight = send(batch, replace, keepalive);
    await inFlight;
    retryDelay = 1000;
    setStatus(hasPending() ? 'saving' : 'saved');
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    if (status === 401) {
      restore(batch, replace);
      setStatus('offline');
      useSession.setState({ phase: 'login' });
    } else if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      // Der Server lehnt die Änderung ab (z. B. Konflikt mit einem anderen Gerät): neu laden statt endlos wiederholen.
      await reload(true);
      useUI.getState().notify('Daten wurden auf einem anderen Gerät geändert und neu geladen.');
    } else {
      restore(batch, replace);
      setStatus('offline');
      timer = window.setTimeout(() => void flush(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  } finally {
    inFlight = null;
  }
}

let lastLoad = 0;

/** Stand vom Server holen. Ohne force gewinnen lokale, noch nicht gespeicherte Änderungen. */
async function reload(force = false) {
  try {
    const data = await api<Data>('GET', 'api/data');
    lastLoad = Date.now();
    if (!force && (hasPending() || inFlight)) return;
    pending = emptyPending();
    replacePending = false;
    if (JSON.stringify(data) !== JSON.stringify(snapshot())) hydrate(data);
    setStatus('saved');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) useSession.setState({ phase: 'login' });
  }
}

/** Änderungen von anderen Geräten oder von Claude (MCP) übernehmen, wenn gerade nichts in Arbeit ist. */
function refreshIfIdle(minAge: number) {
  if (Date.now() - lastLoad < minAge || hasPending() || inFlight) return;
  if (useSession.getState().phase !== 'ready' || document.body.classList.contains('is-dragging')) return;
  void reload();
}

export async function boot() {
  try {
    const { user } = await api<{ user: string }>('GET', 'api/session');
    hydrate(await api<Data>('GET', 'api/data'));
    lastLoad = Date.now();
    useSession.setState({ phase: 'ready', user });
  } catch (err) {
    useSession.setState({ phase: err instanceof ApiError && err.status === 401 ? 'login' : 'unreachable' });
  }
}

export async function login(username: string, password: string) {
  const { user } = await api<{ user: string }>('POST', 'api/login', { username, password });
  // Änderungen, die vor Ablauf der Session nicht mehr durchkamen, zuerst nachreichen.
  if (hasPending()) await flush();
  hydrate(await api<Data>('GET', 'api/data'));
  lastLoad = Date.now();
  setStatus('saved');
  useSession.setState({ phase: 'ready', user });
}

export async function logout() {
  if (hasPending()) await flush().catch(() => {});
  await api('POST', 'api/logout').catch(() => {});
  hydrate(EMPTY);
  useUI.setState({ panel: null, modal: null });
  useSession.setState({ phase: 'login', user: null });
}

// Beim Verlassen der Seite offene Änderungen noch mitschicken, beim Zurückkehren frisch laden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (hasPending()) void flush(true);
  } else {
    refreshIfIdle(3000);
  }
});
window.addEventListener('focus', () => refreshIfIdle(3000));
window.setInterval(() => document.visibilityState === 'visible' && refreshIfIdle(15_000), 20_000);
window.addEventListener('beforeunload', (e) => {
  if (!hasPending()) return;
  void flush(true);
  if (useSync.getState().status === 'offline') e.preventDefault();
});
