// Werkzeuge, die Claude über MCP nutzen kann. Status und Regeln kommen aus demselben Code wie in der App.
import { randomBytes } from 'node:crypto';
import type { Data, Goal, Habit, HabitLog, Metric, Milestone, Review, Task } from '../src/lib/types.ts';
import { HABIT_LABEL, STATUS_LABEL, countWeek, goalInfo, habitInfo, habitTarget, milestoneInfo, type HabitSummary } from '../src/lib/progress.ts';
import { addDays, fmtLong, isoWeek, startOfWeek, todayKey, weekDays, weekKey } from '../src/lib/dates.ts';
import { GOAL_COLORS, MAX_TOP, MILESTONE_DAYS, sortTasks } from '../src/lib/rules.ts';
import { applySync, readAll } from './db.ts';

/** Fehler, die Claude als Tool-Ergebnis sehen soll – mit einem Hinweis, wie es richtig geht. */
export class ToolError extends Error {}

type Args = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (args: Args) => unknown;
}

const uid = () => randomBytes(6).toString('base64url');
const pct = (v: number) => Math.round(v * 100);
const LIST_LIMIT = 150;

// ---------- Eingaben ----------

const has = (args: Args, key: string) => args[key] !== undefined;

function text(args: Args, key: string, required = false): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) {
    if (required) throw new ToolError(`"${key}" fehlt.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ToolError(`"${key}" muss ein Text sein.`);
  if (required && !v.trim()) throw new ToolError(`"${key}" darf nicht leer sein.`);
  return v.trim();
}

function date(v: unknown, key: string) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ToolError(`"${key}" muss ein Datum im Format YYYY-MM-DD sein.`);
  }
  return v;
}

function int(v: unknown, key: string, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new ToolError(`"${key}" muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  }
  return v;
}

function amount(v: unknown, key: string, positive = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (positive && v === 0)) {
    throw new ToolError(`"${key}" muss eine Zahl ${positive ? 'größer 0' : 'ab 0'} sein.`);
  }
  return v;
}

function bool(v: unknown, key: string) {
  if (typeof v !== 'boolean') throw new ToolError(`"${key}" muss true oder false sein.`);
  return v;
}

function find<T extends { id: string }>(list: T[], id: unknown, what: string): T {
  const item = typeof id === 'string' ? list.find((x) => x.id === id) : undefined;
  if (!item) throw new ToolError(`${what} mit id "${String(id)}" nicht gefunden. Gültige IDs liefern get_overview und list_tasks.`);
  return item;
}

const save = (collection: keyof Data, entity: Goal | Milestone | Habit | HabitLog | Task | Review) =>
  applySync({ upsert: { [collection]: [entity] } });
const topCount = (data: Data, day: string, exceptId?: string) => data.tasks.filter((t) => t.date === day && t.top && t.id !== exceptId).length;
const byDate = (a: Task, b: Task) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || sortTasks(a, b);

// ---------- Ausgaben ----------

function taskOut(t: Task, data: Data) {
  const m = t.milestoneId ? data.milestones.find((x) => x.id === t.milestoneId) : undefined;
  return {
    id: t.id,
    title: t.title,
    date: t.date,
    top3: t.top,
    done: t.done,
    milestone: m ? { id: m.id, title: `${m.emoji} ${m.title}` } : null,
  };
}

function milestoneOut(m: Milestone, data: Data, today: string) {
  const info = milestoneInfo(m, data.tasks, today);
  const open = data.tasks.filter((t) => t.milestoneId === m.id && !t.done).sort(byDate);
  return {
    id: m.id,
    title: m.title,
    emoji: m.emoji,
    goal_id: m.goalId,
    start: m.start,
    due: m.due,
    status: STATUS_LABEL[info.status],
    progress_pct: pct(info.progress),
    time_elapsed_pct: pct(info.elapsed),
    progress_by: m.metric
      ? { metric: `${m.metric.current} / ${m.metric.target} ${m.metric.unit}`.trim() }
      : { tasks: `${info.done} / ${info.total} erledigt` },
    open_tasks: open.length,
    next_steps: open.slice(0, 3).map((t) => ({ id: t.id, title: t.title, date: t.date })),
    ...(m.obstacle && { obstacle: m.obstacle }),
    ...(m.plan && { if_then: m.plan }),
  };
}

