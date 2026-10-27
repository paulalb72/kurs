import type { Goal, Habit, HabitLog, Milestone, Status, Task } from './types';
// Mit .ts-Endung, weil auch der Server (Node) diese Datei direkt lädt.
import { addDays, diffDays, startOfWeek } from './dates.ts';

export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export const STATUS_LABEL: Record<Status, string> = {
  achieved: 'Erreicht',
  on: 'Auf Kurs',
  risk: 'Gefährdet',
  off: 'Hinterher',
  planned: 'Geplant',
  none: 'Noch leer',
};

/** Eine Gewohnheit ohne abgeschlossene Woche ist nicht "geplant", sondern neu. */
export const HABIT_LABEL: Record<Status, string> = { ...STATUS_LABEL, planned: 'Neu' };

export interface MilestoneInfo {
  progress: number;
  /** Anteil der verstrichenen Zeit zwischen Start und Deadline */
  elapsed: number;
  status: Status;
  done: number;
  total: number;
}

export function milestoneInfo(m: Milestone, tasks: Task[], today: string): MilestoneInfo {
  const own = tasks.filter((t) => t.milestoneId === m.id);
  const done = own.filter((t) => t.done).length;

  let progress = own.length ? done / own.length : 0;
  if (m.metric && m.metric.target > 0) progress = clamp(m.metric.current / m.metric.target);
  if (m.achieved) progress = 1;

  const span = diffDays(m.start, m.due);
  const elapsed = span > 0 ? clamp(diffDays(m.start, today) / span) : today >= m.due ? 1 : 0;

  // Der Status vergleicht Fortschritt mit verstrichener Zeit: Wer bei 60 % der Zeit
  // erst 30 % geschafft hat, ist nicht mehr auf Kurs – egal wie viel noch "offen" ist.
  let status: Status;
  if (progress >= 1) status = 'achieved';
  else if (today < m.start) status = 'planned';
  else if (today > m.due) status = 'off';
  else {
    const gap = progress - elapsed;
    status = gap >= -0.1 ? 'on' : gap >= -0.25 ? 'risk' : 'off';
  }

  return { progress, elapsed, status, done, total: own.length };
}

// ---------- Gewohnheiten ----------

export interface HabitWeek {
  start: string;
  done: number;
  target: number;
  /** Erfüllung der Woche, 0–1 – mehr als das Ziel zählt als 1 */
  rate: number;
}

export interface HabitSummary {
  rate: number;
  met: number;
  weeks: number;
}

export interface HabitInfo {
  /** Erledigte Tage zwischen Start und heute */
  days: Set<string>;
  thisWeek: { start: string; done: number; target: number };
  /** Abgeschlossene Wochen seit Start, älteste zuerst */
  weeks: HabitWeek[];
  last4: HabitSummary | null;
  overall: HabitSummary | null;
  status: Status;
}

/** Wochenziel. Startet die Gewohnheit mitten in der Woche, zählt die erste Woche nur anteilig. */
export function habitTarget(h: Habit, weekStart: string) {
  const available = Math.min(7, diffDays(h.start, addDays(weekStart, 6)) + 1);
  return Math.max(1, Math.ceil((h.perWeek * available) / 7));
}

export function countWeek(days: Set<string>, weekStart: string) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (days.has(addDays(weekStart, i))) n++;
  return n;
}

const summarize = (weeks: HabitWeek[]): HabitSummary | null =>
  weeks.length
    ? { rate: weeks.reduce((s, w) => s + w.rate, 0) / weeks.length, met: weeks.filter((w) => w.done >= w.target).length, weeks: weeks.length }
    : null;

export function habitInfo(h: Habit, logs: HabitLog[], today: string): HabitInfo {
  const days = new Set(logs.filter((l) => l.habitId === h.id && l.date >= h.start && l.date <= today).map((l) => l.date));
  const current = startOfWeek(today);

  // Bewertet werden nur abgeschlossene Wochen – sonst sähe jeder Montag schlecht aus.
  const weeks: HabitWeek[] = [];
  for (let w = startOfWeek(h.start); w < current; w = addDays(w, 7)) {
    const target = habitTarget(h, w);
    const done = countWeek(days, w);
    weeks.push({ start: w, done, target, rate: Math.min(done / target, 1) });
  }

  const last4 = summarize(weeks.slice(-4));
  const thisWeek = { start: current, done: countWeek(days, current), target: habitTarget(h, current) };

  let status: Status = 'planned';
  if (today < h.start) status = 'planned';
  else if (last4) status = last4.rate >= 0.8 ? 'on' : last4.rate >= 0.5 ? 'risk' : 'off';
  else if (thisWeek.done >= thisWeek.target) status = 'on';

  return { days, thisWeek, weeks, last4, overall: summarize(weeks), status };
}

// ---------- Jahresziele ----------

const SEVERITY: Status[] = ['off', 'risk', 'on'];

interface GoalSources {
  milestones: Milestone[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
}

export function goalInfo(goal: Goal, data: GoalSources, today: string) {
  // Meilensteine und Gewohnheiten zahlen gleichberechtigt auf das Jahresziel ein.
  const items = [
    ...data.milestones
      .filter((m) => m.goalId === goal.id)
      .map((m) => {
        const info = milestoneInfo(m, data.tasks, today);
        return { progress: info.progress as number | null, status: info.status };
      }),
    ...data.habits
      .filter((h) => h.goalId === goal.id)
      .map((h) => {
        const info = habitInfo(h, data.habitLogs, today);
        return { progress: info.last4?.rate ?? null, status: info.status };
      }),
  ];
  if (!items.length) return { progress: 0, status: 'none' as Status, count: 0 };

  const measured = items.map((i) => i.progress).filter((p): p is number => p !== null);
  const progress = measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : 0;
  // Ein Jahresziel ist nur so gut auf Kurs wie sein schwächster aktiver Baustein.
  const worst = SEVERITY.find((s) => items.some((i) => i.status === s));
  const status: Status = worst ?? (items.some((i) => i.status === 'planned') ? 'planned' : 'achieved');
  return { progress, status, count: items.length };
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;
