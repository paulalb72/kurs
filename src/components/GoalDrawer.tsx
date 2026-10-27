import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ID } from '../lib/types';
import { GOAL_COLORS, useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { HABIT_LABEL, goalInfo, habitInfo, milestoneInfo } from '../lib/progress';
import { todayKey } from '../lib/dates';
import { Drawer, DrawerHead } from './Overlay';
import { EmojiPicker } from './EmojiPicker';
import { ConfirmButton, ProgressBar, Prop, StatusChip, blurOnEnter, cls } from './ui';

export function GoalDrawer({ id }: { id: ID }) {
  const goal = useStore((s) => s.goals.find((g) => g.id === id));
  const allMilestones = useStore((s) => s.milestones);
  const tasks = useStore((s) => s.tasks);
  const allHabits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const close = useUI((s) => s.closePanel);
  const open = useUI((s) => s.open);
  const milestones = useMemo(
    () => allMilestones.filter((m) => m.goalId === id).sort((a, b) => a.due.localeCompare(b.due)),
    [allMilestones, id],
  );
  const habits = useMemo(() => allHabits.filter((h) => h.goalId === id), [allHabits, id]);
  if (!goal) return null;

  const { updateGoal, deleteGoal, addMilestone, addHabit } = useStore.getState();
  const today = todayKey();
  const info = goalInfo(goal, { milestones: allMilestones, tasks, habits: allHabits, habitLogs }, today);
  const thisYear = new Date().getFullYear();
  const startForYear = goal.year === thisYear ? today : `${goal.year}-01-01`;

  return (
    <Drawer onClose={close} label="Jahresziel">
      <DrawerHead onClose={close} eyebrow={`Jahresziel ${goal.year}`} />
      <div className="drawer-body">
        <div className="title-row">
          <EmojiPicker value={goal.emoji} onChange={(emoji) => updateGoal(goal.id, { emoji })} />
          <textarea
            className="title-input"
            rows={1}
            value={goal.title}
            placeholder="Lebensbereich, z. B. Fitness und Gesundheit"
            autoFocus={!goal.title}
            onChange={(e) => updateGoal(goal.id, { title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={blurOnEnter}
          />
        </div>

        <div className="props">
          <Prop label="Status">
            <StatusChip status={info.status} />
            {info.count > 0 && <ProgressBar value={info.progress} status={info.status} />}
          </Prop>
          <Prop label="Jahr">
            <select className="input input-sm" value={goal.year} onChange={(e) => updateGoal(goal.id, { year: Number(e.target.value) })}>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Prop>
          <Prop label="Farbe">
            <div className="swatches">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  className={cls('swatch', c === goal.color && 'is-on')}
                  style={{ ['--c' as string]: `var(--g-${c})` }}
                  onClick={() => updateGoal(goal.id, { color: c })}
                />
              ))}
            </div>
          </Prop>
        </div>

        <label className="field-label">
          Warum ist dir das wichtig?
          <textarea
            className="input"
            rows={3}
            value={goal.why}
            placeholder="Ein klares Warum hält dich dran, wenn die Motivation nachlässt."
            onChange={(e) => updateGoal(goal.id, { why: e.target.value })}
          />
        </label>

        <section className="block">
          <div className="block-label">
            <span>Meilensteine</span>
            <span className="count">{milestones.length}</span>
          </div>
          {milestones.map((m) => {
            const mi = milestoneInfo(m, tasks, today);
            return (
              <button key={m.id} type="button" className="ms-line" onClick={() => open({ kind: 'milestone', id: m.id })}>
                <span>{m.emoji}</span>
                <span className="clip">{m.title || 'Ohne Titel'}</span>
                <ProgressBar value={mi.progress} status={mi.status} />
                <StatusChip status={mi.status} />
              </button>
            );
          })}
          <button
            type="button"
            className="add-row"
            onClick={() => open({ kind: 'milestone', id: addMilestone(goal.id, { start: startForYear }) })}
          >
            <Plus size={14} />
            Meilenstein hinzufügen
          </button>
          <p className="hint">Gute Meilensteine sind messbar und in 4–12 Wochen erreichbar.</p>
        </section>

        <section className="block">
          <div className="block-label">
            <span>Gewohnheiten</span>
            <span className="count">{habits.length}</span>
          </div>
          {habits.map((h) => {
            const hi = habitInfo(h, habitLogs, today);
            return (
              <button key={h.id} type="button" className="ms-line" onClick={() => open({ kind: 'habit', id: h.id })}>
                <span>{h.emoji}</span>
                <span className="clip">{h.title || 'Ohne Titel'}</span>
                <span className="ms-line-meta">
                  {hi.thisWeek.done}/{hi.thisWeek.target}
                </span>
                <StatusChip status={hi.status} label={HABIT_LABEL[hi.status]} />
              </button>
            );
          })}
          <button
            type="button"
            className="add-row"
            onClick={() => open({ kind: 'habit', id: addHabit(goal.id, { start: startForYear }) })}
          >
            <Plus size={14} />
            Gewohnheit hinzufügen
          </button>
          <p className="hint">Wiederkehrendes Verhalten mit Wochenziel, z. B. mindestens 3× Training pro Woche.</p>
        </section>
      </div>
      <footer className="drawer-foot">
        <span className="muted">Meilensteine und Gewohnheiten werden mitgelöscht</span>
        <ConfirmButton
          danger
          onConfirm={() => {
            deleteGoal(goal.id);
            close();
          }}
        >
          <Trash2 size={14} />
          Löschen
        </ConfirmButton>
      </footer>
    </Drawer>
  );
}