function habitOut(h: Habit, data: Data, today: string) {
  const info = habitInfo(h, data.habitLogs, today);
  const summary = (s: HabitSummary | null) =>
    s ? { fulfillment_pct: pct(s.rate), weeks_met: `${s.met} von ${s.weeks}` } : 'noch keine abgeschlossene Woche';
  return {
    id: h.id,
    title: h.title,
    emoji: h.emoji,
    goal_id: h.goalId,
    per_week_min: h.perWeek,
    since: h.start,
    status: HABIT_LABEL[info.status],
    this_week: `${info.thisWeek.done} von ${info.thisWeek.target}`,
    done_today: info.days.has(today),
    last_4_weeks: summary(info.last4),
    overall: summary(info.overall),
  };
}

// ---------- Schemas ----------

const S = {
  id: { type: 'string' },
  date: { type: 'string', description: 'YYYY-MM-DD' },
  nullableDate: { type: ['string', 'null'], description: 'YYYY-MM-DD, null = ohne Datum (unverplant)' },
  text: { type: 'string' },
};

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

// ---------- Werkzeuge ----------

export const TOOLS: Tool[] = [
  {
    name: 'get_overview',
    title: 'Überblick',
    description:
      'Gesamtstand: Jahresziele mit ihren Meilensteinen (Status, Fortschritt, nächste Schritte) und Gewohnheiten (Wochenziel, Stand diese Woche, Bewertung letzte 4 Wochen und gesamt), die Aufgaben von heute sowie Anzahl überfälliger und unverplanter Aufgaben. Gute erste Abfrage, um IDs und Kontext zu bekommen.',
    inputSchema: object({ year: { type: 'integer', description: 'Jahr der Ziele, Standard: aktuelles Jahr' } }),
    annotations: { readOnlyHint: true },
    run: (args) => {
      const data = readAll();
      const today = todayKey();
      const year = has(args, 'year') ? int(args.year, 'year', 2000, 2100) : Number(today.slice(0, 4));
      return {
        today: { date: today, label: fmtLong(today), week: weekKey(today) },
        goals: data.goals
          .filter((g) => g.year === year)
          .map((g) => {
            const info = goalInfo(g, data, today);
            return {
              id: g.id,
              title: g.title,
              emoji: g.emoji,
              why: g.why,
              status: STATUS_LABEL[info.status],
              progress_pct: pct(info.progress),
              milestones: data.milestones
                .filter((m) => m.goalId === g.id)
                .sort((a, b) => a.due.localeCompare(b.due))
                .map((m) => milestoneOut(m, data, today)),
              habits: data.habits.filter((h) => h.goalId === g.id).map((h) => habitOut(h, data, today)),
            };
          }),
        today_tasks: data.tasks.filter((t) => t.date === today).sort(sortTasks).map((t) => taskOut(t, data)),
        overdue_count: data.tasks.filter((t) => !t.done && t.date !== null && t.date < today).length,
        unscheduled_count: data.tasks.filter((t) => !t.done && t.date === null).length,
      };
    },
  },
  {
    name: 'list_tasks',
    title: 'Aufgaben auflisten',
    description:
      'Listet Aufgaben gefiltert auf. Ohne Filter: alle offenen Aufgaben. "unscheduled" = Aufgaben ohne Datum, "overdue" = offen und Datum in der Vergangenheit.',
    inputSchema: object({
      date: { ...S.date, description: 'Nur dieser Tag (YYYY-MM-DD)' },
      from: { ...S.date, description: 'Zeitraum ab (YYYY-MM-DD)' },
      to: { ...S.date, description: 'Zeitraum bis einschließlich (YYYY-MM-DD)' },
      status: { type: 'string', enum: ['open', 'done', 'all', 'overdue', 'unscheduled'], description: 'Standard: open' },
      milestone_id: { ...S.id, description: 'Nur Aufgaben dieses Meilensteins' },
    }),
    annotations: { readOnlyHint: true },
    run: (args) => {
      const data = readAll();
      const today = todayKey();
      const status = text(args, 'status') ?? 'open';
      let list = data.tasks;

      if (has(args, 'date')) {
        const day = date(args.date, 'date');
        list = list.filter((t) => t.date === day);
      } else if (has(args, 'from') || has(args, 'to')) {
        const from = has(args, 'from') ? date(args.from, 'from') : '0000-00-00';
        const to = has(args, 'to') ? date(args.to, 'to') : '9999-99-99';
        list = list.filter((t) => t.date !== null && t.date >= from && t.date <= to);
      }

      if (status === 'open') list = list.filter((t) => !t.done);
      else if (status === 'done') list = list.filter((t) => t.done);
      else if (status === 'overdue') list = list.filter((t) => !t.done && t.date !== null && t.date < today);
      else if (status === 'unscheduled') list = list.filter((t) => !t.done && t.date === null);
      else if (status !== 'all') throw new ToolError('"status" muss open, done, all, overdue oder unscheduled sein.');

      if (has(args, 'milestone_id')) {
        const m = find(data.milestones, args.milestone_id, 'Meilenstein');
        list = list.filter((t) => t.milestoneId === m.id);
      }

      const sorted = [...list].sort(byDate);
      return {
        count: sorted.length,
        tasks: sorted.slice(0, LIST_LIMIT).map((t) => taskOut(t, data)),
        ...(sorted.length > LIST_LIMIT && { note: `Nur die ersten ${LIST_LIMIT} – Filter enger setzen.` }),
      };
    },
  },
  {
    name: 'get_week',
    title: 'Woche ansehen',
    description:
      'Wochenplan Montag bis Sonntag: Aufgaben pro Tag, welche aktiven Meilensteine diese Woche Schritte haben (steps_this_week = 0 heißt: nichts geplant), Gewohnheiten mit erledigten Tagen gegenüber dem Wochenziel, was erledigt wurde und den gespeicherten Wochenrückblick. Grundlage für Wochenplanung und Wochenrückblick.',
    inputSchema: object({ date: { ...S.date, description: 'Irgendein Tag der Woche, Standard: heute' } }),
    annotations: { readOnlyHint: true },
    run: (args) => {
      const data = readAll();
      const today = todayKey();
      const days = weekDays(has(args, 'date') ? date(args.date, 'date') : today);
      const [first, last] = [days[0], days[6]];
      const inWeek = data.tasks.filter((t) => t.date !== null && t.date >= first && t.date <= last);
      const review = data.reviews.find((r) => r.week === weekKey(first));

      return {
        week: weekKey(first),
        label: `KW ${isoWeek(first).week}`,
        from: first,
        to: last,
        days: days.map((d) => ({
          date: d,
          label: fmtLong(d),
          tasks: inWeek.filter((t) => t.date === d).sort(sortTasks).map((t) => taskOut(t, data)),
        })),
        alignment: `${inWeek.filter((t) => t.milestoneId).length} von ${inWeek.length} Aufgaben zahlen auf einen Meilenstein ein`,
        milestones: data.milestones
          .filter((m) => m.start <= last && m.due >= first)
          .map((m) => ({ m, info: milestoneInfo(m, data.tasks, today) }))
          .filter(({ info }) => info.status !== 'achieved')
          .map(({ m, info }) => ({
            id: m.id,
            title: `${m.emoji} ${m.title}`,
            status: STATUS_LABEL[info.status],
            progress_pct: pct(info.progress),
            steps_this_week: inWeek.filter((t) => t.milestoneId === m.id).length,
          })),
        habits: data.habits
          .filter((h) => h.start <= last)
          .map((h) => {
            const info = habitInfo(h, data.habitLogs, today);
            const done = countWeek(info.days, first);
            const target = habitTarget(h, first);
            return {
              id: h.id,
              title: `${h.emoji} ${h.title}`,
              done_days: days.filter((d) => info.days.has(d)),
              done,
              target_min: target,
              met: done >= target,
            };
          }),
        done_this_week: data.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= first && t.doneAt <= last).map((t) => t.title),
        unscheduled_count: data.tasks.filter((t) => !t.done && t.date === null).length,
        review: review ? { good: review.good, blocked: review.blocked, change: review.change } : null,
      };
    },
  },
  {
    name: 'create_task',
    title: 'Aufgabe anlegen',
    description:
      'Legt eine Aufgabe für einen Tag an. Ohne Datum landet sie in "Unverplant". Pro Tag sind höchstens 3 Top-Aufgaben erlaubt. Wenn möglich, mit milestone_id einem Meilenstein zuordnen.',
    inputSchema: object(
      {
        title: S.text,
        date: S.nullableDate,
        milestone_id: { type: ['string', 'null'] },
        top: { type: 'boolean', description: 'Als Top-3-Aufgabe des Tages markieren' },
      },
      ['title'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (args) => {
      const data = readAll();
      const day = has(args, 'date') && args.date !== null ? date(args.date, 'date') : null;
      const milestoneId = has(args, 'milestone_id') && args.milestone_id !== null ? find(data.milestones, args.milestone_id, 'Meilenstein').id : null;

      let top = has(args, 'top') && bool(args.top, 'top');
      let note: string | undefined;
      if (top && !day) throw new ToolError('Top-3-Aufgaben brauchen ein Datum.');
      if (top && topCount(data, day!) >= MAX_TOP) {
        top = false;
        note = `${day} hat schon ${MAX_TOP} Top-Aufgaben – als normale Aufgabe angelegt.`;
      }

      const task: Task = {
        id: uid(),
        title: text(args, 'title', true)!,
        milestoneId,
        date: day,
        top,
        done: false,
        doneAt: null,
        createdAt: Date.now(),
      };
      save('tasks', task);
      return { created: taskOut(task, data), ...(note && { note }) };
    },
  },
  {
    name: 'update_task',
    title: 'Aufgabe ändern',
    description:
      'Ändert eine Aufgabe: abhaken (done), verschieben (date; null = zurück nach Unverplant), Titel, Meilenstein, Top 3. Nur angegebene Felder werden geändert. Beim Verschieben auf einen anderen Tag fällt die Top-3-Markierung weg, außer top wird mitgesetzt.',
    inputSchema: object(
      {
        id: S.id,
        title: S.text,
        date: S.nullableDate,
        milestone_id: { type: ['string', 'null'] },
        top: { type: 'boolean' },
        done: { type: 'boolean' },
      },
      ['id'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (args) => {
      const data = readAll();
      const task = find(data.tasks, args.id, 'Aufgabe');
      const next: Task = { ...task };

      if (has(args, 'title')) next.title = text(args, 'title', true)!;
      if (has(args, 'date')) {
        const day = args.date === null ? null : date(args.date, 'date');
        if (day !== task.date) {
          next.date = day;
          next.top = false;
        }
      }
      if (has(args, 'milestone_id')) {
        next.milestoneId = args.milestone_id === null ? null : find(data.milestones, args.milestone_id, 'Meilenstein').id;
      }
      if (has(args, 'done')) {
        next.done = bool(args.done, 'done');
        next.doneAt = next.done ? (task.doneAt ?? todayKey()) : null;
      }
      if (has(args, 'top')) {
        const top = bool(args.top, 'top');
        if (top && !next.date) throw new ToolError('Top-3-Aufgaben brauchen ein Datum.');
        if (top && !next.top && topCount(data, next.date!, task.id) >= MAX_TOP) {
          throw new ToolError(`${next.date} hat schon ${MAX_TOP} Top-Aufgaben. Erst eine davon mit top=false herausnehmen.`);
        }
        next.top = top;
      }

      save('tasks', next);
      return { updated: taskOut(next, data) };
    },
  },
  {
    name: 'create_goal',
    title: 'Jahresziel anlegen',
    description: 'Legt ein Jahresziel (Lebensbereich mit Warum) an. Die Methode empfiehlt höchstens drei pro Jahr.',
    inputSchema: object(
      {
        title: S.text,
        why: { type: 'string', description: 'Warum ist das wichtig?' },
        emoji: { type: 'string' },
        year: { type: 'integer', description: 'Standard: aktuelles Jahr' },
      },
      ['title'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (args) => {
      const data = readAll();
      const goal: Goal = {
        id: uid(),
        title: text(args, 'title', true)!,
        emoji: text(args, 'emoji') || '🎯',
        why: text(args, 'why') ?? '',
        year: has(args, 'year') ? int(args.year, 'year', 2000, 2100) : Number(todayKey().slice(0, 4)),
        color: GOAL_COLORS[data.goals.length % GOAL_COLORS.length],
        createdAt: Date.now(),
      };
      save('goals', goal);
      const count = data.goals.filter((g) => g.year === goal.year).length + 1;
      return {
        created: { id: goal.id, title: goal.title, emoji: goal.emoji, why: goal.why, year: goal.year },
        ...(count > 3 && { note: `Das ist Jahresziel Nr. ${count} für ${goal.year} – die Methode empfiehlt höchstens drei.` }),
      };
    },
  },
  {
    name: 'update_goal',
    title: 'Jahresziel ändern',
    description: 'Ändert Titel, Warum, Emoji oder Jahr eines Jahresziels. Nur angegebene Felder werden geändert.',
    inputSchema: object({ id: S.id, title: S.text, why: S.text, emoji: S.text, year: { type: 'integer' } }, ['id']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (args) => {
      const data = readAll();
      const goal = { ...find(data.goals, args.id, 'Jahresziel') };
      if (has(args, 'title')) goal.title = text(args, 'title', true)!;
      if (has(args, 'why')) goal.why = text(args, 'why') ?? '';
      if (has(args, 'emoji')) goal.emoji = text(args, 'emoji') || goal.emoji;
      if (has(args, 'year')) goal.year = int(args.year, 'year', 2000, 2100);
      save('goals', goal);
      return { updated: { id: goal.id, title: goal.title, emoji: goal.emoji, why: goal.why, year: goal.year } };
    },
  },
  {
    name: 'create_milestone',
    title: 'Meilenstein anlegen',
    description:
      'Legt einen Meilenstein unter einem Jahresziel an: ein messbares Ergebnis in 4–12 Wochen (Standard: ab heute 12 Wochen). Mit metric_target wird der Fortschritt über einen Messwert gezählt (z. B. 24 Bücher), sonst über erledigte Aufgaben. obstacle und if_then bilden den Wenn-dann-Plan (WOOP).',
    inputSchema: object(
      {
        goal_id: S.id,
        title: S.text,
        emoji: S.text,
        start: S.date,
        due: S.date,
        metric_target: { type: 'number', description: 'Zielwert, z. B. 10' },
        metric_unit: { type: 'string', description: 'Einheit, z. B. Bewerbungen' },
        metric_current: { type: 'number', description: 'Aktueller Stand, Standard 0' },
        obstacle: { type: 'string', description: 'Was könnte aufhalten?' },
        if_then: { type: 'string', description: 'Wenn das passiert, dann …' },
      },
      ['goal_id', 'title'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (args) => {
      const data = readAll();
      const goal = find(data.goals, args.goal_id, 'Jahresziel');
      const start = has(args, 'start') ? date(args.start, 'start') : todayKey();
      const due = has(args, 'due') ? date(args.due, 'due') : addDays(start, MILESTONE_DAYS - 1);
      if (due < start) throw new ToolError('"due" liegt vor "start".');
      const metric: Metric | null = has(args, 'metric_target')
        ? {
            target: amount(args.metric_target, 'metric_target', true),
            current: has(args, 'metric_current') ? amount(args.metric_current, 'metric_current') : 0,
            unit: text(args, 'metric_unit') ?? '',
          }
        : null;

      const milestone: Milestone = {
        id: uid(),
        goalId: goal.id,
        title: text(args, 'title', true)!,
        emoji: text(args, 'emoji') || '🏁',
        start,
        due,
        metric,
        obstacle: text(args, 'obstacle') ?? '',
        plan: text(args, 'if_then') ?? '',
        achieved: false,
        createdAt: Date.now(),
      };
      save('milestones', milestone);
      return { created: milestoneOut(milestone, data, todayKey()) };
    },
  },
  {
    name: 'update_milestone',
    title: 'Meilenstein ändern',
    description:
      'Ändert einen Meilenstein, z. B. Fortschritt eintragen (metric_current), Deadline verschieben, Wenn-dann-Plan ergänzen oder als erreicht markieren. remove_metric=true stellt auf Fortschritt über Aufgaben um. Nur angegebene Felder werden geändert.',
    inputSchema: object(
      {
        id: S.id,
        title: S.text,
        emoji: S.text,
        goal_id: S.id,
        start: S.date,
        due: S.date,
        metric_current: { type: 'number' },
        metric_target: { type: 'number' },
        metric_unit: S.text,
        remove_metric: { type: 'boolean' },
        obstacle: S.text,
        if_then: S.text,
        achieved: { type: 'boolean' },
      },
      ['id'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (args) => {
      const data = readAll();
      const current = find(data.milestones, args.id, 'Meilenstein');
      const next: Milestone = { ...current, metric: current.metric && { ...current.metric } };

      if (has(args, 'title')) next.title = text(args, 'title', true)!;
      if (has(args, 'emoji')) next.emoji = text(args, 'emoji') || next.emoji;
      if (has(args, 'goal_id')) next.goalId = find(data.goals, args.goal_id, 'Jahresziel').id;
      if (has(args, 'start')) next.start = date(args.start, 'start');
      if (has(args, 'due')) next.due = date(args.due, 'due');
      if (next.due < next.start) throw new ToolError('"due" liegt vor "start".');

      if (has(args, 'remove_metric') && bool(args.remove_metric, 'remove_metric')) {
        next.metric = null;
      } else if (has(args, 'metric_current') || has(args, 'metric_target') || has(args, 'metric_unit')) {
        const metric = next.metric ?? { current: 0, target: 0, unit: '' };
        if (has(args, 'metric_target')) metric.target = amount(args.metric_target, 'metric_target', true);
        if (has(args, 'metric_current')) metric.current = amount(args.metric_current, 'metric_current');
        if (has(args, 'metric_unit')) metric.unit = text(args, 'metric_unit') ?? '';
        if (!(metric.target > 0)) throw new ToolError('Für einen Messwert wird metric_target (> 0) gebraucht.');
        next.metric = metric;
      }
      if (has(args, 'obstacle')) next.obstacle = text(args, 'obstacle') ?? '';
      if (has(args, 'if_then')) next.plan = text(args, 'if_then') ?? '';
      if (has(args, 'achieved')) next.achieved = bool(args.achieved, 'achieved');

      save('milestones', next);
      return { updated: milestoneOut(next, data, todayKey()) };
    },
  },
  {
    name: 'delete_item',
    title: 'Löschen',
    description:
      'Löscht eine Aufgabe, einen Meilenstein, eine Gewohnheit (mit ihrem Verlauf) oder ein Jahresziel. Beim Löschen eines Jahresziels verschwinden auch seine Meilensteine und Gewohnheiten; Aufgaben bleiben immer erhalten (ohne Zuordnung). Vorher beim Nutzer nachfragen.',
    inputSchema: object({ kind: { type: 'string', enum: ['task', 'milestone', 'habit', 'goal'] }, id: S.id }, ['kind', 'id']),
    annotations: { readOnlyHint: false, destructiveHint: true },
    run: (args) => {
      const data = readAll();
      if (args.kind === 'task') {
        const task = find(data.tasks, args.id, 'Aufgabe');
        applySync({ delete: { tasks: [task.id] } });
        return { deleted: `Aufgabe „${task.title}“` };
      }
      if (args.kind === 'milestone') {
        const m = find(data.milestones, args.id, 'Meilenstein');
        const linked = data.tasks.filter((t) => t.milestoneId === m.id).length;
        applySync({ delete: { milestones: [m.id] } });
        return { deleted: `Meilenstein „${m.title}“`, ...(linked && { note: `${linked} Aufgaben bleiben erhalten, jetzt ohne Meilenstein.` }) };
      }
      if (args.kind === 'habit') {
        const h = find(data.habits, args.id, 'Gewohnheit');
        applySync({ delete: { habits: [h.id] } }); // Verlauf fällt per Fremdschlüssel mit weg
        return { deleted: `Gewohnheit „${h.title}“ mit ihrem Verlauf` };
      }
      if (args.kind === 'goal') {
        const g = find(data.goals, args.id, 'Jahresziel');
        const milestoneCount = data.milestones.filter((m) => m.goalId === g.id).length;
        const habitCount = data.habits.filter((h) => h.goalId === g.id).length;
        applySync({ delete: { goals: [g.id] } });
        return {
          deleted: `Jahresziel „${g.title}“ mit ${milestoneCount} Meilensteinen und ${habitCount} Gewohnheiten`,
          note: 'Zugehörige Aufgaben bleiben erhalten, ohne Zuordnung.',
        };
      }
      throw new ToolError('"kind" muss task, milestone, habit oder goal sein.');
    },
  },
  {
    name: 'create_habit',
    title: 'Gewohnheit anlegen',
    description:
      'Legt eine Gewohnheit unter einem Jahresziel an: wiederkehrendes Verhalten mit Mindest-Wochenziel, z. B. Krafttraining mindestens 3× pro Woche (mehr ist gut). Zahlt wie ein Meilenstein auf das Jahresziel ein. Bewertet werden abgeschlossene Wochen.',
    inputSchema: object(
      {
        goal_id: S.id,
        title: S.text,
        per_week: { type: 'integer', description: 'Mindestens so oft pro Woche (1–7)' },
        emoji: S.text,
        start: { ...S.date, description: 'Ab wann gezählt wird, Standard: heute' },
      },
      ['goal_id', 'title', 'per_week'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (args) => {
      const data = readAll();
      const goal = find(data.goals, args.goal_id, 'Jahresziel');
      const habit: Habit = {
        id: uid(),
        goalId: goal.id,
        title: text(args, 'title', true)!,
        emoji: text(args, 'emoji') || '🔁',
        perWeek: int(args.per_week, 'per_week', 1, 7),
        start: has(args, 'start') ? date(args.start, 'start') : todayKey(),
        createdAt: Date.now(),
      };
      save('habits', habit);
      return { created: habitOut(habit, readAll(), todayKey()) };
    },
  },
  {
    name: 'update_habit',
    title: 'Gewohnheit ändern',
    description: 'Ändert Titel, Emoji, Wochenziel (per_week), Jahresziel oder Startdatum einer Gewohnheit. Nur angegebene Felder werden geändert.',
    inputSchema: object({ id: S.id, title: S.text, emoji: S.text, per_week: { type: 'integer' }, goal_id: S.id, start: S.date }, ['id']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (args) => {
      const data = readAll();
      const habit = { ...find(data.habits, args.id, 'Gewohnheit') };
      if (has(args, 'title')) habit.title = text(args, 'title', true)!;
      if (has(args, 'emoji')) habit.emoji = text(args, 'emoji') || habit.emoji;
      if (has(args, 'per_week')) habit.perWeek = int(args.per_week, 'per_week', 1, 7);
      if (has(args, 'goal_id')) habit.goalId = find(data.goals, args.goal_id, 'Jahresziel').id;
      if (has(args, 'start')) habit.start = date(args.start, 'start');
      save('habits', habit);
      return { updated: habitOut(habit, readAll(), todayKey()) };
    },
  },
  {
    name: 'log_habit',
    title: 'Gewohnheit eintragen',
    description:
      'Trägt eine Gewohnheit für einen Tag als erledigt ein (Standard: heute) oder nimmt den Eintrag mit done=false wieder weg. Pro Tag zählt ein Eintrag. Gibt den neuen Wochenstand zurück.',
    inputSchema: object(
      {
        habit_id: S.id,
        date: { ...S.date, description: 'Standard: heute' },
        done: { type: 'boolean', description: 'Standard: true' },
      },
      ['habit_id'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (args) => {
      const data = readAll();
      const today = todayKey();
      const habit = find(data.habits, args.habit_id, 'Gewohnheit');
      const day = has(args, 'date') ? date(args.date, 'date') : today;
      if (day > today) throw new ToolError('Gewohnheiten lassen sich nicht im Voraus eintragen.');
      if (day < habit.start) throw new ToolError(`Die Gewohnheit wird erst ab ${habit.start} gezählt.`);
      const id = `${habit.id}:${day}`;
      if (!has(args, 'done') || bool(args.done, 'done')) save('habitLogs', { id, habitId: habit.id, date: day });
      else applySync({ delete: { habitLogs: [id] } });

      const fresh = readAll();
      const info = habitInfo(habit, fresh.habitLogs, today);
      const week = startOfWeek(day);
      return {
        habit: `${habit.emoji} ${habit.title}`,
        date: day,
        done: info.days.has(day),
        week_of_date: `${countWeek(info.days, week)} von ${habitTarget(habit, week)}`,
        status: HABIT_LABEL[info.status],
      };
    },
  },
  {
    name: 'save_review',
    title: 'Wochenrückblick speichern',
    description:
      'Speichert den Wochenrückblick (drei Reflexionsfragen) für die Woche, in der week_of liegt (Standard: diese Woche). Nicht angegebene Felder bleiben, wie sie sind.',
    inputSchema: object({
      week_of: { ...S.date, description: 'Irgendein Tag der Woche, Standard: heute' },
      good: { type: 'string', description: 'Was lief gut?' },
      blocked: { type: 'string', description: 'Was hat aufgehalten?' },
      change: { type: 'string', description: 'Was wird nächste Woche anders?' },
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (args) => {
      const data = readAll();
      const week = weekKey(has(args, 'week_of') ? date(args.week_of, 'week_of') : todayKey());
      const old = data.reviews.find((r) => r.week === week);
      const review: Review = {
        week,
        good: text(args, 'good') ?? old?.good ?? '',
        blocked: text(args, 'blocked') ?? old?.blocked ?? '',
        change: text(args, 'change') ?? old?.change ?? '',
        savedAt: Date.now(),
      };
      save('reviews', review);
      return { saved: { week: review.week, good: review.good, blocked: review.blocked, change: review.change } };
    },
  },
];
