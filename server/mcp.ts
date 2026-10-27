// MCP-Endpunkt (Streamable HTTP, zustandslos): JSON-RPC rein, JSON raus.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { json, readJson } from './http.ts';
import { USERNAME } from './auth.ts';
import { BadInput, Conflict } from './db.ts';
import { TOOLS, ToolError } from './tools.ts';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Kurs ist das persönliche Ziel- und Aufgabensystem von ${USERNAME}.
Aufbau: Jahresziele (höchstens ~3, jeweils mit Warum). Darauf zahlen zwei Bausteine ein: Meilensteine (messbare Ergebnisse in 4–12 Wochen) und Gewohnheiten (wiederkehrendes Verhalten mit Mindest-Wochenziel, z. B. 3× Training; mehr ist gut). Unter Meilensteinen hängen Aufgaben (konkrete nächste Schritte für einen bestimmten Tag; es gibt keine Uhrzeiten).
Regeln: Pro Tag höchstens 3 Top-Aufgaben. Der Status eines Meilensteins vergleicht Fortschritt mit verstrichener Zeit (Auf Kurs, Gefährdet, Hinterher, Erreicht, Geplant). Gewohnheiten werden über abgeschlossene Wochen bewertet – letzte 4 Wochen und gesamt; der Status kommt aus den letzten 4 Wochen. Erzählt der Nutzer, dass er etwas erledigt hat (z. B. „war heute laufen“), trage es mit log_habit ein.
Rituale: Tagesplanung (Top 3 wählen) und Wochenrückblick (get_week lesen, drei Fragen reflektieren, save_review, für jeden aktiven Meilenstein ohne Schritt einen nächsten Schritt anlegen).
Datumsangaben immer YYYY-MM-DD. Beginne mit get_overview, um IDs und den aktuellen Stand zu sehen. Ordne neue Aufgaben möglichst einem Meilenstein zu. Vor dem Löschen nachfragen.`;

interface Message {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function answer(msg: Message) {
  const result = (value: unknown) => ({ jsonrpc: '2.0', id: msg.id, result: value });
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '');
      return result({
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kurs', title: 'Kurs', version: '1.2.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result({});
    case 'tools/list':
      return result({ tools: TOOLS.map(({ run: _run, ...tool }) => tool) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return error(-32602, `Unbekanntes Tool: ${String(msg.params?.name)}`);
      try {
        const output = tool.run((msg.params?.arguments ?? {}) as Record<string, unknown>);
        return result({ content: [{ type: 'text', text: JSON.stringify(output) }] });
      } catch (err) {
        // Fachliche Fehler gehen als Tool-Ergebnis zurück, damit Claude sie korrigieren kann.
        if (err instanceof ToolError || err instanceof BadInput || err instanceof Conflict) {
          return result({ content: [{ type: 'text', text: err.message }], isError: true });
        }
        console.error(err);
        return error(-32603, 'Interner Fehler');
      }
    }
    default:
      return error(-32601, `Methode nicht unterstützt: ${String(msg.method)}`);
  }
}

export async function handleMcp(req: IncomingMessage, res: ServerResponse) {
  // Keine Server-Push-Streams: GET und DELETE werden laut Spezifikation mit 405 beantwortet.
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    return res.end();
  }
  const body = await readJson(req);
  const messages = (Array.isArray(body) ? body : [body]) as Message[];
  // Nur Anfragen mit id bekommen eine Antwort; Notifications (z. B. notifications/initialized) nicht.
  const replies = messages
    .filter((m) => m && typeof m === 'object' && typeof m.method === 'string' && m.id !== undefined && m.id !== null)
    .map(answer);

  if (!replies.length) {
    res.writeHead(202);
    return res.end();
  }
  json(res, 200, Array.isArray(body) ? replies : replies[0]);
}
