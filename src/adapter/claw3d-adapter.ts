import WebSocket from 'ws';
import { isValidEvent, type AgentEvent } from '../types/agent-event.js';
import { buildConnectFrame, translateEvent } from './event-translator.js';

export interface AdapterConfig {
  hubUrl: string;       // ws://localhost:4000
  claw3dUrl: string;    // ws://localhost:3000/api/gateway/ws
  claw3dToken: string;  // OpenClaw gateway token
  reconnectMs?: number; // Reconnect delay (default 3000)
}

/** Bridges agent-bus hub events to Claw3D's WebSocket protocol */
export function createClaw3dAdapter(config: AdapterConfig) {
  const reconnectMs = config.reconnectMs ?? 3000;
  let hubWs: WebSocket | null = null;
  let claw3dWs: WebSocket | null = null;
  let claw3dConnected = false;
  let stopping = false;

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
        forwardEvent(parsed);
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

  function connectToClaw3d() {
    if (stopping) return;
    claw3dConnected = false;
    claw3dWs = new WebSocket(config.claw3dUrl);

    claw3dWs.on('open', () => {
      console.log('[adapter] connected to Claw3D:', config.claw3dUrl);
      // First message must be a connect frame
      const connectFrame = buildConnectFrame(config.claw3dToken);
      claw3dWs!.send(JSON.stringify(connectFrame));
    });

    claw3dWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === 'res') {
          if (msg.ok === true) {
            claw3dConnected = true;
            console.log('[adapter] Claw3D authenticated');
          } else {
            const err = msg.error as Record<string, unknown> | undefined;
            console.error('[adapter] Claw3D connect rejected:', err?.message ?? 'unknown');
            claw3dWs?.close();
          }
        }
      } catch {
        // Ignore non-JSON messages from Claw3D
      }
    });

    claw3dWs.on('close', () => {
      console.log('[adapter] Claw3D disconnected, reconnecting...');
      claw3dWs = null;
      claw3dConnected = false;
      if (!stopping) setTimeout(connectToClaw3d, reconnectMs);
    });

    claw3dWs.on('error', (err) => {
      console.error('[adapter] Claw3D error:', err.message);
    });
  }

  function forwardEvent(event: AgentEvent) {
    if (!claw3dConnected || !claw3dWs) return;

    const frame = translateEvent(event);
    if (!frame) return;

    claw3dWs.send(JSON.stringify(frame));
  }

  return {
    /** Start the adapter — connects to both hub and Claw3D */
    start() {
      stopping = false;
      connectToHub();
      connectToClaw3d();
    },

    /** Stop the adapter — close all connections */
    stop() {
      stopping = true;
      if (hubWs) { hubWs.close(); hubWs = null; }
      if (claw3dWs) { claw3dWs.close(); claw3dWs = null; }
      claw3dConnected = false;
    },

    /** Whether the adapter is connected and authenticated with Claw3D */
    get connected(): boolean {
      return claw3dConnected;
    },
  };
}
