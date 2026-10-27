import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cls } from './ui';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
      <X size={16} />
    </button>
  );
}

export function Drawer({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEscape(onClose);
  return createPortal(
    <div className="layer">
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={label}>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export function DrawerHead({ eyebrow, onClose }: { eyebrow: ReactNode; onClose: () => void }) {
  return (
    <header className="drawer-head">
      <div className="drawer-eyebrow">{eyebrow}</div>
      <CloseButton onClose={onClose} />
    </header>
  );
}

export function Modal({
  children,
  onClose,
  label,
  wide,
  sheet,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  wide?: boolean;
  /** Auf dem Handy als kompaktes Sheet von unten statt bildschirmfüllend */
  sheet?: boolean;
}) {
  useEscape(onClose);
  return createPortal(
    <div className="layer modal-layer">
      <div className="scrim" onClick={onClose} />
      <div className={cls('modal', wide && 'is-wide', sheet && 'is-sheet')} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHead({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <header className="modal-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      <CloseButton onClose={onClose} />
    </header>
  );
}
