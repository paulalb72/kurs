import { useEffect, useState } from 'react';
import App from '../App';
import { ApiError } from '../lib/api';
import { boot, login, useSession } from '../lib/sync';
import { Logo } from './Sidebar';

/** Zeigt die App erst, wenn die Session steht und die Daten geladen sind. */
export function Gate() {
  const phase = useSession((s) => s.phase);
  useEffect(() => {
    void boot();
  }, []);

  if (phase === 'ready') return <App />;
  if (phase === 'login') return <Login />;
  if (phase === 'unreachable') {
    return (
      <div className="auth">
        <div className="auth-card">
          <Logo size={32} />
          <h1>Server nicht erreichbar</h1>
          <p className="muted">Prüfe die Verbindung oder ob der Server läuft.</p>
          <button type="button" className="btn btn-primary auth-submit" onClick={() => void boot()}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }
  return <div className="auth" aria-busy="true" />;
}

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="auth">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(username.trim(), password);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen.');
            setBusy(false);
          }
        }}
      >
        <Logo size={32} />
        <h1>Bei Kurs anmelden</h1>
        <label className="field-label">
          Benutzername
          <input className="input" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field-label">
          Passwort
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
