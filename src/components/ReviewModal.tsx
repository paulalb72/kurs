import { useMemo, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { Goal, Milestone } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { countWeek, habitInfo, habitTarget, milestoneInfo, type MilestoneInfo } from '../lib/progress';
import { addDays, fmtRelative, fmtShort, isoWeek, todayKey, weekKey } from '../lib/dates';
import { Modal, ModalHead } from './Overlay';
import { StatusChip } from './ui';

/** Wöchentliches Ritual: zurückblicken, reflektieren, nächste Schritte festlegen. */
export function ReviewModal({ week }: { week: string }) {
  const close = useUI((s) => s.closeModal);
  const notify = useUI((s) => s.notify);
  const setWeek = useUI((s) => s.setWeek);
  const tasks = useStore((s) => s.tasks);
  const milestones = useStore((s) => s.milestones);
  const goals = useStore((s) => s.goals);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const reviews = useStore((s) => s.reviews);
  const saveReview = useStore((s) => s.saveReview);

  const key = weekKey(week);
  const existing = reviews.find((r) => r.week === key);
  const [good, setGood] = useState(existing?.good ?? '');
  const [blocked, setBlocked] = useState(existing?.blocked ?? '');
  const [change, setChange] = useState(existing?.change ?? '');

  const weekEnd = addDays(week, 6);
  const today = todayKey();

  const doneTasks = useMemo(
    () => tasks.filter((t) => t.done && t.doneAt && t.doneAt >= week && t.doneAt <= weekEnd),
    [tasks, week, weekEnd],
  );
  const active = useMemo(
    () =>
      milestones
        .filter((m) => m.start <= addDays(weekEnd, 7) && m.due >= week)
        .map((m) => ({ m, goal: goals.find((g) => g.id === m.goalId), info: milestoneInfo(m, tasks, today) }))
        .filter((x) => x.info.status !== 'achieved'),
    [milestones, goals, tasks, week, weekEnd, today],
  );
  const onTrack = active.filter((x) => x.info.status === 'on' || x.info.status === 'planned').length;
  const habitWeek = habits
    .filter((h) => h.start <= weekEnd)
    .map((h) => ({ h, done: countWeek(habitInfo(h, habitLogs, today).days, week), target: habitTarget(h, week) }));

  const save = () => saveReview({ week: key, good, blocked, change });

  return (
    <Modal onClose={close} label="Wochenrückblick" wide>
      <ModalHead
        eyebrow={`Wochenrückblick · KW ${isoWeek(week).week}`}
        title={`${fmtShort(week)} – ${fmtShort(weekEnd)}`}
        onClose={close}
      />
      <div className="modal-body">
        <div className="step">
          <div className="step-num">1</div>
          <div className="step-body">
            <h3>Was hast du geschafft?</h3>
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{doneTasks.length}</div>
                <div className="stat-label">Aufgaben erledigt</div>
              </div>
              <div className="stat">
                <div className="stat-value">{doneTasks.filter((t) => t.milestoneId).length}</div>
                <div className="stat-label">davon für Ziele</div>
              </div>
              <div className="stat">
                <div className="stat-value">
                  {onTrack}/{active.length}
                </div>
                <div className="stat-label">Meilensteine auf Kurs</div>
              </div>
            </div>
            {habitWeek.length > 0 && (
              <ul className="habit-review">
                {habitWeek.map(({ h, done, target }) => (
                  <li key={h.id}>
                    <span>{h.emoji}</span>
                    <span className="clip">{h.title || 'Ohne Titel'}</span>
                    <span className={done >= target ? 'habit-count is-met' : 'habit-count'}>
                      {done >= target && <Check size={12} strokeWidth={3} />}
                      {done}/{target}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {doneTasks.length > 0 && (
              <ul className="done-list">
                {doneTasks.slice(0, 10).map((t) => (
                  <li key={t.id}>
                    <Check size={13} />
                    {t.title}
                  </li>
                ))}
                {doneTasks.length > 10 && <li className="muted">+ {doneTasks.length - 10} weitere</li>}
              </ul>
            )}
          </div>
        </div>

        <div className="step">
          <div className="step-num">2</div>
          <div className="step-body">
            <h3>Reflexion</h3>
            <label className="field-label">
              Was lief gut?
              <textarea className="input" rows={2} value={good} onChange={(e) => setGood(e.target.value)} />
            </label>
            <label className="field-label">
              Was hat dich aufgehalten?
              <textarea className="input" rows={2} value={blocked} onChange={(e) => setBlocked(e.target.value)} />
            </label>
            <label className="field-label">
              Was machst du nächste Woche anders?
              <textarea className="input" rows={2} value={change} onChange={(e) => setChange(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="step">
          <div className="step-num">3</div>
          <div className="step-body">
            <h3>Nächste Schritte festlegen</h3>
            <p className="hint">Jeder aktive Meilenstein braucht einen konkreten nächsten Schritt.</p>
            {active.length === 0 && <p className="muted">Keine aktiven Meilensteine.</p>}
            {active.map(({ m, goal, info }) => (
              <NextStep key={m.id} milestone={m} goal={goal} info={info} />
            ))}
          </div>
        </div>
      </div>
      <footer className="modal-foot">
        <button
          type="button"
          className="btn"
          onClick={() => {
            save();
            close();
            notify('Rückblick gespeichert');
          }}
        >
          Speichern
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            save();
            setWeek(addDays(week, 7));
            window.location.hash = 'woche';
            close();
            notify('Gespeichert – jetzt die Woche verplanen');
          }}
        >
          Speichern und Woche planen
          <ArrowRight size={15} />
        </button>
      </footer>
    </Modal>
  );
}

function NextStep({ milestone, goal, info }: { milestone: Milestone; goal?: Goal; info: MilestoneInfo }) {
  const tasks = useStore((s) => s.tasks);
  const addTask = useStore((s) => s.addTask);
  const [draft, setDraft] = useState('');
  const open = useMemo(
    () =>
      tasks
        .filter((t) => t.milestoneId === milestone.id && !t.done)
        .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
    [tasks, milestone.id],
  );

  return (
    <div className="next-row">
      <div className="next-head">
        <span>{milestone.emoji}</span>
        <span className="clip">{milestone.title || 'Ohne Titel'}</span>
        {goal && <span className="muted next-goal">{goal.title}</span>}
        <StatusChip status={info.status} />
      </div>
      {open.slice(0, 2).map((t) => (
        <div key={t.id} className="next-task">
          <span className="next-dot" />
          <span className="clip">{t.title}</span>
          <span className="muted">{t.date ? fmtRelative(t.date) : 'unverplant'}</span>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const title = draft.trim();
          if (!title) return;
          addTask({ title, milestoneId: milestone.id });
          setDraft('');
        }}
      >
        <input
          className="input input-sm next-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={open.length ? 'Weiteren Schritt hinzufügen' : 'Nächster Schritt …'}
        />
      </form>
    </div>
  );
}
