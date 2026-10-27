import { BookOpen, CalendarDays, Check, Database, LogOut, Sun, Target, type LucideIcon } from 'lucide-react';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { logout, useSession, useSync, type SyncStatus } from '../lib/sync';
import { startOfWeek, todayKey, weekday, weekKey } from '../lib/dates';
import { cls } from './ui';

export type View = 'heute' | 'woche' | 'ziele';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="logo">
      <rect width="24" height="24" rx="7" />
      <g transform="rotate(40 12 12)">
        <path d="M12 4.5 14.6 12H9.4z" />
        <path d="M9.4 12h5.2L12 19.5z" opacity=".4" />
      </g>
    </svg>
  );
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  saved: 'Gespeichert',
  saving: 'Speichert …',
  offline: 'Offline – versucht erneut',
};

export function Sidebar({ view }: { view: View }) {
  const tasks = useStore((s) => s.tasks);
  const reviews = useStore((s) => s.reviews);
  const sync = useSync((s) => s.status);
  const user = useSession((s) => s.user);
  const showModal = useUI((s) => s.showModal);
  const setDay = useUI((s) => s.setDay);
  const setWeek = useUI((s) => s.setWeek);

  const today = todayKey();
  const openToday = tasks.filter((t) => t.date === today && !t.done).length;
  const dayPlanned = tasks.some((t) => t.date === today && t.top);
  const reviewed = reviews.some((r) => r.week === weekKey(today));
  const reviewDue = !reviewed && weekday(today) >= 4;

  const nav: { id: View; label: string; icon: LucideIcon; count?: number; onClick?: () => void }[] = [
    { id: 'heute', label: 'Heute', icon: Sun, count: openToday, onClick: () => setDay(today) },
    { id: 'woche', label: 'Woche', icon: CalendarDays, onClick: () => setWeek(today) },
    { id: 'ziele', label: 'Ziele', icon: Target },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        Kurs
      </div>

      <nav className="nav">
        {nav.map(({ id, label, icon: Icon, count, onClick }) => (
          <a key={id} href={`#${id}`} className={cls('nav-item', view === id && 'is-active')} onClick={onClick}>
            <Icon size={16} strokeWidth={1.8} />
            <span className="nav-label">{label}</span>
            {!!count && <span className="nav-count">{count}</span>}
          </a>
        ))}
      </nav>

      <div className="side-section">
        <div className="side-label">Rituale</div>
        <a href="#heute" className="ritual" onClick={() => setDay(today)}>
          <span className={cls('ritual-mark', dayPlanned && 'is-done')}>{dayPlanned && <Check size={10} strokeWidth={3} />}</span>
          <span>Tag planen</span>
          <span className="ritual-hint">{dayPlanned ? 'erledigt' : 'Top 3'}</span>
        </a>
        <button type="button" className="ritual" onClick={() => showModal({ kind: 'review', week: startOfWeek(today) })}>
          <span className={cls('ritual-mark', reviewed && 'is-done', reviewDue && 'is-due')}>
            {reviewed && <Check size={10} strokeWidth={3} />}
          </span>
          <span>Wochenrückblick</span>
          <span className={cls('ritual-hint', reviewDue && 'is-due')}>{reviewed ? 'erledigt' : reviewDue ? 'fällig' : 'Fr–So'}</span>
        </button>
      </div>

      <div className="side-foot">
        <button type="button" className="nav-item" onClick={() => showModal({ kind: 'method' })}>
          <BookOpen size={16} strokeWidth={1.8} />
          <span className="nav-label">Methode</span>
        </button>
        <button type="button" className="nav-item" onClick={() => showModal({ kind: 'data' })}>
          <Database size={16} strokeWidth={1.8} />
          <span className="nav-label">Daten</span>
        </button>
        <div className="side-status">
          <span className={`sync sync-${sync}`} role="status">
            {SYNC_LABEL[sync]}
          </span>
          <button type="button" className="icon-btn" onClick={() => void logout()} title={`Abmelden (${user ?? ''})`} aria-label="Abmelden">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
