import { Check, Repeat } from 'lucide-react';
import type { Habit } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { HABIT_LABEL, countWeek, habitInfo, habitTarget, pct, type HabitInfo, type HabitWeek } from '../lib/progress';
import { fmtShort, fmtWeekday, isoWeek, startOfWeek, todayKey, weekDays } from '../lib/dates';
import { SectionTitle, StatusChip, cls } from './ui';

/** Sieben Tage einer Woche zum Abhaken. Zukunft und Tage vor dem Start sind gesperrt. */
export function HabitDots({ habit, weekStart, days, labels }: { habit: Habit; weekStart: string; days: Set<string>; labels?: boolean }) {
  const toggle = useStore((s) => s.toggleHabitDay);
  const today = todayKey();
  return (
    <div className="hdots">
      {weekDays(weekStart).map((d) => {
        const on = days.has(d);
        return (
          <button
            key={d}
            type="button"
            className={cls('hdot', on && 'is-on', d === today && 'is-today')}
            disabled={d > today || d < habit.start}
            aria-pressed={on}
            aria-label={`${habit.title} am ${fmtWeekday(d)}, ${fmtShort(d)}`}
            title={`${fmtWeekday(d)}, ${fmtShort(d)}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle(habit.id, d);
            }}
          >
            {on ? <Check size={12} strokeWidth={3} /> : labels && fmtWeekday(d)}
          </button>
        );
      })}
    </div>
  );
}

const weekClass = (w: HabitWeek) => (w.done >= w.target ? 's-on' : w.rate >= 0.5 ? 's-risk' : 's-off');

/** Verlauf: ein Kästchen pro Woche mit der Anzahl, das letzte ist die laufende Woche. */
export function HabitStrip({ info, weeks = 12 }: { info: HabitInfo; weeks?: number }) {
  const { thisWeek } = info;
  return (
    <div className="hstrip">
      {info.weeks.slice(-(weeks - 1)).map((w) => (
        <span key={w.start} className={cls('hcell', weekClass(w))} title={`KW ${isoWeek(w.start).week}: ${w.done} von ${w.target}`}>
          {w.done}
        </span>
      ))}
      <span
        className={cls('hcell is-current', thisWeek.done >= thisWeek.target && 's-on')}
        title={`Diese Woche: ${thisWeek.done} von ${thisWeek.target}`}
      >
        {thisWeek.done}
      </span>
    </div>
  );
}

/** Die kleine Bewertung: Erfüllung über die letzten 4 Wochen und den ganzen Zeitraum. */
export function HabitScore({ info }: { info: HabitInfo }) {
  const row = (label: string, summary: HabitInfo['last4']) => (
    <div className="hscore-row">
      <span className="hscore-label">{label}</span>
      {summary ? (
        <>
          <strong className="hscore-value">{pct(summary.rate)}</strong>
          <span className="muted">
            {summary.met} von {summary.weeks} {summary.weeks === 1 ? 'Woche' : 'Wochen'} geschafft
          </span>
        </>
      ) : (
        <span className="muted hscore-empty">Noch keine abgeschlossene Woche</span>
      )}
    </div>
  );
  return (
    <div className="hscore">
      {row('Letzte 4 Wochen', info.last4)}
      {row('Gesamt', info.overall)}
    </div>
  );
}

export const scoreLine = (info: HabitInfo) =>
  info.last4 && info.overall ? `Letzte 4 Wochen ${pct(info.last4.rate)} · Gesamt ${pct(info.overall.rate)}` : 'Erste Woche läuft';

function WeekCount({ done, target }: { done: number; target: number }) {
  const met = done >= target;
  return (
    <span className={cls('habit-count', met && 'is-met')}>
      {met && <Check size={12} strokeWidth={3} />}
      {done}/{target}
    </span>
  );
}

export function HabitCard({ habit, info }: { habit: Habit; info: HabitInfo }) {
  const open = useUI((s) => s.open);
  return (
    <button type="button" className="card habit-card" onClick={() => open({ kind: 'habit', id: habit.id })}>
      <div className="card-title">
        <span className="card-emoji">{habit.emoji}</span>
        <span>{habit.title || 'Ohne Titel'}</span>
      </div>
      <div className="card-meta">
        mind. {habit.perWeek}× pro Woche · diese Woche {info.thisWeek.done}/{info.thisWeek.target}
      </div>
      <HabitStrip info={info} weeks={10} />
      <div className="card-meta">{scoreLine(info)}</div>
      <div className="card-foot">
        <StatusChip status={info.status} label={HABIT_LABEL[info.status]} />
      </div>
    </button>
  );
}

/** Heute: abhaken für den angezeigten Tag, daneben der Wochenstand. */
export function HabitsToday({ date }: { date: string }) {
  const habits = useStore((s) => s.habits);
  const logs = useStore((s) => s.habitLogs);
  const toggle = useStore((s) => s.toggleHabitDay);
  const open = useUI((s) => s.open);
  const today = todayKey();
  const active = habits.filter((h) => h.start <= date);
  if (!active.length) return null;
  const weekStart = startOfWeek(date);

  return (
    <section>
      <SectionTitle icon={<Repeat size={15} />} aside={<span className="section-aside">Stand diese Woche</span>}>
        Gewohnheiten
      </SectionTitle>
      <div className="habit-list">
        {active.map((h) => {
          const info = habitInfo(h, logs, today);
          const on = info.days.has(date);
          return (
            <div key={h.id} className={cls('habit-row', on && 'is-on')}>
              <button
                type="button"
                className="habit-toggle"
                aria-pressed={on}
                aria-label={on ? `${h.title}: Haken entfernen` : `${h.title} erledigt`}
                disabled={date > today}
                onClick={() => toggle(h.id, date)}
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <button type="button" className="habit-name" onClick={() => open({ kind: 'habit', id: h.id })}>
                <span>{h.emoji}</span>
                <span className="clip">{h.title || 'Ohne Titel'}</span>
              </button>
              <WeekCount done={countWeek(info.days, weekStart)} target={habitTarget(h, weekStart)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Woche: pro Gewohnheit eine Zeile mit sieben Tagen und dem Stand gegenüber dem Ziel. */
export function HabitsWeek({ weekStart }: { weekStart: string }) {
  const habits = useStore((s) => s.habits);
  const logs = useStore((s) => s.habitLogs);
  const open = useUI((s) => s.open);
  const today = todayKey();
  const days = weekDays(weekStart);
  const active = habits.filter((h) => h.start <= days[6]);
  if (!active.length) return null;

  return (
    <section className="section">
      <SectionTitle icon={<Repeat size={15} />} aside={<span className="section-aside">Mindestens-Ziel pro Woche – mehr ist gut</span>}>
        Gewohnheiten
      </SectionTitle>
      <div className="htable">
        <div className="htable-row htable-head" aria-hidden="true">
          <span />
          <div className="hdots">
            {days.map((d) => (
              <span key={d} className={cls('hdot-label', d === today && 'is-today')}>
                {fmtWeekday(d)}
              </span>
            ))}
          </div>
          <span />
        </div>
        {active.map((h) => {
          const info = habitInfo(h, logs, today);
          return (
            <div key={h.id} className="htable-row">
              <button type="button" className="htable-name" onClick={() => open({ kind: 'habit', id: h.id })}>
                <span>{h.emoji}</span>
                <span className="clip">{h.title || 'Ohne Titel'}</span>
                <span className="muted">mind. {h.perWeek}×</span>
              </button>
              <HabitDots habit={h} weekStart={weekStart} days={info.days} />
              <WeekCount done={countWeek(info.days, weekStart)} target={habitTarget(h, weekStart)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
