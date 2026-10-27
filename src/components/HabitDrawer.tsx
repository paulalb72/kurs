import { Calendar, Minus, Plus, Repeat, Target, Trash2 } from 'lucide-react';
import type { Habit, ID } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { HABIT_LABEL, habitInfo } from '../lib/progress';
import { todayKey } from '../lib/dates';
import { Drawer, DrawerHead } from './Overlay';
import { EmojiPicker } from './EmojiPicker';
import { HabitDots, HabitScore, HabitStrip } from './Habits';
import { ConfirmButton, Prop, StatusChip, blurOnEnter } from './ui';

export function HabitDrawer({ id }: { id: ID }) {
  const habit = useStore((s) => s.habits.find((h) => h.id === id));
  const goals = useStore((s) => s.goals);
  const logs = useStore((s) => s.habitLogs);
  const close = useUI((s) => s.closePanel);
  const open = useUI((s) => s.open);
  if (!habit) return null;

  const { updateHabit, deleteHabit } = useStore.getState();
  const up = (patch: Partial<Habit>) => updateHabit(habit.id, patch);
  const today = todayKey();
  const info = habitInfo(habit, logs, today);
  const goal = goals.find((g) => g.id === habit.goalId);

  return (
    <Drawer onClose={close} label="Gewohnheit">
      <DrawerHead
        onClose={close}
        eyebrow={
          <>
            {goal && (
              <button type="button" className="crumb" onClick={() => open({ kind: 'goal', id: goal.id })}>
                {goal.emoji} {goal.title || 'Jahresziel'}
              </button>
            )}
            <span>/</span>
            <span>Gewohnheit</span>
          </>
        }
      />
      <div className="drawer-body">
        <div className="title-row">
          <EmojiPicker value={habit.emoji} onChange={(emoji) => up({ emoji })} />
          <textarea
            className="title-input"
            rows={1}
            value={habit.title}
            placeholder="Verhalten, z. B. Krafttraining"
            autoFocus={!habit.title}
            onChange={(e) => up({ title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={blurOnEnter}
          />
        </div>

        <div className="pace">
          <div className="pace-top">
            <StatusChip status={info.status} label={HABIT_LABEL[info.status]} />
            <span className="muted">
              Diese Woche {info.thisWeek.done} von {info.thisWeek.target}
            </span>
          </div>
          <HabitDots habit={habit} weekStart={info.thisWeek.start} days={info.days} labels />
          <HabitScore info={info} />
          <div className="hstrip-wrap">
            <span className="hscore-label">Verlauf</span>
            <HabitStrip info={info} />
          </div>
        </div>

        <div className="props">
          <Prop label="Jahresziel" icon={<Target size={14} />}>
            <select className="input input-sm grow" value={habit.goalId} onChange={(e) => up({ goalId: e.target.value })}>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title || 'Ohne Titel'} ({g.year})
                </option>
              ))}
            </select>
          </Prop>
          <Prop label="Wochenziel" icon={<Repeat size={14} />}>
            <div className="metric">
              <button
                type="button"
                className="icon-btn bordered"
                aria-label="Seltener"
                disabled={habit.perWeek <= 1}
                onClick={() => up({ perWeek: habit.perWeek - 1 })}
              >
                <Minus size={14} />
              </button>
              <span className="per-week">{habit.perWeek}×</span>
              <button
                type="button"
                className="icon-btn bordered"
                aria-label="Öfter"
                disabled={habit.perWeek >= 7}
                onClick={() => up({ perWeek: habit.perWeek + 1 })}
              >
                <Plus size={14} />
              </button>
              <span className="muted">pro Woche, mindestens</span>
            </div>
          </Prop>
          <Prop label="Gezählt ab" icon={<Calendar size={14} />}>
            <input
              type="date"
              className="input input-sm"
              value={habit.start}
              max={today}
              onChange={(e) => e.target.value && up({ start: e.target.value })}
            />
          </Prop>
        </div>

        <p className="hint">
          Bewertet werden abgeschlossene Wochen; mehr als das Ziel zählt voll. Lieber ein Ziel, das du fast jede Woche schaffst – erhöhen
          kannst du später.
        </p>
      </div>
      <footer className="drawer-foot">
        <span className="muted">Verlauf wird mitgelöscht</span>
        <ConfirmButton
          danger
          onConfirm={() => {
            deleteHabit(habit.id);
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
