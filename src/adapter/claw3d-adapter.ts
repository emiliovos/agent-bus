import WebSocket from 'ws';
import { isValidEvent, type AgentEvent } from '../types/agent-event.js';
import { translateEvent } from './event-translator.js';

export interface AdapterConfig {
  hubUrl: string;           // ws://localhost:4000
  injectUrl: string;        // http://localhost:3000/api/inject-event
  injectSecret: string;     // shared secret for X-Inject-Secret header
  reconnectMs?: number;     // hub reconnect delay (default 3000)
}

/** Bridges agent-bus hub events to Claw3D via HTTP POST inject endpoint */
export function createClaw3dAdapter(config: AdapterConfig) {
  const reconnectMs = config.reconnectMs ?? 3000;
  let hubWs: WebSocket | null = null;
  let stopping = false;

  /** Translate event and POST to Claw3D inject endpoint */
  async function forwardEvent(event: AgentEvent) {
    const frame = translateEvent(event);
    if (!frame) return;

    try {
      const res = await fetch(config.injectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inject-Secret': config.injectSecret,
        },
        body: JSON.stringify(frame),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.error(`[adapter] inject failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error('[adapter] inject error:', (err as Error).message);
    }
  }

  function connectToHub() {
    if (stopping) return;
    hubWs = new WebSocket(config.hubUrl);

    hubWs.on('open', () => {
      console.log('[adapter] connected to hub:', config.hubUrl);
    });

    hubWs.on('message', (data: Buffer) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());
        if (!isValidEvent(parsed)) return;
        void forwardEvent(parsed);
      } catch (err) {
        console.error('[adapter] invalid hub message:', err);
      }
    });

    hubWs.on('close', () => {
      console.log('[adapter] hub disconnected, reconnecting...');
      hubWs = null;
      if (!stopping) setTimeout(connectToHub, reconnectMs);
    });

    hubWs.on('error', (err) => {
      console.error('[adapter] hub error:', err.message);
    });
  }

  return {
    start() {
      stopping = false;
      connectToHub();
    },
    stop() {
      stopping = true;
      if (hubWs) { hubWs.close(); hubWs = null; }
    },
    get connected(): boolean {
      return hubWs?.readyState === WebSocket.OPEN;
    },
  };
}
