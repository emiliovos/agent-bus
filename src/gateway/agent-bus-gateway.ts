import { WebSocketServer, WebSocket } from 'ws';
import { isValidEvent } from '../types/agent-event.js';
import { AgentRegistry } from './agent-registry.js';
import { handleRpc, isValidRpc } from './protocol-handler.js';

export interface GatewayConfig {
  port: number;        // default 18789
  hubUrl: string;      // default ws://localhost:4000
  reconnectMs?: number; // default 3000
}

interface ClientState {
  ws: WebSocket;
  connected: boolean;  // true after successful connect handshake
  connId: string;
}

/** OpenClaw-compatible gateway backed by agent-bus hub events */
export function createGateway(config: GatewayConfig) {
  const reconnectMs = config.reconnectMs ?? 3000;
  const registry = new AgentRegistry();
  const clients = new Map<WebSocket, ClientState>();
  const startTime = Date.now();
  let hubWs: WebSocket | null = null;
  let stopping = false;
  let nextConnId = 0;
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  // Broadcast a frame to all connected (handshake-complete) clients
  function broadcast(frame: unknown) {
    const data = JSON.stringify(frame);
    for (const client of clients.values()) {
      if (client.connected && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  // Broadcast presence event when agent registry changes
  function broadcastPresence() {
    broadcast({
      type: 'event',
      event: 'presence',
      payload: registry.getAgents().map((a) => ({
        instanceId: a.id, host: 'agent-bus', version: '1.0', mode: 'cli',
        reason: 'periodic', ts: a.lastSeen,
      })),
      stateVersion: registry.stateVersion,
    });
  }

  // Connect to hub as WS consumer
  function connectToHub() {
    if (stopping) return;
    hubWs = new WebSocket(config.hubUrl);

    hubWs.on('open', () => {
      console.log('[gateway] connected to hub:', config.hubUrl);
    });

    hubWs.on('message', (data: Buffer) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());
        if (!isValidEvent(parsed)) return;

        const { agentChanged, frame } = registry.handleEvent(parsed);

        // Broadcast translated frame to all Claw3D clients
        if (frame) broadcast(frame);

        // If agent list changed, also broadcast presence update
        if (agentChanged) broadcastPresence();
      } catch (err) {
        console.error('[gateway] hub message error:', err);
      }
    });

    hubWs.on('close', () => {
      console.log('[gateway] hub disconnected, reconnecting...');
      hubWs = null;
      if (!stopping) setTimeout(connectToHub, reconnectMs);
    });

    hubWs.on('error', (err) => {
      console.error('[gateway] hub error:', err.message);
    });
  }

  // Create WS server for Claw3D browser clients
  const wss = new WebSocketServer({ port: config.port, maxPayload: 1048576 });

  wss.on('connection', (ws) => {
    const connId = `ws-${nextConnId++}`;
    const state: ClientState = { ws, connected: false, connId };
    clients.set(ws, state);

    ws.on('message', (raw: Buffer) => {
      try {
        const parsed: unknown = JSON.parse(raw.toString());
        if (!isValidRpc(parsed)) {
          ws.send(JSON.stringify({ type: 'res', id: '?', ok: false, error: { code: 'invalid_request', message: 'Invalid RPC frame' } }));
          return;
        }

        // First message must be connect
        if (!state.connected && parsed.method !== 'connect') {
          ws.send(JSON.stringify({ type: 'res', id: parsed.id, ok: false, error: { code: 'connect_required', message: 'First message must be connect' } }));
          ws.close(1008, 'connect required');
          return;
        }

        const response = handleRpc(parsed, registry, { connId: state.connId, startTime });
        ws.send(JSON.stringify(response));

        // Mark as connected after successful connect handshake
        if (parsed.method === 'connect' && response.ok) {
          state.connected = true;
        }
      } catch (err) {
        console.error('[gateway] client message error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[gateway] client error:', err.message);
      clients.delete(ws);
    });
  });

  return {
    /** Start the gateway — connect to hub and start tick timer */
    start() {
      stopping = false;
      connectToHub();
      // Tick keepalive every 30s
      tickTimer = setInterval(() => {
        broadcast({ type: 'event', event: 'tick', payload: { ts: Date.now() }, seq: Date.now() });
      }, 30000);
      console.log(`[gateway] listening on ws://0.0.0.0:${config.port}`);
    },

    /** Stop the gateway — close everything */
    stop(): Promise<void> {
      return new Promise((resolve) => {
        stopping = true;
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (hubWs) { hubWs.close(); hubWs = null; }
        for (const client of clients.values()) client.ws.close();
        clients.clear();
        wss.close(() => resolve());
      });
    },

    get stats() {
      return {
        clients: [...clients.values()].filter((c) => c.connected).length,
        agents: registry.getAgents().length,
        hubConnected: hubWs?.readyState === WebSocket.OPEN,
      };
    },

    /** Expose registry for testing */
    get registry() { return registry; },
  };
}
