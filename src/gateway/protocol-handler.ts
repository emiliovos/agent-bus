import type { AgentRegistry } from './agent-registry.js';

export interface RpcRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

interface HandlerContext {
  connId: string;
  startTime: number;
}

const SUPPORTED_METHODS = [
  'connect', 'health', 'agents.list', 'config.get', 'sessions.list',
  'sessions.preview', 'status', 'exec.approvals.get', 'chat.send', 'chat.abort',
];

/** Build the hello-ok response for the connect handshake */
function buildHelloOk(req: RpcRequest, registry: AgentRegistry, ctx: HandlerContext): RpcResponse {
  return {
    type: 'res', id: req.id, ok: true,
    payload: {
      type: 'hello-ok',
      protocol: 2,
      server: { version: 'agent-bus-1.0', connId: ctx.connId },
      features: {
        methods: SUPPORTED_METHODS,
        events: ['agent', 'chat', 'presence', 'tick'],
      },
      snapshot: {
        presence: registry.getAgents().map((a) => ({
          instanceId: a.id, host: 'agent-bus', version: '1.0', mode: 'cli', reason: 'connect', ts: a.lastSeen,
        })),
        health: {
          agents: registry.getAgents().map((a) => ({
            agentId: a.id, name: a.identity.name, isDefault: false,
          })),
          defaultAgentId: registry.getAgents()[0]?.id ?? 'main',
        },
        sessionDefaults: { mainKey: 'main' },
        stateVersion: registry.stateVersion,
        uptimeMs: Date.now() - ctx.startTime,
      },
      policy: { maxPayload: 1048576, maxBufferedBytes: 1048576, tickIntervalMs: 30000 },
    },
  };
}

/** Validate that an unknown object is a well-formed RPC request */
export function isValidRpc(data: unknown): data is RpcRequest {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return obj.type === 'req' && typeof obj.id === 'string' && typeof obj.method === 'string';
}

/** Route an RPC request to the correct handler and return a response */
export function handleRpc(req: RpcRequest, registry: AgentRegistry, ctx: HandlerContext): RpcResponse {
  const ok = (payload: unknown): RpcResponse => ({ type: 'res', id: req.id, ok: true, payload });
  const err = (code: string, message: string): RpcResponse => ({ type: 'res', id: req.id, ok: false, error: { code, message } });
  const params = (req.params ?? {}) as Record<string, unknown>;

  switch (req.method) {
    case 'connect':
      return buildHelloOk(req, registry, ctx);

    case 'health':
      return ok({ ok: true });

    case 'agents.list': {
      const agents = registry.getAgents();
      return ok({
        defaultId: agents[0]?.id ?? 'main',
        mainKey: 'main',
        agents: agents.map((a) => ({
          id: a.id, name: a.identity.name, identity: a.identity,
        })),
      });
    }

    case 'config.get': {
      // Return full config with all agents (Claw3D hydration expects this)
      const agents = registry.getAgents();
      return ok({
        config: {
          agents: {
            list: agents.map((a) => ({ id: a.id, identity: a.identity })),
          },
        },
        hash: '', exists: true, path: '',
      });
    }

    case 'sessions.list': {
      let sessions = registry.getSessions();
      // Filter by agentId if provided (Claw3D hydration calls with agentId)
      const filterAgent = typeof params.agentId === 'string' ? params.agentId : '';
      if (filterAgent) sessions = sessions.filter((s) => s.agentId === filterAgent);
      // Filter by search (sessionKey match)
      const search = typeof params.search === 'string' ? params.search : '';
      if (search) sessions = sessions.filter((s) => s.sessionKey === search);
      return ok({
        sessions: sessions.map((s) => ({
          key: s.sessionKey, kind: 'main', channel: 'agent-bus',
          sessionId: s.sessionKey, updatedAt: s.messages.at(-1)?.ts ?? s.startedAt,
          displayName: `${s.agentId} (${s.project})`,
        })),
      });
    }

    case 'sessions.preview': {
      // Claw3D sends { keys: string[] } for batch preview
      const keys = Array.isArray(params.keys) ? params.keys as string[] : [];
      const sessionKey = typeof params.sessionKey === 'string' ? params.sessionKey : '';
      if (keys.length > 0) {
        const sessions = keys.map((k) => ({
          key: k,
          messages: registry.getSessionMessages(k).slice(-8).map((m) => ({
            role: m.role, content: m.content.slice(0, 240), ts: m.ts,
          })),
        }));
        return ok({ sessions });
      }
      return ok({ messages: registry.getSessionMessages(sessionKey) });
    }

    case 'status':
      return ok({
        agents: Object.fromEntries(
          registry.getAgents().map((a) => [a.id, { status: a.status, lastSeen: a.lastSeen }]),
        ),
      });

    case 'exec.approvals.get':
      return ok({ approvals: [] });

    case 'chat.send': {
      const sessionKey = typeof params.sessionKey === 'string' ? params.sessionKey.slice(0, 200) : '?';
      const msg = typeof params.message === 'string' ? params.message.slice(0, 200) : '';
      console.log(`[gateway] chat.send to ${sessionKey}: ${msg}`);
      return ok({ ok: true, delivered: false });
    }

    case 'chat.abort': {
      const abortKey = typeof params.sessionKey === 'string' ? params.sessionKey.slice(0, 200) : '?';
      console.log(`[gateway] chat.abort for ${abortKey}`);
      return ok({ ok: true, aborted: false });
    }

    default:
      return err('unknown_method', `Unknown method: ${req.method}`);
  }
}
