import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createWriteStream, mkdirSync, statSync, renameSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { isValidEvent, type AgentEvent } from '../types/agent-event.js';
import { dashboardHtml } from './dashboard.js';

/** Max request body size (1 MB) — prevents memory exhaustion from oversized payloads */
const MAX_BODY_BYTES = 1024 * 1024;

/** Max string field length for agent, project, tool, file, message */
const MAX_FIELD_LENGTH = 1024;

export interface HubConfig {
  port: number;
  logDir: string;
  logMaxMb?: number;  // default 10 — rotate log at this size
}

export interface HubStats {
  ok: boolean;
  clients: number;
  events: number;
}

/** Core event hub — HTTP + WebSocket server with JSONL logging */
export function createEventHub(config: HubConfig) {
  let eventCount = 0;
  const logMaxBytes = (config.logMaxMb ?? 10) * 1024 * 1024;
  const logFilePath = join(config.logDir, 'events.jsonl');
  const logBackupPath = join(config.logDir, 'events.jsonl.1');
  let writesSinceCheck = 0;

  // Create log directory and open a write stream (serializes concurrent writes)
  mkdirSync(config.logDir, { recursive: true });
  let logStream: WriteStream = createWriteStream(logFilePath, { flags: 'a' });

  // Rotate log if over size limit (check every 100 writes to avoid syscall overhead)
  function maybeRotateLog() {
    if (++writesSinceCheck < 100) return;
    writesSinceCheck = 0;
    try {
      const stats = statSync(logFilePath);
      if (stats.size >= logMaxBytes) {
        logStream.end();
        renameSync(logFilePath, logBackupPath);
        logStream = createWriteStream(logFilePath, { flags: 'a' });
        console.log(`[agent-bus] log rotated (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
      }
    } catch { /* file may not exist yet */ }
  }

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

    if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml);
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
    maybeRotateLog();
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
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };

        const timeout = setTimeout(() => {
          server.closeAllConnections();
          done();
        }, 5000);

        logStream.end();
        for (const client of wss.clients) {
          client.close();
        }
        wss.close(() => {
          server.close(() => {
            clearTimeout(timeout);
            done();
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
