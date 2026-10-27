import { Calendar, Star, Target, Trash2 } from 'lucide-react';
import type { ID } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { addDays, startOfWeek, todayKey } from '../lib/dates';
import { Drawer, DrawerHead } from './Overlay';
import { MilestonePicker } from './MilestonePicker';
import { Check, ConfirmButton, Prop, blurOnEnter, cls } from './ui';

export function TaskDrawer({ id }: { id: ID }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === id));
  const milestone = useStore((s) => (task?.milestoneId ? s.milestones.find((m) => m.id === task.milestoneId) : undefined));
  const close = useUI((s) => s.closePanel);
  const open = useUI((s) => s.open);
  const notify = useUI((s) => s.notify);
  if (!task) return null;

  const { updateTask, toggleTask, deleteTask, scheduleTask, toggleTop } = useStore.getState();
  const today = todayKey();
  const quickDates = [
    { label: 'Heute', value: today },
    { label: 'Morgen', value: addDays(today, 1) },
    { label: 'Nächste Woche', value: addDays(startOfWeek(today), 7) },
  ];

  return (
    <Drawer onClose={close} label="Aufgabe">
      <DrawerHead
        onClose={close}
        eyebrow={
          milestone ? (
            <>
              <button type="button" className="crumb" onClick={() => open({ kind: 'milestone', id: milestone.id })}>
                {milestone.emoji} {milestone.title || 'Meilenstein'}
              </button>
              <span>/</span>
              <span>Aufgabe</span>
            </>
          ) : (
            'Aufgabe'
          )
        }
      />
      <div className="drawer-body">
        <div className="title-row">
          <Check checked={task.done} onChange={() => toggleTask(task.id)} />
          <textarea
            className="title-input"
            rows={1}
            value={task.title}
            placeholder="Was ist zu tun?"
            autoFocus={!task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={blurOnEnter}
          />
        </div>

        <div className="props">
          <Prop label="Zahlt ein auf" icon={<Target size={14} />}>
            <MilestonePicker variant="field" value={task.milestoneId} onChange={(v) => updateTask(task.id, { milestoneId: v })} />
          </Prop>
          <Prop label="Datum" icon={<Calendar size={14} />}>
            <input
              type="date"
              className="input input-sm"
              value={task.date ?? ''}
              onChange={(e) => scheduleTask(task.id, e.target.value || null)}
            />
            <div className="chips">
              {quickDates.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className={cls('chip', task.date === c.value && 'is-active')}
                  onClick={() => scheduleTask(task.id, c.value)}
                >
                  {c.label}
                </button>
              ))}
              {task.date && (
                <button type="button" className="chip" onClick={() => scheduleTask(task.id, null)}>
                  Ohne Datum
                </button>
              )}
            </div>
          </Prop>
          {task.date && (
            <Prop label="Priorität" icon={<Star size={14} />}>
              <button
                type="button"
                role="switch"
                aria-checked={task.top}
                className={cls('toggle', task.top && 'is-on')}
                onClick={() => {
                  if (!toggleTop(task.id)) notify('Dieser Tag hat schon drei Top-Aufgaben.');
                }}
              />
              <span className="muted">Top 3 des Tages</span>
            </Prop>
          )}
        </div>

        {!task.milestoneId && !task.done && (
          <p className="hint">
            Tipp: Ordne die Aufgabe einem Meilenstein zu. So siehst du, wie viel deiner Zeit wirklich auf deine Ziele einzahlt.
          </p>
        )}
      </div>
      <footer className="drawer-foot">
        <span />
        <ConfirmButton
          danger
          onConfirm={() => {
            deleteTask(task.id);
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
