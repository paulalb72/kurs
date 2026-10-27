import { useRef } from 'react';
import { Download, LogOut, Upload } from 'lucide-react';
import type { Data } from '../lib/types';
import { EMPTY, useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { logout, replaceEverything, useSession } from '../lib/sync';
import { todayKey } from '../lib/dates';
import { sampleData } from '../lib/sample';
import { Modal, ModalHead } from './Overlay';
import { ConfirmButton } from './ui';

export function DataModal() {
  const close = useUI((s) => s.closeModal);
  const notify = useUI((s) => s.notify);
  const goals = useStore((s) => s.goals);
  const milestones = useStore((s) => s.milestones);
  const habits = useStore((s) => s.habits);
  const tasks = useStore((s) => s.tasks);
  const user = useSession((s) => s.user);
  const file = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const { goals, milestones, habits, habitLogs, tasks, reviews } = useStore.getState();
    const json = JSON.stringify(
      { app: 'kurs', version: 2, exportedAt: new Date().toISOString(), goals, milestones, habits, habitLogs, tasks, reviews },
      null,
      2,
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `kurs-backup-${todayKey()}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    notify('Backup heruntergeladen');
  };

  const importData = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as Partial<Data>;
      if (!Array.isArray(d.goals) || !Array.isArray(d.milestones) || !Array.isArray(d.tasks)) throw new Error();
      const list = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
      replaceEverything({
        goals: d.goals,
        milestones: d.milestones,
        habits: list(d.habits),
        habitLogs: list(d.habitLogs),
        tasks: d.tasks,
        reviews: list(d.reviews),
      });
      close();
      notify('Backup eingespielt');
    } catch {
      notify('Die Datei ist kein gültiges Kurs-Backup.');
    }
  };

  const replace = (data: Data, message: string) => {
    replaceEverything(data);
    close();
    notify(message);
  };

  return (
    <Modal onClose={close} label="Daten und Backup">
      <ModalHead eyebrow="Daten" title="Daten & Backup" onClose={close} />
      <div className="modal-body">
        <p className="lead">
          Alles liegt in der SQLite-Datenbank auf deinem Server und ist auf jedem Gerät verfügbar, auf dem du angemeldet bist.
        </p>
        <div className="data-list">
          <div className="data-row">
            <div>
              <strong>Angemeldet als {user}</strong>
              <span>Zugangsdaten kommen aus KURS_USERNAME und KURS_PASSWORD</span>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => void logout()}>
              <LogOut size={14} />
              Abmelden
            </button>
          </div>
          <div className="data-row">
            <div>
              <strong>Backup herunterladen</strong>
              <span>
                {goals.length} Jahresziele · {milestones.length} Meilensteine · {habits.length} Gewohnheiten · {tasks.length} Aufgaben
              </span>
            </div>
            <button type="button" className="btn btn-sm" onClick={exportData}>
              <Download size={14} />
              Exportieren
            </button>
          </div>
          <div className="data-row">
            <div>
              <strong>Backup einspielen</strong>
              <span>Ersetzt alle aktuellen Daten</span>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
              <Upload size={14} />
              Importieren
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="data-row">
            <div>
              <strong>Beispiel laden</strong>
              <span>Ersetzt alle Daten durch ein ausgefülltes Beispiel</span>
            </div>
            <ConfirmButton confirmLabel="Daten ersetzen?" onConfirm={() => replace(sampleData(), 'Beispiel geladen')}>
              Laden
            </ConfirmButton>
          </div>
          <div className="data-row">
            <div>
              <strong>Alles löschen</strong>
              <span>Lässt sich nicht rückgängig machen</span>
            </div>
            <ConfirmButton danger onConfirm={() => replace(EMPTY, 'Alle Daten gelöscht')}>
              Löschen
            </ConfirmButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
