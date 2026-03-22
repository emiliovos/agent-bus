# Phase 2: Protocol Handler & RPC Methods

## Context Links
- [Plan overview](plan.md)
- [Phase 1 — Server & Registry](phase-01-gateway-server-and-registry.md)
- [OpenClaw protocol reference](../../docs/system-architecture.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 1h
- **Description:** Implement the RPC method router and all 10 OpenClaw-compatible RPC methods. The protocol handler receives parsed `{ type: "req" }` frames from clients, dispatches to the correct method handler, and returns `{ type: "res" }` frames.

## Key Insights
- All RPC methods return `{ type: "res", id, ok: true, payload }` on success
- Error responses: `{ type: "res", id, ok: false, error: { code, message } }`
- `connect` is special — must be first message from client, returns the full hello-ok payload
- Most methods are simple registry lookups — `agents.list`, `sessions.list`, `config.get`, etc.
- `chat.send` and `chat.abort` are fire-and-forget for v1 (log to hub, no actual agent forwarding)

## Requirements

### Functional
1. Route incoming `{ type: "req", method, id, params }` frames to handlers
2. Implement all 10 RPC methods (see below)
3. Return proper `{ type: "res", id, ok, payload }` responses
4. Return error response for unknown methods
5. Validate request structure (type, id, method required)

### Non-Functional
- Response time: < 5ms for all methods (in-memory lookups only)
- No side effects except `chat.send` logging

## RPC Methods

### 1. `connect` — Hello-OK Handshake

**Request:**
```json
{
  "type": "req", "id": "c1", "method": "connect",
  "params": { "minProtocol": 2, "maxProtocol": 2, "client": {...} }
}
```

**Response:**
```json
{
  "type": "res", "id": "c1", "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 2,
    "server": { "version": "agent-bus-1.0", "connId": "<unique-per-connection>" },
    "features": {
      "methods": ["health", "agents.list", "config.get", "sessions.list", "sessions.preview", "status", "exec.approvals.get", "chat.send", "chat.abort"],
      "events": ["agent", "chat", "presence", "tick"]
    },
    "snapshot": {
      "presence": [],  // from registry.getPresenceSnapshot()
      "health": {},
      "stateVersion": { "presence": 0, "health": 0 },
      "uptimeMs": 0    // Date.now() - startTime
    },
    "policy": {
      "maxPayload": 1048576,
      "maxBufferedBytes": 1048576,
      "tickIntervalMs": 30000
    }
  }
}
```

**Implementation:**
- Accept any protocol version in range [1,2]
- Generate connId as `ws-${incrementing counter}`
- Snapshot includes current presence from registry + stateVersion
- `uptimeMs` calculated from gateway start time
- Mark client as "connected" after successful response

### 2. `health` — Health Check

**Response payload:** `{ ok: true }`

### 3. `agents.list` — List Registered Agents

**Response payload:**
```json
{
  "agents": [
    {
      "id": "backend-dev",
      "identity": { "name": "Backend Dev", "theme": "coding agent", "emoji": "..." },
      "status": "active",
      "project": "tickets",
      "runId": "abc123def456",
      "sessionKey": "agent:tickets-backend-dev:main"
    }
  ]
}
```

**Implementation:** `registry.getAgents()` — returns all agents (active + idle)

### 4. `config.get` — Get Agent Config

**Request params:** `{ agentId: string }`
**Response payload:** Agent info from registry, or error if not found

### 5. `sessions.list` — List Active Sessions

**Response payload:**
```json
{
  "sessions": [
    {
      "sessionKey": "agent:tickets-backend-dev:main",
      "agentId": "backend-dev",
      "project": "tickets",
      "startedAt": 1711065600000,
      "messageCount": 12
    }
  ]
}
```

**Implementation:** `registry.getSessions()` — returns sessions with message counts (not full history)

### 6. `sessions.preview` — Preview Session Messages

**Request params:** `{ sessionKey: string }`
**Response payload:**
```json
{
  "messages": [
    { "role": "assistant", "content": "Using Edit on auth.ts", "ts": 1711065605000 }
  ]
}
```

**Implementation:** `registry.getSessionMessages(sessionKey)` — returns ring buffer contents

### 7. `status` — Agent Status/Heartbeat

**Response payload:**
```json
{
  "agents": {
    "backend-dev": { "status": "active", "lastSeen": 1711065605000 },
    "qa": { "status": "idle", "lastSeen": 1711065500000 }
  }
}
```

### 8. `exec.approvals.get` — Execution Approvals

**Response payload:** `{ approvals: [] }` — always empty, no exec approval system

### 9. `chat.send` — Send Chat Message

**Request params:** `{ sessionKey: string, message: string }`
**Implementation:**
- Log message to console (future: forward to agent via hub)
- Return `{ ok: true, delivered: false }` (honest — we don't deliver to agents yet)

### 10. `chat.abort` — Abort Chat

**Request params:** `{ sessionKey: string }`
**Implementation:**
- Log abort request to console
- Return `{ ok: true, aborted: false }` (honest — no abort mechanism yet)

## Related Code Files

### Create
- `src/gateway/protocol-handler.ts` (~100 LOC)

### Depends On (from Phase 1)
- `src/gateway/agent-registry.ts` — all data lookups

## Implementation Steps

### Step 1: Define RPC types

```typescript
interface RpcRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}
```

### Step 2: Implement `handleRpc` function

```typescript
function handleRpc(
  req: RpcRequest,
  registry: AgentRegistry,
  context: { connId: string; uptimeMs: number; stateVersion: { presence: number; health: number } }
): RpcResponse
```

- Switch on `req.method`
- Each case returns `{ type: 'res', id: req.id, ok: true, payload: {...} }`
- Default case: return error `{ code: 'unknown_method', message: 'Unknown method: ...' }`

### Step 3: Implement connect handler

- Build hello-ok payload with server info, features, snapshot, policy
- Snapshot comes from `registry.getPresenceSnapshot()` + context.stateVersion
- `uptimeMs` from context

### Step 4: Implement data methods

- `agents.list` → `registry.getAgents()`
- `config.get` → `registry.getAgentConfig(params.agentId)` with not-found error handling
- `sessions.list` → `registry.getSessions()`
- `sessions.preview` → `registry.getSessionMessages(params.sessionKey)`
- `status` → build map from `registry.getAgents()` → `{ [id]: { status, lastSeen } }`
- `health` → `{ ok: true }`
- `exec.approvals.get` → `{ approvals: [] }`

### Step 5: Implement chat methods

- `chat.send` → log params, return `{ ok: true, delivered: false }`
- `chat.abort` → log params, return `{ ok: true, aborted: false }`

### Step 6: Validate request structure

- Check `type === 'req'`, `typeof id === 'string'`, `typeof method === 'string'`
- Return error response if validation fails

## Todo List

- [ ] Define RpcRequest and RpcResponse interfaces
- [ ] Implement handleRpc dispatcher function with method switch
- [ ] Implement `connect` handler with hello-ok payload
- [ ] Implement `health` handler
- [ ] Implement `agents.list` handler
- [ ] Implement `config.get` handler with not-found error
- [ ] Implement `sessions.list` handler
- [ ] Implement `sessions.preview` handler
- [ ] Implement `status` handler
- [ ] Implement `exec.approvals.get` handler (empty)
- [ ] Implement `chat.send` handler (log + ack)
- [ ] Implement `chat.abort` handler (log + ack)
- [ ] Add request validation (type, id, method required)
- [ ] Add unknown method error response

## Success Criteria

1. All 10 RPC methods return correct response structure
2. `connect` returns valid hello-ok with snapshot from registry
3. `agents.list` reflects current registry state
4. `sessions.preview` returns ring buffer contents
5. Unknown methods return error response (not crash)
6. Invalid requests return error response

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Protocol mismatch with Claw3D | Claw3D shows no agents | Test with real Claw3D connection in Phase 4 |
| Missing fields in hello-ok | Claw3D rejects connection | Include all fields from confirmed protocol spec |
| chat.send expectation mismatch | Users confused msgs not delivered | Return `delivered: false` honestly |

## Security Considerations

- `connect` accepts any token for v1 — no token validation
- `chat.send` does not forward to agents — no injection risk
- All data from in-memory registry — no file system access
