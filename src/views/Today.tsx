import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CircleAlert, ListTodo, Star } from 'lucide-react';
import type { ID } from '../lib/types';
import { MAX_TOP, sortTasks, useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { useDrop } from '../lib/dnd';
import { addDays, diffDays, fmtLong, isoWeek, todayKey } from '../lib/dates';
import { QuickAdd } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { MilestonePicker } from '../components/MilestonePicker';
import { HabitsToday } from '../components/Habits';
import { SectionTitle, cls } from '../components/ui';

const byCreated = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;

export function Today() {
  const date = useUI((s) => s.day);
  const setDay = useUI((s) => s.setDay);
  const notify = useUI((s) => s.notify);
  const tasks = useStore((s) => s.tasks);
  const { addTask, scheduleTask, updateTask, toggleTop } = useStore.getState();

  const today = todayKey();
  const offset = diffDays(today, date);

  const { top, open, done, overdue } = useMemo(() => {
    const day = tasks.filter((t) => t.date === date);
    return {
      top: day.filter((t) => t.top).sort(byCreated),
      open: day.filter((t) => !t.top && !t.done).sort(sortTasks),
      done: day.filter((t) => !t.top && t.done),
      overdue: offset === 0 ? tasks.filter((t) => !t.done && t.date && t.date < date).sort((a, b) => a.date!.localeCompare(b.date!)) : [],
    };
  }, [tasks, date, offset]);

  const total = top.length + open.length + done.length;
  const completed = top.filter((t) => t.done).length + done.length;

  const ensureOnDay = (id: ID) => {
    const t = useStore.getState().tasks.find((x) => x.id === id);
    if (t && t.date !== date) scheduleTask(id, date);
  };

  const topDrop = useDrop((id) => {
    ensureOnDay(id);
    const t = useStore.getState().tasks.find((x) => x.id === id);
    if (t && !t.top && !toggleTop(id)) notify('Maximal drei Top-Aufgaben pro Tag – das ist Absicht.');
  });
  // Aus den Top 3 zurück in die Liste ziehen = Priorität wieder abgeben.
  const listDrop = useDrop((id) => {
    ensureOnDay(id);
    updateTask(id, { top: false });
  });

  const label = offset === 0 ? 'Heute' : offset === 1 ? 'Morgen' : offset === -1 ? 'Gestern' : null;

  return (
    <div className="view view-narrow">
      <header className="view-head">
        <div>
          <div className="eyebrow">
            {label ? `${label} · ` : ''}KW {isoWeek(date).week}
          </div>
          <h1>{fmtLong(date)}</h1>
          <div className="view-sub">{total > 0 ? `${completed} von ${total} erledigt` : 'Noch nichts geplant'}</div>
        </div>
        <div className="head-actions">
          {offset !== 0 && (
            <button type="button" className="btn" onClick={() => setDay(today)}>
              Heute
            </button>
          )}
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => setDay(addDays(date, -1))} aria-label="Vorheriger Tag">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setDay(addDays(date, 1))} aria-label="Nächster Tag">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="today-main">
        {overdue.length > 0 && (
          <section>
            <SectionTitle
              icon={<CircleAlert size={15} />}
              aside={
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => overdue.forEach((t) => scheduleTask(t.id, date))}>
                  Alle auf heute
                </button>
              }
            >
              Überfällig <span className="count">{overdue.length}</span>
            </SectionTitle>
            {overdue.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                showDate
                extra={
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost row-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      scheduleTask(t.id, date);
                    }}
                  >
                    Auf heute
                  </button>
                }
              />
            ))}
          </section>
        )}

        <section className={cls('dropzone', topDrop.over && 'is-over')} {...topDrop.props}>
          <SectionTitle icon={<Star size={15} />} aside={<span className="section-aside">Was heute wirklich zählt</span>}>
            Top 3
          </SectionTitle>
          <div className="top3">
            {top.map((t, i) => (
              <TaskRow key={t.id} task={t} index={i + 1} star />
            ))}
            {Array.from({ length: Math.max(0, MAX_TOP - top.length) }, (_, i) => (
              <TopSlot key={`${date}-${top.length + i}`} index={top.length + i + 1} date={date} first={top.length + i === 0} />
            ))}
          </div>
        </section>

        <HabitsToday date={date} />

        <section className={cls('dropzone', listDrop.over && 'is-over')} {...listDrop.props}>
          <SectionTitle icon={<ListTodo size={15} />} aside={open.length > 0 && <span className="count">{open.length}</span>}>
            Weitere Aufgaben
          </SectionTitle>
          <QuickAdd hotkey onAdd={(title, milestoneId) => addTask({ title, milestoneId, date })} />
          {open.map((t) => (
            <TaskRow key={t.id} task={t} star />
          ))}
          {done.length > 0 && (
            <details className="done-group">
              <summary>Erledigt · {done.length}</summary>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

function TopSlot({ index, date, first }: { index: number; date: string; first: boolean }) {
  const [title, setTitle] = useState('');
  const [milestoneId, setMilestoneId] = useState<ID | null>(null);
  const addTask = useStore((s) => s.addTask);

  return (
    <form
      className="top-slot"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        addTask({ title: t, date, top: true, milestoneId });
        setTitle('');
        setMilestoneId(null);
      }}
    >
      <span className="task-index">{index}</span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label={`Top-Aufgabe ${index}`}
        placeholder={first ? 'Was bringt dich heute deinen Zielen am nächsten?' : 'Tippen oder eine Aufgabe hierher ziehen'}
      />
      <MilestonePicker value={milestoneId} onChange={setMilestoneId} />
    </form>
  );
}
