import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cls } from './ui';

interface Props {
  button: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
}

export function Dropdown({ button, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState({ x: false, y: false });
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

  // Menü an der Fensterkante umklappen statt abschneiden.
  useLayoutEffect(() => {
    if (!open) return setFlip({ x: false, y: false });
    const r = menuRef.current?.getBoundingClientRect();
    if (!r) return;
    setFlip({ x: r.right > window.innerWidth - 8, y: r.bottom > window.innerHeight - 8 && r.top - r.height > 60 });
  }, [open]);

  return (
    <div className={cls('dd', className)} ref={ref} onClick={(e) => e.stopPropagation()}>
      {button(open, () => setOpen((o) => !o))}
      {open && (
        <div ref={menuRef} className={cls('dd-menu', flip.x && 'dd-right', flip.y && 'dd-up')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
