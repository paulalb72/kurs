import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ID } from '../lib/types';
import { useUI } from '../lib/ui';
import { MilestonePicker } from './MilestonePicker';
import { cls } from './ui';

interface Props {
  onAdd: (title: string, milestoneId: ID | null) => void;
  placeholder?: string;
  /** Taste N fokussiert dieses Feld */
  hotkey?: boolean;
  compact?: boolean;
}

export function QuickAdd({ onAdd, placeholder = 'Aufgabe hinzufügen', hotkey, compact }: Props) {
  const [title, setTitle] = useState('');
  const [milestoneId, setMilestoneId] = useState<ID | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return;
      const { modal, panel } = useUI.getState();
      if (modal || panel) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, milestoneId);
    setTitle('');
  };

  return (
    <form
      className={cls('quickadd', compact && 'is-compact')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Plus size={16} />
      <input
        ref={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTitle('');
            input.current?.blur();
          }
        }}
      />
      {hotkey && !title && <kbd>N</kbd>}
      <MilestonePicker
        value={milestoneId}
        onChange={(id) => {
          setMilestoneId(id);
          input.current?.focus();
        }}
        variant={compact ? 'icon' : 'chip'}
      />
    </form>
  );
}
