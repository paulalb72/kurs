import { useMemo } from 'react';
import { Check, Target, X } from 'lucide-react';
import type { ID } from '../lib/types';
import { useStore } from '../lib/store';
import { milestoneInfo } from '../lib/progress';
import { todayKey } from '../lib/dates';
import { Dropdown } from './Dropdown';
import { cls, goalColor } from './ui';

interface Props {
  value: ID | null;
  onChange: (id: ID | null) => void;
  variant?: 'chip' | 'field' | 'icon';
}

/** Ordnet eine Aufgabe einem Meilenstein zu – die Verbindung von Tag zu Ziel. */
export function MilestonePicker({ value, onChange, variant = 'chip' }: Props) {
  const goals = useStore((s) => s.goals);
  const milestones = useStore((s) => s.milestones);
  const tasks = useStore((s) => s.tasks);

  const current = milestones.find((m) => m.id === value);
  const currentGoal = current && goals.find((g) => g.id === current.goalId);

  const groups = useMemo(() => {
    const today = todayKey();
    return goals
      .map((goal) => ({
        goal,
        items: milestones.filter(
          (m) => m.goalId === goal.id && (m.id === value || milestoneInfo(m, tasks, today).status !== 'achieved'),
        ),
      }))
      .filter((g) => g.items.length);
  }, [goals, milestones, tasks, value]);

  const emptyLabel = variant === 'field' ? 'Keinem Meilenstein zugeordnet' : 'Ziel';

  return (
    <Dropdown
      button={(open, toggle) => (
        <button
          type="button"
          className={cls('picker', `picker-${variant}`, !current && 'is-empty', open && 'is-open')}
          style={goalColor(currentGoal)}
          onClick={toggle}
          title={current ? current.title : 'Auf welchen Meilenstein zahlt das ein?'}
        >
          {current ? <span className="picker-emoji">{current.emoji}</span> : <Target size={14} />}
          <span className="picker-text">{current ? current.title || 'Ohne Titel' : emptyLabel}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="menu">
          {groups.length === 0 && <div className="menu-empty">Noch keine Meilensteine. Lege sie unter „Ziele“ an.</div>}
          {groups.map(({ goal, items }) => (
            <div key={goal.id}>
              <div className="menu-label">
                {goal.emoji} {goal.title || 'Ohne Titel'}
              </div>
              {items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cls('menu-item', m.id === value && 'is-selected')}
                  onClick={() => {
                    onChange(m.id);
                    close();
                  }}
                >
                  <span>{m.emoji}</span>
                  <span className="menu-text">{m.title || 'Ohne Titel'}</span>
                  {m.id === value && <Check size={14} />}
                </button>
              ))}
            </div>
          ))}
          {value && (
            <>
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  onChange(null);
                  close();
                }}
              >
                <X size={14} />
                <span className="menu-text">Zuordnung entfernen</span>
              </button>
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}
