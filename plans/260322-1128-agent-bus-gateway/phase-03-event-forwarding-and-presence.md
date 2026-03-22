# Phase 3: Event Forwarding & Presence

## Context Links
- [Plan overview](plan.md)
- [Phase 1 — Server & Registry](phase-01-gateway-server-and-registry.md)
- [Phase 2 — Protocol Handler](phase-02-protocol-handler-rpc-methods.md)
- [Event translator (reuse)](../../src/adapter/event-translator.ts)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 1h
- **Description:** Wire hub events through the registry into Claw3D-compatible event frames, broadcast to connected browsers. Implement presence tracking and tick keepalive.

## Key Insights
- Existing `translateEvent()` from `event-translator.ts` already handles the AgentEvent -> Claw3D frame mapping for `agent` and `chat` events.
- Presence events are NEW — not in the current adapter. They broadcast when the agent registry changes (agent joins/leaves).
- Tick is a simple keepalive — `{ type: "event", event: "tick", payload: { ts } }` every 30s.
- Event flow: hub message -> validate -> registry.handleEvent() -> decide what to broadcast -> broadcast to all connected clients.

## Requirements

### Functional
1. Forward translated `agent` lifecycle events to all connected Claw3D clients
2. Forward translated `chat` events to all connected Claw3D clients
3. Broadcast `presence` event when agent registry changes (session_start, session_end)
4. Send `tick` keepalive every 30s
5. Only broadcast to clients that completed the connect handshake

### Non-Functional
- Broadcast latency: < 10ms from hub message receipt
- No dropped events (send to all connected clients)

## Event Flow

```
Hub message (AgentEvent JSON)
  |
  v
gateway.onHubMessage()
  |
  ├── isValidEvent(parsed)?
  |     no → discard
  |     yes ↓
  |
  ├── registry.handleEvent(event)
  |     returns: { agentChanged, chatFrame, lifecycleFrame }
  |
  ├── if lifecycleFrame:
  |     broadcast(lifecycleFrame) to all connected clients
  |
  ├── if chatFrame:
  |     broadcast(chatFrame) to all connected clients
  |
  └── if agentChanged:
        build presence frame with full agent list
        broadcast(presenceFrame) to all connected clients
```

## Event Frames

### Agent Lifecycle (from translateEvent)

Already implemented in `event-translator.ts`:
```json
{
  "type": "event", "event": "agent",
  "payload": {
    "runId": "abc123def456",
    "sessionKey": "agent:tickets-backend-dev:main",
    "stream": "lifecycle",
    "data": { "phase": "start" }
  }
}
```

### Chat Activity (from translateEvent)

Already implemented:
```json
{
  "type": "event", "event": "chat",
  "payload": {
    "runId": "abc123def456",
    "sessionKey": "agent:tickets-backend-dev:main",
    "state": "delta",
    "message": "Using Edit on auth.ts"
  }
}
```

### Presence (NEW)

Broadcast when agent registry changes:
```json
{
  "type": "event", "event": "presence",
  "payload": {
    "agents": [
      {
        "id": "backend-dev",
        "identity": { "name": "Backend Dev", "theme": "coding agent", "emoji": "..." },
        "status": "active",
        "runId": "abc123def456",
        "sessionKey": "agent:tickets-backend-dev:main"
      }
    ],
    "stateVersion": { "presence": 3, "health": 0 }
  }
}
```

### Tick (NEW)

Every 30s:
```json
{
  "type": "event", "event": "tick",
  "payload": { "ts": 1711065600000 }
}
```

## Related Code Files

### Modify (from Phase 1)
- `src/gateway/agent-bus-gateway.ts` — add event routing + broadcast logic

### Reuse (import)
- `src/adapter/event-translator.ts` — translateEvent()

## Implementation Steps

### Step 1: Refine registry.handleEvent() return type

```typescript
interface HandleEventResult {
  agentChanged: boolean;          // true if presence needs broadcasting
  lifecycleFrame: Claw3dEventFrame | null;  // agent start/end frame
  chatFrame: Claw3dEventFrame | null;       // chat delta/final frame
}
```

