import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cls } from './ui';

interface Props {
  button: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
}

const MENU_MAX_WIDTH = 320;
const EDGE = 8;

/** Unterkante des nutzbaren Bereichs – auf dem Handy liegt dort die Tab-Leiste. */
function bottomEdge() {
  const bar = document.querySelector('.sidebar')?.getBoundingClientRect();
  return bar && bar.top > window.innerHeight / 2 ? bar.top : window.innerHeight;
}

/** Verschiebung nach links, damit ein Menü dieser Breite ganz auf den Bildschirm passt. */
function shiftFor(trigger: DOMRect, width: number) {
  return Math.max(Math.min(0, window.innerWidth - EDGE - width - trigger.left), EDGE - trigger.left);
}

export function Dropdown({ button, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, up: false });
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture-Phase, damit Escape nur das Menü schließt und nicht auch den Drawer dahinter.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Schon vor dem ersten Frame so platzieren, dass das Menü nicht über den Rand ragt –
  // ein überstehendes Menü lässt mobile Browser sonst den Ausschnitt verschieben.
  const toggle = () => {
    if (open) return setOpen(false);
    const trigger = ref.current!.getBoundingClientRect();
    setPos({ left: shiftFor(trigger, Math.min(MENU_MAX_WIDTH, window.innerWidth - 2 * EDGE)), up: false });
    setOpen(true);
  };

  // Mit der echten Größe nachjustieren: so nah wie möglich am Auslöser, und nach oben, wenn unten kein Platz ist.
  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const trigger = ref.current.getBoundingClientRect();
    const { offsetWidth, offsetHeight } = menuRef.current;
    const below = bottomEdge() - trigger.bottom - 6;
    const above = trigger.top - 6;
    setPos({ left: shiftFor(trigger, offsetWidth), up: offsetHeight > below - EDGE && above > below });
  }, [open]);

  return (
    <div className={cls('dd', className)} ref={ref} onClick={(e) => e.stopPropagation()}>
      {button(open, toggle)}
      {open && (
        <div ref={menuRef} className={cls('dd-menu', pos.up && 'dd-up')} style={{ left: pos.left }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
