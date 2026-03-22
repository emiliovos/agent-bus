# Phase 1: Gateway Server & Agent Registry

## Context Links
- [Plan overview](plan.md)
- [Event translator (reuse)](../../src/adapter/event-translator.ts)
- [Agent event types (reuse)](../../src/types/agent-event.ts)
- [Hub source (subscribe pattern)](../../src/hub/event-hub.ts)
- [Current adapter (replace)](../../src/adapter/claw3d-adapter.ts)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 1.5h
- **Description:** Build the WebSocket gateway server at `:18789` and the in-memory agent/session registry. Gateway accepts Claw3D browser connections (OpenClaw protocol v2), subscribes to the hub as a WS consumer, and maintains agent state.

## Key Insights
- Claw3D's `GATEWAY_URL` config points to the OpenClaw gateway. We replace OpenClaw at `:18789` with our own.
- Protocol v2 connect handshake requires: `hello-ok` response with `server`, `features`, `snapshot`, `policy` fields.
- Agent registry is purely in-memory — no persistence needed. Agents auto-register on `session_start`, go idle on `session_end`.
- Chat history uses a ring buffer (last 100 messages per session) for `sessions.preview` RPC.

## Requirements

### Functional
1. WS server on `:18789` (configurable via `GATEWAY_PORT` env)
2. Accept multiple Claw3D browser connections simultaneously
3. Handle OpenClaw protocol v2 connect handshake
4. Subscribe to hub at `:4000` as WS consumer (same pattern as current adapter)
5. Auto-reconnect to hub on disconnect (3s delay)
6. Maintain in-memory agent registry (add on `session_start`, update on events, idle on `session_end`)
7. Maintain session registry with chat history ring buffer (100 msgs/session)

### Non-Functional
- Memory: < 50MB with 20 agents, 100 messages each
- Latency: < 10ms from hub event to Claw3D broadcast
- Zero new npm dependencies

## Architecture

```
                    ┌─────────────────────────────────┐
                    │  agent-bus-gateway.ts            │
                    │                                  │
hub :4000 ──WS──>  │  hubWs (consumer)                │
                    │    │                             │
                    │    ▼                             │
                    │  on message → agentRegistry      │
                    │    │          .handleEvent()     │
                    │    ▼                             │
                    │  protocolHandler                 │
                    │    .broadcastEvent()             │
                    │    │                             │
                    │    ▼                             │
browser ◀──WS───── │  clients Set<WebSocket>          │
                    └─────────────────────────────────┘
```

### `agent-registry.ts` (~80 LOC)

```typescript
// Types
interface AgentInfo {
  id: string;            // e.g. "backend-dev"
  identity: { name: string; theme: string; emoji: string };
  project: string;
  status: 'active' | 'idle';
  runId: string;
  sessionKey: string;
  lastSeen: number;      // timestamp ms
}

interface SessionInfo {
  sessionKey: string;
  agentId: string;
  project: string;
  startedAt: number;
  messages: ChatMessage[];  // ring buffer, max 100
}

interface ChatMessage {
  role: 'assistant';
  content: string;
  ts: number;
}

// Class: AgentRegistry
// Methods:
//   handleEvent(event: AgentEvent): { agentChanged: boolean; chatFrame?: Claw3dEventFrame }
//   getAgents(): AgentInfo[]
//   getSessions(): SessionInfo[]
//   getSessionMessages(sessionKey: string): ChatMessage[]
//   getAgentConfig(agentId: string): AgentInfo | undefined
//   getPresenceSnapshot(): AgentInfo[]
```

### `agent-bus-gateway.ts` (~200 LOC)

```typescript
// Config
interface GatewayConfig {
  port: number;          // default 18789
  hubUrl: string;        // default ws://localhost:4000
  reconnectMs?: number;  // default 3000
}

// Responsibilities:
// 1. Create WS server on :port
// 2. Connect to hub as WS consumer
// 3. On hub message: validate → registry.handleEvent() → broadcast to clients
// 4. On client connect: wait for "connect" RPC → respond with hello-ok
// 5. On client message: route to protocolHandler
// 6. Tick timer: broadcast tick event every 30s
// 7. Graceful shutdown: close hub WS, close all clients, stop tick timer
```

## Related Code Files

### Create
- `src/gateway/agent-bus-gateway.ts` — main server
- `src/gateway/agent-registry.ts` — state management

### Reuse (import from)
- `src/adapter/event-translator.ts` — translateEvent(), deriveRunId(), deriveSessionKey()
- `src/types/agent-event.ts` — AgentEvent, isValidEvent()

## Implementation Steps

### Step 1: Create `src/gateway/agent-registry.ts`