- `session_start`: agentChanged=true, lifecycleFrame=translateEvent(event), chatFrame=null
- `tool_use`: agentChanged=false, lifecycleFrame=null, chatFrame=translateEvent(event)
- `task_complete`: agentChanged=false, lifecycleFrame=null, chatFrame=translateEvent(event)
- `session_end`: agentChanged=true, lifecycleFrame=translateEvent(event), chatFrame=null
- `heartbeat`: agentChanged=false, both null

### Step 2: Implement broadcast in gateway

In `agent-bus-gateway.ts`, after `registry.handleEvent()`:

```typescript
function onHubMessage(data: Buffer) {
  const parsed = JSON.parse(data.toString());
  if (!isValidEvent(parsed)) return;

  const result = registry.handleEvent(parsed);

  // Forward lifecycle events
  if (result.lifecycleFrame) {
    broadcast(result.lifecycleFrame);
  }

  // Forward chat events
  if (result.chatFrame) {
    broadcast(result.chatFrame);
  }

  // Broadcast presence on agent change
  if (result.agentChanged) {
    broadcast(buildPresenceFrame(registry));
  }
}
```

### Step 3: Implement buildPresenceFrame helper

```typescript
function buildPresenceFrame(registry: AgentRegistry): object {
  return {
    type: 'event',
    event: 'presence',
    payload: {
      agents: registry.getPresenceSnapshot(),
      stateVersion: registry.getStateVersion(),
    },
  };
}
```

### Step 4: Implement tick timer

In gateway `start()`:
```typescript
const tickInterval = setInterval(() => {
  broadcast({ type: 'event', event: 'tick', payload: { ts: Date.now() } });
}, 30000);
```

In `stop()`:
```typescript
clearInterval(tickInterval);
```

### Step 5: Implement broadcast function

```typescript
function broadcast(frame: object) {
  const payload = JSON.stringify(frame);
  for (const client of clients) {
    if (client.meta.connected && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}
```

- Only send to clients that completed connect handshake (`meta.connected === true`)
- Check readyState to avoid sending to closing connections

### Step 6: Add chat message to ring buffer during event handling

In `registry.handleEvent()` for `tool_use` and `task_complete`:
- Extract message from the translated frame
- Push to session's message ring buffer
- If buffer length > 100, shift oldest

## Todo List

- [ ] Refine HandleEventResult type with lifecycleFrame + chatFrame
- [ ] Update registry.handleEvent() to return proper result with translated frames
- [ ] Implement onHubMessage routing in gateway (lifecycle -> broadcast, chat -> broadcast, presence -> broadcast)
- [ ] Implement buildPresenceFrame helper
- [ ] Implement broadcast function (connected clients only, readyState check)
- [ ] Implement tick timer (30s interval, broadcast to all connected)
- [ ] Add ring buffer push in handleEvent for tool_use/task_complete
- [ ] Verify chat messages stored in session history during forwarding

## Success Criteria

1. `session_start` hub event -> `agent` lifecycle frame + `presence` frame broadcast to Claw3D
2. `tool_use` hub event -> `chat` delta frame broadcast to Claw3D
3. `task_complete` hub event -> `chat` final frame broadcast to Claw3D
4. `session_end` hub event -> `agent` lifecycle frame + `presence` frame broadcast
5. `heartbeat` -> no broadcast (silent lastSeen update)
6. Tick sent every 30s to all connected clients
7. Disconnected clients do not receive broadcasts (no errors)
8. Chat messages accumulate in ring buffer (verifiable via sessions.preview RPC)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Presence frame format mismatch | Claw3D ignores presence updates | Match exact OpenClaw format from docs |
| Broadcast to dead socket throws | Gateway crash | readyState check + try/catch in broadcast |
| High event rate overwhelms clients | Browser lag | Claw3D already handles this; hub is low volume (~1 event/sec) |

## Security Considerations

- No sensitive data in event frames (tool names, file paths only)
- Ring buffer auto-discards old messages — bounded memory
- Presence broadcast goes to all clients — acceptable for local network
