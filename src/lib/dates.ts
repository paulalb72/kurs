// Datumswerte werden als lokale 'YYYY-MM-DD'-Strings gespeichert – sortierbar und frei von Zeitzonen-Fallen.

export const pad = (n: number) => String(n).padStart(2, '0');

export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(key: string, n: number) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Anzahl Tage von a bis b */
export const diffDays = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 864e5);

/** 0 = Montag … 6 = Sonntag */
export const weekday = (key: string) => (fromKey(key).getDay() + 6) % 7;
export const startOfWeek = (key: string) => addDays(key, -weekday(key));
export const weekDays = (key: string) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(key), i));

export function isoWeek(key: string) {
  const d = fromKey(key);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart) / 864e5 + 1) / 7) };
}

export function weekKey(key: string) {
  const { year, week } = isoWeek(key);
  return `${year}-W${pad(week)}`;
}

const format = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-DE', o);
const fLong = format({ weekday: 'long', day: 'numeric', month: 'long' });
const fShort = format({ day: 'numeric', month: 'short' });
const fWeekday = format({ weekday: 'short' });
const fWeekdayLong = format({ weekday: 'long' });
const fMonth = format({ month: 'short' });

export const fmtLong = (k: string) => fLong.format(fromKey(k));
export const fmtShort = (k: string) => fShort.format(fromKey(k));
export const fmtWeekday = (k: string) => fWeekday.format(fromKey(k)).replace('.', '');
export const fmtMonth = (m: number) => fMonth.format(new Date(2000, m, 1)).replace('.', '');

export function fmtRelative(k: string, today = todayKey()) {
  const d = diffDays(today, k);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Morgen';
  if (d === -1) return 'Gestern';
  if (d > 1 && d < 7) return fWeekdayLong.format(fromKey(k));
  return fmtShort(k);
}

export function fmtRemaining(due: string, today = todayKey()) {
  const d = diffDays(today, due);
  if (d < 0) return `${-d} ${d === -1 ? 'Tag' : 'Tage'} drüber`;
  if (d === 0) return 'Heute fällig';
  if (d < 14) return `noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  return `noch ${Math.round(d / 7)} Wochen`;
}
