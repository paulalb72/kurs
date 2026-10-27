import { useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Check as CheckIcon } from 'lucide-react';
import type { Goal, Milestone, Status } from '../lib/types';
import { STATUS_LABEL } from '../lib/progress';

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

/** Setzt die Zielfarbe als CSS-Variable --c */
export const goalColor = (goal?: Goal | null) =>
  (goal ? { '--c': `var(--g-${goal.color})` } : {}) as CSSProperties;

export const blurOnEnter = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  }
};

export function Check({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? 'Als offen markieren' : 'Als erledigt markieren'}
      className={cls('check', checked && 'is-on')}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <CheckIcon size={12} strokeWidth={3} />
    </button>
  );
}

export function ProgressBar({ value, status, marker }: { value: number; status?: Status; marker?: number }) {
  return (
    <div className={cls('bar', status && `s-${status}`)}>
      <i style={{ width: `${Math.round(value * 100)}%` }} />
      {marker !== undefined && <b style={{ left: `${marker * 100}%` }} title="Zeit vergangen" />}
    </div>
  );
}

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  return <span className={`status s-${status}`}>{label ?? STATUS_LABEL[status]}</span>;
}

export function MilestoneChip({ milestone, goal }: { milestone: Milestone; goal?: Goal }) {
  return (
    <span className="mchip" style={goalColor(goal)} title={milestone.title}>
      <span className="mchip-emoji">{milestone.emoji}</span>
      <span className="mchip-text">{milestone.title || 'Ohne Titel'}</span>
    </span>
  );
}

export function SectionTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-title">
      <h2 className="section-title-main">
        {icon}
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Prop({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="prop">
      <div className="prop-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="prop-value">{children}</div>
    </div>
  );
}

/** Zweistufige Bestätigung statt Browser-Dialog */
export function ConfirmButton({
  children,
  onConfirm,
  confirmLabel = 'Wirklich löschen?',
  danger,
}: {
  children: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={cls('btn btn-sm', danger ? 'btn-ghost btn-danger' : '', armed && 'is-armed')}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cls('seg-item', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Zahlenfeld, das beim Tippen nicht sofort auf Min-Werte springt */
export function NumberField({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <input
      className="input input-sm num"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(',', '.'));
        if (e.target.value !== '' && Number.isFinite(n) && n >= min) onChange(n);
      }}
      onBlur={() => setText(String(value))}
      onKeyDown={blurOnEnter}
    />
  );
}
