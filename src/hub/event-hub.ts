import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { isValidEvent, type AgentEvent } from '../types/agent-event.js';

/** Max request body size (1 MB) — prevents memory exhaustion from oversized payloads */
const MAX_BODY_BYTES = 1024 * 1024;

/** Max string field length for agent, project, tool, file, message */
const MAX_FIELD_LENGTH = 1024;

export interface HubConfig {
  port: number;
  logDir: string;
}

export interface HubStats {
  ok: boolean;
  clients: number;
  events: number;
}

/** Core event hub — HTTP + WebSocket server with JSONL logging */
export function createEventHub(config: HubConfig) {
  let eventCount = 0;

  // Create log directory and open a write stream (serializes concurrent writes)
  mkdirSync(config.logDir, { recursive: true });
  const logStream: WriteStream = createWriteStream(
    join(config.logDir, 'events.jsonl'),
    { flags: 'a' },
  );

  // HTTP request handler
  function handleRequest(req: IncomingMessage, res: ServerResponse) {
    // CORS headers for cross-origin producers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      const stats: HubStats = {
        ok: true,
        clients: wss.clients.size,
        events: eventCount,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    if (req.method === 'POST' && req.url === '/events') {
      let body = '';
      let bytes = 0;
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
          return;
        }
        body += chunk.toString();
      });
      req.on('end', () => {
        if (!res.writableEnded) void handleEvent(body, res);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  // Process incoming event: validate, stamp, broadcast, log
  async function handleEvent(body: string, res: ServerResponse) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!isValidEvent(parsed)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid event schema' }));
      return;
    }

    // Check string field lengths to prevent oversized values
    const fields = [parsed.agent, parsed.project, parsed.tool, parsed.file, parsed.message];
    if (fields.some((f) => typeof f === 'string' && f.length > MAX_FIELD_LENGTH)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Field value too long' }));
      return;
    }

    // Stamp timestamp if not provided (use ?? so ts:0 is preserved)
    const event: AgentEvent = { ...parsed, ts: parsed.ts ?? Date.now() };
    eventCount++;

    // Broadcast to all connected WebSocket consumers
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }

    // Append to JSONL log (WriteStream serializes concurrent writes)
    logStream.write(payload + '\n');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: event.ts }));
  }

  const server = createServer(handleRequest);
  const wss = new WebSocketServer({ server });

  return {
    /** Start listening on configured port */
    listen(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(config.port, () => resolve());
      });
    },

    /** Graceful shutdown — close all connections and stop server (5s timeout) */
    close(): Promise<void> {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          server.closeAllConnections();
          resolve();
        }, 5000);

        logStream.end();
        for (const client of wss.clients) {
          client.close();
        }
        wss.close(() => {
          server.close(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      });
    },

    /** Current hub statistics */
    get stats(): HubStats {
      return { ok: true, clients: wss.clients.size, events: eventCount };
    },
  };
}
