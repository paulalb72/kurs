import { Fragment } from 'react';
import type { Goal } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { STATUS_LABEL, clamp, milestoneInfo, pct } from '../lib/progress';
import { addDays, diffDays, fmtMonth, fmtShort, pad, todayKey } from '../lib/dates';
import { cls, goalColor } from '../components/ui';

/** Jahres-Zeitplan: Wann läuft welcher Meilenstein, und wie weit ist er? */
export function GoalTimeline({ year, goals }: { year: number; goals: Goal[] }) {
  const milestones = useStore((s) => s.milestones);
  const tasks = useStore((s) => s.tasks);
  const open = useUI((s) => s.open);

  const today = todayKey();
  const yearStart = `${year}-01-01`;
  const length = diffDays(yearStart, `${year + 1}-01-01`);
  const pos = (key: string) => clamp(diffDays(yearStart, key) / length) * 100;
  const months = Array.from({ length: 12 }, (_, i) => ({ i, left: pos(`${year}-${pad(i + 1)}-01`) }));
  const showToday = today.startsWith(`${year}-`);

  return (
    <div className="gantt-wrap">
      <div className="gantt">
        <div className="gantt-head">
          <div className="gantt-corner">Meilenstein</div>
          <div className="gantt-months">
            {months.map((m) => (
              <div key={m.i} className={cls('gantt-month', m.i % 3 === 0 && 'is-quarter')} style={{ left: `${m.left}%` }}>
                {m.i % 3 === 0 && <b>Q{m.i / 3 + 1}</b>}
                {fmtMonth(m.i)}
              </div>
            ))}
          </div>
        </div>

        <div className="gantt-body">
          <div className="gantt-lines">
            {months.map((m) => (
              <div key={m.i} className={cls('gantt-line', m.i % 3 === 0 && 'is-quarter')} style={{ left: `${m.left}%` }} />
            ))}
            {showToday && (
              <div className="gantt-today" style={{ left: `${pos(today)}%` }}>
                <span>Heute</span>
              </div>
            )}
          </div>

          {goals.map((g) => {
            const own = milestones.filter((m) => m.goalId === g.id).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <Fragment key={g.id}>
                <div className="gantt-group" style={goalColor(g)}>
                  <span className="dot" />
                  {g.emoji} {g.title || 'Ohne Titel'}
                </div>
                {own.length === 0 && (
                  <div className="gantt-row is-empty">
                    <div className="gantt-label muted">Noch keine Meilensteine</div>
                    <div />
                  </div>
                )}
                {own.map((m) => {
                  const info = milestoneInfo(m, tasks, today);
                  const left = pos(m.start);
                  const right = pos(addDays(m.due, 1));
                  return (
                    <div key={m.id} className="gantt-row" onClick={() => open({ kind: 'milestone', id: m.id })}>
                      <div className="gantt-label">
                        <span>{m.emoji}</span>
                        <span className="clip">{m.title || 'Ohne Titel'}</span>
                        <span className={`gantt-status s-${info.status}`} title={STATUS_LABEL[info.status]}>
                          {pct(info.progress)}
                        </span>
                      </div>
                      <div className="gantt-track">
                        {right > left && (
                          <div
                            className={`gantt-bar s-${info.status}`}
                            style={{ ...goalColor(g), left: `${left}%`, width: `${Math.max(right - left, 0.8)}%` }}
                            title={`${fmtShort(m.start)} – ${fmtShort(m.due)} · ${STATUS_LABEL[info.status]}`}
                          >
                            <i style={{ width: `${info.progress * 100}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
