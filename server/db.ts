import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Data, Goal, GoalColor, Habit, HabitLog, Milestone, Review, Task } from '../src/lib/types.ts';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, '..', 'data'));
mkdirSync(dataDir, { recursive: true });
export const dbPath = path.join(dataDir, 'kurs.db');

/** Im Container: Ist DATA_DIR ein eingehängtes Volume? Sonst ist die Datenbank beim nächsten Deploy weg. */
export function dataDirIsMounted(): boolean | null {
  if (process.platform !== 'linux' || !process.env.DATA_DIR) return null;
  try {
    // Feld 5 jeder Zeile in mountinfo ist der Einhängepunkt.
    return readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n')
      .some((line) => line.split(' ')[4] === dataDir);
  } catch {
    return null;
  }
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS goals (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    why        TEXT NOT NULL,
    year       INTEGER NOT NULL,
    color      TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS milestones (
    id             TEXT PRIMARY KEY,
    goal_id        TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    emoji          TEXT NOT NULL,
    start_date     TEXT NOT NULL,
    due_date       TEXT NOT NULL,
    metric_current REAL,
    metric_target  REAL,
    metric_unit    TEXT,
    obstacle       TEXT NOT NULL,
    if_then        TEXT NOT NULL,
    achieved       INTEGER NOT NULL,
    created_at     INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id         TEXT PRIMARY KEY,
    goal_id    TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    per_week   INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habit_logs (
    id       TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day      TEXT NOT NULL,
    UNIQUE (habit_id, day)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
    day          TEXT,
    is_top       INTEGER NOT NULL,
    is_done      INTEGER NOT NULL,
    done_at      TEXT,
    created_at   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    week        TEXT PRIMARY KEY,
    went_well   TEXT NOT NULL,
    blocked     TEXT NOT NULL,
    change_next TEXT NOT NULL,
    saved_at    INTEGER NOT NULL
  );
  -- OAuth für den Claude-Connector
  CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id     TEXT PRIMARY KEY,
    client_name   TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    secret_hash   TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash  TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    client_id   TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS milestones_goal ON milestones(goal_id);
  CREATE INDEX IF NOT EXISTS habits_goal ON habits(goal_id);
  CREATE INDEX IF NOT EXISTS tasks_milestone ON tasks(milestone_id);
  CREATE INDEX IF NOT EXISTS tasks_day ON tasks(day);
`);

// Migration: Zeitblöcke (Uhrzeit und Dauer pro Aufgabe) gibt es nicht mehr.
const taskColumns = (db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]).map((c) => c.name);
for (const column of ['start_min', 'duration']) {
  if (taskColumns.includes(column)) db.exec(`ALTER TABLE tasks DROP COLUMN ${column}`);
}

/** Eingabe hat die falsche Form → 400 */
export class BadInput extends Error {}
/** Verletzt Fremdschlüssel, z. B. weil ein anderes Gerät das Ziel gelöscht hat → 409 */
export class Conflict extends Error {}

type Value = string | number | null;
type Row = Record<string, Value>;
type Collection = keyof Data;

interface Table<T> {
  /** Name der Sammlung in der App */
  name: Collection;
  /** Name der SQL-Tabelle */
  table: string;
  /** Primärschlüssel – heißt in Tabelle und Objekt gleich */
  key: 'id' | 'week';
  columns: string[];
  order: string;
  toRow(entity: T): Value[];
  fromRow(row: Row): T;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const textOrNull = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const flag = (v: unknown) => (v ? 1 : 0);

const goals: Table<Goal> = {
  name: 'goals',
  table: 'goals',
  key: 'id',
  order: 'created_at',
  columns: ['id', 'title', 'emoji', 'why', 'year', 'color', 'created_at'],
  toRow: (g) => [g.id, text(g.title), text(g.emoji), text(g.why), num(g.year), text(g.color), num(g.createdAt)],
  fromRow: (r) => ({
    id: r.id as string,
    title: r.title as string,
    emoji: r.emoji as string,
    why: r.why as string,
    year: r.year as number,
    color: r.color as GoalColor,
    createdAt: r.created_at as number,
  }),
};

const milestones: Table<Milestone> = {
  name: 'milestones',
  table: 'milestones',
  key: 'id',
  order: 'created_at',
  columns: ['id', 'goal_id', 'title', 'emoji', 'start_date', 'due_date', 'metric_current', 'metric_target', 'metric_unit', 'obstacle', 'if_then', 'achieved', 'created_at'],
  toRow: (m) => {
    const metric = m.metric && typeof m.metric === 'object' ? m.metric : null;
    return [
      m.id, text(m.goalId), text(m.title), text(m.emoji), text(m.start), text(m.due),
      metric ? num(metric.current) : null, metric ? num(metric.target, 1) : null, metric ? text(metric.unit) : null,
      text(m.obstacle), text(m.plan), flag(m.achieved), num(m.createdAt),
    ];
  },
  fromRow: (r) => ({
    id: r.id as string,
    goalId: r.goal_id as string,
    title: r.title as string,
    emoji: r.emoji as string,
    start: r.start_date as string,
    due: r.due_date as string,
    metric:
      r.metric_target === null
        ? null
        : { current: r.metric_current as number, target: r.metric_target as number, unit: (r.metric_unit as string) ?? '' },
    obstacle: r.obstacle as string,
    plan: r.if_then as string,
    achieved: r.achieved === 1,
    createdAt: r.created_at as number,
  }),
};

const habits: Table<Habit> = {
  name: 'habits',
  table: 'habits',
  key: 'id',
  order: 'created_at',
  columns: ['id', 'goal_id', 'title', 'emoji', 'per_week', 'start_date', 'created_at'],
  toRow: (h) => [h.id, text(h.goalId), text(h.title), text(h.emoji), Math.min(7, Math.max(1, Math.round(num(h.perWeek, 3)))), text(h.start), num(h.createdAt)],
  fromRow: (r) => ({
    id: r.id as string,
    goalId: r.goal_id as string,
    title: r.title as string,
    emoji: r.emoji as string,
    perWeek: r.per_week as number,
    start: r.start_date as string,
    createdAt: r.created_at as number,
  }),
};

const habitLogs: Table<HabitLog> = {
  name: 'habitLogs',
  table: 'habit_logs',
  key: 'id',
  order: 'day',
  columns: ['id', 'habit_id', 'day'],
  toRow: (l) => [l.id, text(l.habitId), text(l.date)],
  fromRow: (r) => ({ id: r.id as string, habitId: r.habit_id as string, date: r.day as string }),
};

const tasks: Table<Task> = {
  name: 'tasks',
  table: 'tasks',
  key: 'id',
  order: 'created_at',
  columns: ['id', 'title', 'milestone_id', 'day', 'is_top', 'is_done', 'done_at', 'created_at'],
  toRow: (t) => [
    t.id, text(t.title), textOrNull(t.milestoneId), textOrNull(t.date), flag(t.top), flag(t.done), textOrNull(t.doneAt), num(t.createdAt),
  ],
  fromRow: (r) => ({
    id: r.id as string,
    title: r.title as string,
    milestoneId: r.milestone_id as string | null,
    date: r.day as string | null,
    top: r.is_top === 1,
    done: r.is_done === 1,
    doneAt: r.done_at as string | null,
    createdAt: r.created_at as number,
  }),
};

const reviews: Table<Review> = {
  name: 'reviews',
  table: 'reviews',
  key: 'week',
  order: 'week',
  columns: ['week', 'went_well', 'blocked', 'change_next', 'saved_at'],
  toRow: (r) => [r.week, text(r.good), text(r.blocked), text(r.change), num(r.savedAt)],
  fromRow: (r) => ({
    week: r.week as string,
    good: r.went_well as string,
    blocked: r.blocked as string,
    change: r.change_next as string,
    savedAt: r.saved_at as number,
  }),
};

/** Eltern vor Kindern – so greifen die Fremdschlüssel beim Schreiben */
const TABLES = [goals, milestones, habits, habitLogs, tasks, reviews] as Table<unknown>[];

const statements = Object.fromEntries(
  TABLES.map((t) => {
    const updates = t.columns.filter((c) => c !== t.key).map((c) => `${c} = excluded.${c}`);
    return [
      t.name,
      {
        upsert: db.prepare(
          `INSERT INTO ${t.table} (${t.columns.join(', ')}) VALUES (${t.columns.map(() => '?').join(', ')})
           ON CONFLICT(${t.key}) DO UPDATE SET ${updates.join(', ')}`,
        ),
        remove: db.prepare(`DELETE FROM ${t.table} WHERE ${t.key} = ?`),
        clear: db.prepare(`DELETE FROM ${t.table}`),
        all: db.prepare(`SELECT * FROM ${t.table} ORDER BY ${t.order}`),
      },
    ];
  }),
) as Record<Collection, Record<'upsert' | 'remove' | 'clear' | 'all', ReturnType<typeof db.prepare>>>;

function toRows(t: Table<unknown>, input: unknown): Value[][] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new BadInput(`${t.name}: Liste erwartet`);
  return input.map((entity) => {
    const key = entity && typeof entity === 'object' ? (entity as Record<string, unknown>)[t.key] : undefined;
    if (typeof key !== 'string' || !key) throw new BadInput(`${t.name}: Eintrag ohne ${t.key}`);
    return t.toRow(entity);
  });
}

function toKeys(t: Table<unknown>, input: unknown): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.some((k) => typeof k !== 'string')) throw new BadInput(`${t.name}: Schlüsselliste erwartet`);
  return input;
}

function transaction(fn: () => void) {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    if (err instanceof Error && /constraint/i.test(err.message)) throw new Conflict(err.message);
    throw err;
  }
}

export function readAll(): Data {
  const read = <T>(t: Table<T>) => (statements[t.name].all.all() as Row[]).map((r) => t.fromRow(r));
  return {
    goals: read(goals),
    milestones: read(milestones),
    habits: read(habits),
    habitLogs: read(habitLogs),
    tasks: read(tasks),
    reviews: read(reviews),
  };
}

/** Änderungen vom Client: erst alle Upserts (Eltern zuerst), dann alle Löschungen (Kinder zuerst). */
export function applySync(body: unknown) {
  const { upsert = {}, delete: remove = {} } = (body ?? {}) as { upsert?: Record<string, unknown>; delete?: Record<string, unknown> };
  const writes = TABLES.map((t) => ({ t, rows: toRows(t, upsert[t.name]) }));
  const deletes = TABLES.map((t) => ({ t, keys: toKeys(t, remove[t.name]) })).reverse();

  transaction(() => {
    for (const { t, rows } of writes) for (const row of rows) statements[t.name].upsert.run(...row);
    for (const { t, keys } of deletes) for (const key of keys) statements[t.name].remove.run(key);
  });
}

/** Import, Beispiel oder "Alles löschen": kompletter Ersatz. Verwaiste Verweise werden bereinigt. */
export function replaceAll(body: unknown) {
  const data = (body ?? {}) as Record<string, unknown>;
  if (!['goals', 'milestones', 'tasks', 'reviews'].every((k) => Array.isArray(data[k]))) {
    throw new BadInput('goals, milestones, tasks und reviews müssen Listen sein');
  }
  type Loose = Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Loose[]) : []); // ältere Backups ohne Gewohnheiten
  const goalIds = new Set((data.goals as Loose[]).map((g) => g.id));
  const keptMilestones = (data.milestones as Loose[]).filter((m) => goalIds.has(m.goalId));
  const milestoneIds = new Set(keptMilestones.map((m) => m.id));
  const keptHabits = list(data.habits).filter((h) => goalIds.has(h.goalId));
  const habitIds = new Set(keptHabits.map((h) => h.id));
  const keptLogs = list(data.habitLogs).filter((l) => habitIds.has(l.habitId));
  const keptTasks = (data.tasks as Loose[]).map((t) =>
    t.milestoneId && !milestoneIds.has(t.milestoneId) ? { ...t, milestoneId: null } : t,
  );

  const rows = (t: Table<unknown>, input: unknown) => ({ t, rows: toRows(t, input) });
  const writes = [
    rows(goals as Table<unknown>, data.goals),
    rows(milestones as Table<unknown>, keptMilestones),
    rows(habits as Table<unknown>, keptHabits),
    rows(habitLogs as Table<unknown>, keptLogs),
    rows(tasks as Table<unknown>, keptTasks),
    rows(reviews as Table<unknown>, data.reviews),
  ];

  transaction(() => {
    for (const t of [...TABLES].reverse()) statements[t.name].clear.run();
    for (const { t, rows } of writes) for (const row of rows) statements[t.name].upsert.run(...row);
  });
}

const getMetaStmt = db.prepare('SELECT value FROM meta WHERE key = ?');
const setMetaStmt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export const getMeta = (key: string) => (getMetaStmt.get(key) as { value: string } | undefined)?.value ?? null;
export const setMeta = (key: string, value: string) => void setMetaStmt.run(key, value);

// ---------- OAuth ----------

export interface OAuthClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  secretHash: string | null;
}

export interface OAuthToken {
  clientId: string;
  fingerprint: string;
  expiresAt: number;
}

const insertClient = db.prepare(
  'INSERT INTO oauth_clients (client_id, client_name, redirect_uris, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)',
);
const selectClient = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?');
// Registrieren darf jeder (so will es der MCP-Standard) – damit die Tabelle nicht vollläuft, bleiben nur die neuesten 50.
const pruneClients = db.prepare(
  'DELETE FROM oauth_clients WHERE client_id NOT IN (SELECT client_id FROM oauth_clients ORDER BY created_at DESC LIMIT 50)',
);
const insertToken = db.prepare('INSERT INTO oauth_tokens (token_hash, kind, client_id, fingerprint, expires_at) VALUES (?, ?, ?, ?, ?)');
const selectToken = db.prepare('SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = ?');
const deleteToken = db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ?');
const pruneTokens = db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?');

export function saveClient(client: OAuthClient) {
  insertClient.run(client.clientId, client.name, JSON.stringify(client.redirectUris), client.secretHash, Date.now());
  pruneClients.run();
}

export function getClient(clientId: string): OAuthClient | null {
  const row = selectClient.get(clientId) as Row | undefined;
  if (!row) return null;
  return {
    clientId: row.client_id as string,
    name: row.client_name as string,
    redirectUris: JSON.parse(row.redirect_uris as string) as string[],
    secretHash: row.secret_hash as string | null,
  };
}

export function saveToken(tokenHash: string, kind: 'access' | 'refresh', token: OAuthToken) {
  pruneTokens.run(Math.floor(Date.now() / 1000));
  insertToken.run(tokenHash, kind, token.clientId, token.fingerprint, token.expiresAt);
}

/** Liest einen Token; mit consume = true wird er dabei entwertet (Refresh-Token-Rotation). */
export function findToken(tokenHash: string, kind: 'access' | 'refresh', consume = false): OAuthToken | null {
  const row = selectToken.get(tokenHash, kind) as Row | undefined;
  if (!row) return null;
  if (consume) deleteToken.run(tokenHash);
  return { clientId: row.client_id as string, fingerprint: row.fingerprint as string, expiresAt: row.expires_at as number };
}

export const closeDb = () => db.close();
