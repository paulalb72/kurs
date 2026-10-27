import { useMemo, useState } from 'react';
import { Calendar, Minus, Plus, Target, Trash2, TrendingUp, Trophy } from 'lucide-react';
import type { ID, Metric, Milestone, Task } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { milestoneInfo, pct } from '../lib/progress';
import { addDays, diffDays, fmtRemaining, todayKey } from '../lib/dates';
import { Drawer, DrawerHead } from './Overlay';
import { EmojiPicker } from './EmojiPicker';
import { TaskRow } from './TaskRow';
import { ConfirmButton, NumberField, ProgressBar, Prop, Segmented, StatusChip, blurOnEnter, cls } from './ui';

const byOpenThenDate = (a: Task, b: Task) =>
  Number(a.done) - Number(b.done) || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.createdAt - b.createdAt;

export function MilestoneDrawer({ id }: { id: ID }) {
  const milestone = useStore((s) => s.milestones.find((m) => m.id === id));
  const goals = useStore((s) => s.goals);
  const allTasks = useStore((s) => s.tasks);
  const close = useUI((s) => s.closePanel);
  const open = useUI((s) => s.open);
  const [draft, setDraft] = useState('');
  const tasks = useMemo(() => allTasks.filter((t) => t.milestoneId === id).sort(byOpenThenDate), [allTasks, id]);
  if (!milestone) return null;

  const m = milestone;
  const { updateMilestone, deleteMilestone, addTask } = useStore.getState();
  const up = (patch: Partial<Milestone>) => updateMilestone(m.id, patch);
  const setMetric = (patch: Partial<Metric>) => m.metric && up({ metric: { ...m.metric, ...patch } });

  const today = todayKey();
  const info = milestoneInfo(m, allTasks, today);
  const goal = goals.find((g) => g.id === m.goalId);
  const weeks = Math.round((diffDays(m.start, m.due) + 1) / 7);
  const running = info.status !== 'achieved' && info.status !== 'planned';

  return (
    <Drawer onClose={close} label="Meilenstein">
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
            <span>Meilenstein</span>
          </>
        }
      />
      <div className="drawer-body">
        <div className="title-row">
          <EmojiPicker value={m.emoji} onChange={(emoji) => up({ emoji })} />
          <textarea
            className="title-input"
            rows={1}
            value={m.title}
            placeholder="Messbares Ergebnis, z. B. 10 Bewerbungen verschickt"
            autoFocus={!m.title}
            onChange={(e) => up({ title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={blurOnEnter}
          />
        </div>

        <div className="pace">
          <div className="pace-top">
            <StatusChip status={info.status} />
            <span className="muted">{info.status === 'achieved' ? 'Geschafft' : fmtRemaining(m.due, today)}</span>
          </div>
          <ProgressBar value={info.progress} status={info.status} marker={running ? info.elapsed : undefined} />
          <div className="pace-legend">
            <span>Fortschritt {pct(info.progress)}</span>
            {running && <span>Zeit vergangen {pct(info.elapsed)}</span>}
          </div>
        </div>

        <div className="props">
          <Prop label="Jahresziel" icon={<Target size={14} />}>
            <select className="input input-sm grow" value={m.goalId} onChange={(e) => up({ goalId: e.target.value })}>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title || 'Ohne Titel'} ({g.year})
                </option>
              ))}
            </select>
          </Prop>
          <Prop label="Zeitraum" icon={<Calendar size={14} />}>
            <input type="date" className="input input-sm" value={m.start} max={m.due} onChange={(e) => e.target.value && up({ start: e.target.value })} />
            <span className="muted">bis</span>
            <input type="date" className="input input-sm" value={m.due} min={m.start} onChange={(e) => e.target.value && up({ due: e.target.value })} />
          </Prop>
          <Prop label="Dauer">
            <div className="chips">
              {[4, 8, 12].map((w) => (
                <button key={w} type="button" className={cls('chip', weeks === w && 'is-active')} onClick={() => up({ due: addDays(m.start, w * 7 - 1) })}>
                  {w} Wochen
                </button>
              ))}
            </div>
            {![4, 8, 12].includes(weeks) && <span className="muted">{weeks} Wochen</span>}
          </Prop>
          <Prop label="Fortschritt über" icon={<TrendingUp size={14} />}>
            <Segmented
              value={m.metric ? 'metric' : 'tasks'}
              options={[
                { value: 'tasks', label: 'Aufgaben' },
                { value: 'metric', label: 'Messwert' },
              ]}
              onChange={(v) => up({ metric: v === 'metric' ? { current: 0, target: 10, unit: '' } : null })}
            />
          </Prop>
          {m.metric && (
            <Prop label="Stand">
              <div className="metric">
                <button type="button" className="icon-btn bordered" aria-label="Eins weniger" onClick={() => setMetric({ current: Math.max(0, m.metric!.current - 1) })}>
                  <Minus size={14} />
                </button>
                <NumberField value={m.metric.current} onChange={(current) => setMetric({ current })} />
                <button type="button" className="icon-btn bordered" aria-label="Eins mehr" onClick={() => setMetric({ current: m.metric!.current + 1 })}>
                  <Plus size={14} />
                </button>
                <span className="muted">von</span>
                <NumberField value={m.metric.target} min={1} onChange={(target) => setMetric({ target })} />
                <input className="input input-sm unit" placeholder="Einheit" value={m.metric.unit} onChange={(e) => setMetric({ unit: e.target.value })} />
              </div>
            </Prop>
          )}
        </div>

        <section className="block">
          <div className="block-label">
            <span>Aufgaben</span>
            {info.total > 0 && (
              <span className="count">
                {info.done}/{info.total} erledigt
              </span>
            )}
          </div>
          <div>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} showDate showGoal={false} />
            ))}
          </div>
          <form
            className="inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              const title = draft.trim();
              if (!title) return;
              addTask({ title, milestoneId: m.id });
              setDraft('');
            }}
          >
            <Plus size={15} />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nächsten Schritt hinzufügen" />
          </form>
          {m.metric && <p className="hint">Der Fortschritt kommt aus dem Messwert – Aufgaben sind die Schritte dorthin.</p>}
        </section>

        <section className="block">
          <div className="block-label">
            <span>Wenn-dann-Plan</span>
          </div>
          <label className="field-label">
            Was könnte dich aufhalten?
            <textarea
              className="input"
              rows={2}
              value={m.obstacle}
              placeholder="z. B. Nach der Arbeit bin ich zu müde."
              onChange={(e) => up({ obstacle: e.target.value })}
            />
          </label>
          <label className="field-label">
            Wenn das passiert, dann …
            <textarea
              className="input"
              rows={2}
              value={m.plan}
              placeholder="… erledige ich es am nächsten Morgen als Erstes."
              onChange={(e) => up({ plan: e.target.value })}
            />
          </label>
          <p className="hint">Hindernisse vorab zu benennen und die Reaktion festzulegen, hilft nachweislich beim Dranbleiben (WOOP).</p>
        </section>
      </div>
      <footer className="drawer-foot">
        <button type="button" className={cls('btn btn-sm', m.achieved && 'is-achieved')} onClick={() => up({ achieved: !m.achieved })}>
          <Trophy size={14} />
          {m.achieved ? 'Erreicht – rückgängig' : 'Als erreicht markieren'}
        </button>
        <ConfirmButton
          danger
          onConfirm={() => {
            deleteMilestone(m.id);
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
