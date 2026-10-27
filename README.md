# Kurs

Ein schlankes Produktivitätssystem: Jahresziele, darauf einzahlend Meilensteine (mit Aufgaben) und Gewohnheiten (mit Wochenziel), dazu zwei Rituale (Tag planen, Wochenrückblick).
Frontend: React (eine einzige gebaute HTML-Datei). Backend: Node + SQLite (`node:sqlite`), ohne Laufzeit-Abhängigkeiten.

## Lokal starten

```bash
cp .env.example .env      # Benutzername und Passwort eintragen
npm install
npm run dev               # App: http://localhost:5173  (API läuft parallel auf :3000)
```

Produktionsmodus lokal: `npm run build && npm start` → http://localhost:3000

## Konfiguration (Umgebungsvariablen)

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `KURS_USERNAME` | ja | Benutzername für den Login |
| `KURS_PASSWORD` | ja | Passwort – ändern meldet alle Geräte ab |
| `PORT` | nein | Standard `3000` |
| `DATA_DIR` | nein | Ordner für `kurs.db`, Standard `./data` (im Docker-Image `/data`) |
| `SESSION_SECRET` | nein | Wird sonst einmalig erzeugt und in der Datenbank gespeichert |
| `PUBLIC_URL` | nein | Öffentliche Adresse, z. B. `https://kurs.deine-domain.de` – nur nötig, falls der Claude-Connector hinter einem Proxy die falsche Adresse meldet |
| `TZ` | nein | Zeitzone für „heute“, im Docker-Image `Europe/Berlin` |

## Claude-Connector (MCP)

Kurs bringt einen MCP-Server mit: `https://<deine-adresse>/mcp`. Claude kann damit Ziele, Meilensteine und Aufgaben lesen und bearbeiten – Login per OAuth mit denselben Zugangsdaten wie die App.

- **claude.ai / Claude Desktop / Handy-App:** Einstellungen → Connectors → *Benutzerdefinierten Connector hinzufügen* → URL `https://<deine-adresse>/mcp`. Es öffnet sich die Kurs-Anmeldung. (Braucht eine öffentliche HTTPS-Adresse, also erst deployen.)
- **Claude Code (auch lokal):** `claude mcp add --transport http kurs http://localhost:3000/mcp`, dann in Claude Code `/mcp` → *Authenticate*.

Werkzeuge: `get_overview`, `list_tasks`, `get_week`, `create_task`, `update_task`, `create_goal`, `update_goal`, `create_milestone`, `update_milestone`, `create_habit`, `update_habit`, `log_habit`, `delete_item`, `save_review`.
Änderungen von Claude erscheinen in der offenen App nach spätestens ~20 Sekunden.
Passwort ändern trennt alle verbundenen Clients.

## Online deployen

**Wichtig:** `/data` muss ein persistentes Volume sein, sonst ist die Datenbank nach jedem Deploy weg.
SQLite heißt außerdem: genau eine Instanz laufen lassen, nicht skalieren.

### Eigener Server (VPS) mit Docker

```bash
git clone … && cd kurs
cp .env.example .env      # Zugangsdaten setzen
docker compose up -d      # läuft auf Port 3000, Daten im Volume kurs-data
```

Für HTTPS einen Reverse Proxy davorsetzen, z. B. Caddy:
`caddy reverse-proxy --from kurs.deine-domain.de --to localhost:3000`

### Railway, Fly.io, Render & Co.

Repository verbinden – das `Dockerfile` wird automatisch erkannt. Dann:

1. `KURS_USERNAME` und `KURS_PASSWORD` als Variablen setzen
2. Volume an `/data` anhängen
3. Health-Check (optional): `GET /healthz`

## Backup

In der App unter **Daten → Exportieren** (JSON). Alternativ die Datei `kurs.db` aus dem Volume kopieren.

## Aufbau

- `server/` – HTTP-Server, Login (signiertes HttpOnly-Cookie, Sperre nach 5 Fehlversuchen), SQLite-Schema
- `server/mcp.ts`, `server/tools.ts`, `server/oauth.ts` – Claude-Connector: MCP-Endpunkt, Werkzeuge, OAuth 2.1 (DCR + PKCE)
- `src/lib/sync.ts` – beobachtet den Store und schickt Änderungen gebündelt an `POST /api/sync`
- `src/views/` – Heute, Woche, Ziele · `src/components/` – Panels, Dialoge, Login
