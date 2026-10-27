import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { Task } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { endTaskDrag, startTaskDrag } from '../lib/dnd';
import { fmtRelative, todayKey } from '../lib/dates';
import { Check, MilestoneChip, cls } from './ui';

interface Props {
  task: Task;
  index?: number;
  compact?: boolean;
  showDate?: boolean;
  showGoal?: boolean;
  /** Stern zum Markieren als Top-3-Aufgabe */
  star?: boolean;
  extra?: ReactNode;
}

export function TaskRow({ task, index, compact, showDate, showGoal = true, star, extra }: Props) {
  const milestone = useStore((s) => (task.milestoneId ? s.milestones.find((m) => m.id === task.milestoneId) : undefined));
  const goal = useStore((s) => (milestone ? s.goals.find((g) => g.id === milestone.goalId) : undefined));
  const toggleTask = useStore((s) => s.toggleTask);
  const toggleTop = useStore((s) => s.toggleTop);
  const open = useUI((s) => s.open);
  const notify = useUI((s) => s.notify);

  const overdue = !task.done && task.date !== null && task.date < todayKey();
  const showMilestone = showGoal && milestone;
  const hasMeta = (showDate && task.date) || showMilestone;

  return (
    <div
      className={cls('task', task.done && 'is-done', compact && 'is-compact', task.top && 'is-top')}
      draggable
      onDragStart={(e) => startTaskDrag(e, task)}
      onDragEnd={endTaskDrag}
      onClick={() => open({ kind: 'task', id: task.id })}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open({ kind: 'task', id: task.id })}
      role="button"
      tabIndex={0}
    >
      {index !== undefined && <span className="task-index">{index}</span>}
      <Check checked={task.done} onChange={() => toggleTask(task.id)} />
      <div className="task-body">
        <div className="task-title">{task.title || <span className="muted">Ohne Titel</span>}</div>
        {hasMeta && (
          <div className="task-meta">
            {showDate && task.date && (
              <span className={cls('meta-item', overdue && 'is-overdue')}>{fmtRelative(task.date)}</span>
            )}
            {showMilestone &&
              (compact ? (
                <span className="meta-item" title={milestone.title}>
                  {milestone.emoji}
                </span>
              ) : (
                <MilestoneChip milestone={milestone} goal={goal} />
              ))}
          </div>
        )}
      </div>
      {extra}
      {star && !task.done && (
        <button
          type="button"
          className={cls('icon-btn star', task.top && 'is-on')}
          aria-label={task.top ? 'Aus den Top 3 entfernen' : 'Zu den Top 3 hinzufügen'}
          title={task.top ? 'Aus den Top 3 entfernen' : 'Zu den Top 3'}
          onClick={(e) => {
            e.stopPropagation();
            if (!toggleTop(task.id)) notify('Maximal drei Top-Aufgaben pro Tag – das ist Absicht.');
          }}
        >
          <Star size={15} />
        </button>
      )}
    </div>
  );
}
