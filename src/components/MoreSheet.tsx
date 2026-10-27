import { BookOpen, ChevronRight, Database, LogOut } from 'lucide-react';
import { useUI } from '../lib/ui';
import { logout, useSession, useSync } from '../lib/sync';
import { startOfWeek } from '../lib/dates';
import { Modal, ModalHead } from './Overlay';
import { RitualMark, SYNC_LABEL, useRituals } from './Sidebar';
import { cls } from './ui';

/** Mobiles „Mehr“-Menü: alles aus der Desktop-Seitenleiste, was nicht in die Tab-Leiste passt. */
export function MoreSheet() {
  const close = useUI((s) => s.closeModal);
  const showModal = useUI((s) => s.showModal);
  const setDay = useUI((s) => s.setDay);
  const sync = useSync((s) => s.status);
  const user = useSession((s) => s.user);
  const { today, dayPlanned, reviewed, reviewDue } = useRituals();

  return (
    <Modal onClose={close} label="Mehr" sheet>
      <ModalHead eyebrow={user ? `Angemeldet als ${user}` : 'Kurs'} title="Mehr" onClose={close} />
      <div className="modal-body sheet-body">
        <div className="sheet-group">
          <div className="side-label">Rituale</div>
          <a
            href="#heute"
            className="sheet-item"
            onClick={() => {
              setDay(today);
              close();
            }}
          >
            <RitualMark done={dayPlanned} />
            <span>Tag planen</span>
            <span className="ritual-hint">{dayPlanned ? 'erledigt' : 'Top 3 wählen'}</span>
          </a>
          <button type="button" className="sheet-item" onClick={() => showModal({ kind: 'review', week: startOfWeek(today) })}>
            <RitualMark done={reviewed} due={reviewDue} />
            <span>Wochenrückblick</span>
            <span className={cls('ritual-hint', reviewDue && 'is-due')}>{reviewed ? 'erledigt' : reviewDue ? 'fällig' : 'Fr–So'}</span>
          </button>
        </div>

        <div className="sheet-group">
          <button type="button" className="sheet-item" onClick={() => showModal({ kind: 'method' })}>
            <BookOpen size={17} strokeWidth={1.8} />
            <span>So funktioniert Kurs</span>
            <ChevronRight size={16} className="sheet-chevron" />
          </button>
          <button type="button" className="sheet-item" onClick={() => showModal({ kind: 'data' })}>
            <Database size={17} strokeWidth={1.8} />
            <span>Daten & Backup</span>
            <ChevronRight size={16} className="sheet-chevron" />
          </button>
        </div>

        <div className="sheet-group sheet-foot">
          <span className={`sync sync-${sync}`} role="status">
            {SYNC_LABEL[sync]}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => void logout()}>
            <LogOut size={14} />
            Abmelden
          </button>
        </div>
      </div>
    </Modal>
  );
}