1. Define interfaces: `AgentInfo`, `SessionInfo`, `ChatMessage`
2. Implement `AgentRegistry` class:
   - `private agents: Map<string, AgentInfo>` — keyed by `agent:project`
   - `private sessions: Map<string, SessionInfo>` — keyed by sessionKey
   - `private stateVersion: { presence: number; health: number }` — incremented on changes
3. Implement `handleEvent(event: AgentEvent)`:
   - Import `deriveRunId`, `deriveSessionKey` from event-translator
   - On `session_start`: create/update agent in map (status: active), create session, increment presence version. Return `{ agentChanged: true }`
   - On `tool_use` / `task_complete`: update agent lastSeen, push message to session ring buffer (shift if > 100). Return `{ agentChanged: false, chatFrame }` using translateEvent()
   - On `session_end`: set agent status to idle, increment presence version. Return `{ agentChanged: true }`
   - On `heartbeat`: update lastSeen only. Return `{ agentChanged: false }`
4. Implement getters: `getAgents()`, `getSessions()`, `getSessionMessages(key)`, `getAgentConfig(id)`, `getPresenceSnapshot()`
5. Implement `getSnapshot()` for connect handshake — returns current presence list and stateVersion
6. Agent identity derivation: name from agent ID (capitalize, replace hyphens with spaces), theme "coding agent", emoji based on simple hash of agent name

### Step 2: Create `src/gateway/agent-bus-gateway.ts`

1. Import `WebSocketServer`, `WebSocket` from `ws`
2. Import `isValidEvent` from types, `translateEvent` from event-translator
3. Import `AgentRegistry` from agent-registry
4. Import `handleRpc` from protocol-handler (created in Phase 2 — use stub initially)
5. Define `GatewayConfig` interface
6. Implement `createGateway(config)`:
   - Initialize `AgentRegistry`
   - Create `WebSocketServer` on config.port
   - Track connected clients: `Set<WebSocket>` with metadata (connected: boolean = false until connect handshake)
   - **Hub connection:**
     - Connect to hub WS
     - On message: parse JSON, validate with isValidEvent, call `registry.handleEvent()`
     - If agentChanged: broadcast `presence` event to all connected clients
     - If chatFrame: broadcast translated frame to all connected clients
     - Auto-reconnect on close (3s delay)
   - **Client connection handler:**
     - On new WS connection: add to clients set (connected=false)
     - On message: parse JSON, check type
       - If `type: "req"`: route to protocol handler
       - First req must be `method: "connect"` — mark client as connected on success
       - Reject non-connect requests before handshake
     - On close: remove from clients set
   - **Tick timer:** `setInterval` every 30s, broadcast `{ type: "event", event: "tick", payload: { ts: Date.now() } }` to all connected clients
   - **Broadcast helper:** `broadcast(frame)` — JSON.stringify, send to all clients where connected=true
   - Return `{ start(), stop(), get stats() }`

### Step 3: Wire up start/stop lifecycle

1. `start()`: create WS server, connect to hub, start tick timer
2. `stop()`: clear tick interval, close hub WS, close all client connections, close WS server
3. `stats`: return { clients: connected count, agents: registry count, hubConnected: boolean }

## Todo List

- [ ] Create `src/gateway/agent-registry.ts` with AgentInfo, SessionInfo, ChatMessage types
- [ ] Implement AgentRegistry class with handleEvent, getters, getSnapshot
- [ ] Implement ring buffer logic for chat messages (max 100/session)
- [ ] Implement agent identity derivation (name, theme, emoji from agent ID)
- [ ] Create `src/gateway/agent-bus-gateway.ts` with GatewayConfig
- [ ] Implement WS server creation and client tracking
- [ ] Implement hub WS consumer with auto-reconnect
- [ ] Implement client connection handler (connected flag, handshake gate)
- [ ] Implement broadcast helper (only to connected clients)
- [ ] Implement tick timer (30s interval)
- [ ] Implement start/stop lifecycle with graceful shutdown

## Success Criteria

1. Gateway starts on `:18789` and accepts WS connections
2. Hub consumer connects and receives events
3. Agent registry tracks agents from hub events (session_start creates, session_end idles)
4. Chat history ring buffer stores last 100 messages per session
5. Multiple browser clients can connect simultaneously
6. Tick events sent every 30s to all connected clients
7. Graceful shutdown closes all connections within 5s

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hub not running | Gateway starts but no events flow | Log warning, auto-reconnect loop |
| Memory leak from stale agents | Slow growth over days | Prune agents idle > 24h (future, not v1) |
| Multiple agents same ID + project | Registry collision | Key by `agent:project`, last-write-wins |

## Security Considerations

- No auth required for v1 (local network only, same as current OpenClaw setup)
- Claw3D sends a connect frame with token — gateway accepts any token (OpenClaw compat)
- No external exposure — runs behind CF tunnel same as hub
