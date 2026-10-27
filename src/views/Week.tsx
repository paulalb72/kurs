import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flag, Inbox, NotebookPen, Plus } from 'lucide-react';
import type { Goal, Task } from '../lib/types';
import { sortTasks, useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { useDrop } from '../lib/dnd';
import { milestoneInfo } from '../lib/progress';
import { addDays, fmtShort, fmtWeekday, fromKey, isoWeek, todayKey, weekDays, weekKey } from '../lib/dates';
import { QuickAdd } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { HabitsWeek } from '../components/Habits';
import { ProgressBar, SectionTitle, cls, goalColor } from '../components/ui';

export function Week() {
  const anchor = useUI((s) => s.week);
  const setWeek = useUI((s) => s.setWeek);
  const showModal = useUI((s) => s.showModal);
  const open = useUI((s) => s.open);
  const tasks = useStore((s) => s.tasks);
  const milestones = useStore((s) => s.milestones);
  const goals = useStore((s) => s.goals);
  const reviews = useStore((s) => s.reviews);

  const today = todayKey();
  const days = weekDays(anchor);
  const [first, last] = [days[0], days[6]];
  const isCurrent = days.includes(today);
  const reviewed = reviews.some((r) => r.week === weekKey(first));

  const weekTasks = useMemo(() => tasks.filter((t) => t.date && t.date >= first && t.date <= last), [tasks, first, last]);
  const backlog = useMemo(() => tasks.filter((t) => !t.date && !t.done), [tasks]);
  const linked = weekTasks.filter((t) => t.milestoneId).length;

  // Alignment-Check: Welche laufenden Meilensteine haben diese Woche keinen einzigen Schritt?
  const focus = useMemo(
    () =>
      milestones
        .filter((m) => m.start <= last && m.due >= first)
        .map((m) => ({
          m,
          goal: goals.find((g) => g.id === m.goalId),
          info: milestoneInfo(m, tasks, today),
          steps: weekTasks.filter((t) => t.milestoneId === m.id).length,
        }))
        .filter((x) => x.info.status !== 'achieved')
        .sort((a, b) => goals.indexOf(a.goal!) - goals.indexOf(b.goal!) || a.m.due.localeCompare(b.m.due)),
    [milestones, goals, tasks, weekTasks, first, last, today],
  );

  const shift = (weeks: number) => setWeek(addDays(first, weeks * 7));

  return (
    <div className="view view-wide">
      <header className="view-head">
        <div>
          <div className="eyebrow">{isCurrent ? 'Diese Woche' : first > today ? 'Kommende Woche' : 'Vergangene Woche'}</div>
          <h1>KW {isoWeek(first).week}</h1>
          <div className="view-sub">
            {fmtShort(first)} – {fmtShort(last)}
            {weekTasks.length > 0 && ` · ${linked} von ${weekTasks.length} Aufgaben zahlen auf Ziele ein`}
          </div>
        </div>
        <div className="head-actions">
          {!isCurrent && (
            <button type="button" className="btn" onClick={() => setWeek(today)}>
              Diese Woche
            </button>
          )}
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Vorherige Woche">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Nächste Woche">
              <ChevronRight size={16} />
            </button>
          </div>
          <button type="button" className={cls('btn', !reviewed && 'btn-primary')} onClick={() => showModal({ kind: 'review', week: first })}>
            {reviewed ? <Check size={15} /> : <NotebookPen size={15} />}
            Wochenrückblick
          </button>
        </div>
      </header>

      {focus.length > 0 && (
        <section className="section">
          <SectionTitle icon={<Flag size={15} />} aside={<span className="section-aside">Jeder laufende Meilenstein braucht einen Schritt pro Woche</span>}>
            Meilensteine dieser Woche
          </SectionTitle>
          <div className="focus-strip">
            {focus.map(({ m, goal, info, steps }) => (
              <button key={m.id} type="button" className="focus-card" style={goalColor(goal)} onClick={() => open({ kind: 'milestone', id: m.id })}>
                <div className="focus-title">
                  <span>{m.emoji}</span>
                  <span className="clip">{m.title || 'Ohne Titel'}</span>
                </div>
                <ProgressBar value={info.progress} status={info.status} />
                <div className={cls('focus-meta', steps === 0 && 'is-warn')}>
                  {steps === 0 ? 'Kein Schritt geplant' : `${steps} ${steps === 1 ? 'Schritt' : 'Schritte'} geplant`}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <HabitsWeek weekStart={first} />

      <div className="board">
        <Backlog tasks={backlog} />
        {days.slice(0, 5).map((d) => (
          <DayColumn key={d} date={d} today={today} tasks={weekTasks.filter((t) => t.date === d).sort(sortTasks)} />
        ))}
        {/* Wochenende gestapelt wie im Papierplaner – spart eine Spalte */}
        <div className="col-stack">
          {days.slice(5).map((d) => (
            <DayColumn key={d} date={d} today={today} tasks={weekTasks.filter((t) => t.date === d).sort(sortTasks)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({ date, today, tasks }: { date: string; today: string; tasks: Task[] }) {
  const setDay = useUI((s) => s.setDay);
  const drop = useDrop((id) => useStore.getState().scheduleTask(id, date));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const openCount = tasks.filter((t) => !t.done).length;

  const submit = () => {
    const t = title.trim();
    if (t) useStore.getState().addTask({ title: t, date });
    setTitle('');
  };

  return (
    <div className={cls('col', date === today && 'is-today', date < today && 'is-past', drop.over && 'is-over')} {...drop.props}>
      <a
        href="#heute"
        className="col-head"
        onClick={() => setDay(date)}
        title="Tag öffnen"
      >
        <span className="col-day">{fmtWeekday(date)}</span>
        <span className="col-date">{fromKey(date).getDate()}</span>
        {openCount > 0 && <span className="col-count">{openCount}</span>}
      </a>
      <div className="col-list">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} compact />
        ))}
      </div>
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            autoFocus
            className="col-input"
            value={title}
            placeholder="Aufgabe …"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              submit();
              setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setTitle('');
                setAdding(false);
              }
            }}
          />
        </form>
      ) : (
        <button type="button" className="col-add" onClick={() => setAdding(true)}>
          <Plus size={14} />
          Aufgabe
        </button>
      )}
    </div>
  );
}

function Backlog({ tasks }: { tasks: Task[] }) {
  const milestones = useStore((s) => s.milestones);
  const goals = useStore((s) => s.goals);
  const drop = useDrop((id) => useStore.getState().scheduleTask(id, null));

  const groups = useMemo(() => {
    const result: { key: string; label: string; goal?: Goal; items: Task[] }[] = goals
      .flatMap((goal) => milestones.filter((m) => m.goalId === goal.id).map((m) => ({ m, goal })))
      .map(({ m, goal }) => ({ key: m.id, label: `${m.emoji} ${m.title || 'Ohne Titel'}`, goal, items: tasks.filter((t) => t.milestoneId === m.id) }))
      .filter((g) => g.items.length);
    const loose = tasks.filter((t) => !t.milestoneId || !milestones.some((m) => m.id === t.milestoneId));
    if (loose.length) result.push({ key: 'none', label: 'Ohne Ziel', items: loose });
    return result;
  }, [tasks, milestones, goals]);

  return (
    <div className={cls('col col-backlog', drop.over && 'is-over')} {...drop.props}>
      <div className="col-head is-static">
        <Inbox size={14} />
        <span className="col-day">Unverplant</span>
        {tasks.length > 0 && <span className="col-count">{tasks.length}</span>}
      </div>
      <QuickAdd compact placeholder="Neue Aufgabe" onAdd={(title, milestoneId) => useStore.getState().addTask({ title, milestoneId })} />
      <div className="col-list">
        {groups.map((g) => (
          <div key={g.key} className="bl-group">
            <div className="bl-label" style={goalColor(g.goal)}>
              <span className="clip">{g.label}</span>
            </div>
            {g.items.map((t) => (
              <TaskRow key={t.id} task={t} compact showGoal={false} />
            ))}
          </div>
        ))}
        {tasks.length === 0 && <div className="col-empty">Alles verplant. Neue Schritte landen hier, bis du ihnen einen Tag gibst.</div>}
      </div>
    </div>
  );
}
