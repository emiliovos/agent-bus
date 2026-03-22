# Claw3D Working Animation Latch Trigger — Exact Specification

**Report:** Researcher analysis of event payload format that triggers working/active animation
**Date:** 2026-03-22
**Source files analyzed:**
- `src/lib/office/eventTriggers.ts` (lines 900–1032, 1295–1371)
- `src/features/agents/state/runtimeEventBridge.ts` (type definitions)
- `src/features/agents/state/gatewayRuntimeEventHandler.ts` (event flow)

---

## Summary

The "working" animation latch is triggered **ONLY** when:
- A **runtime-chat** OR **runtime-agent** event arrives
- With a **non-empty `runId`** field in the payload
- Regardless of `state`, `stream`, role, or message content

The working latch duration is **5000ms** (5 seconds) from event timestamp. No store state prerequisites are required.

---

## Exact Trigger Conditions

### 1. Runtime-Chat Events (event="chat")

**Minimal payload that triggers working:**
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "uuid-string",
    "sessionKey": "agent-session-key",
    "state": "delta"
  }
}
```

**Code path (eventTriggers.ts:913–922):**
```typescript
if (kind === "runtime-chat") {
  const payload = params.event.payload as ChatEventPayload | undefined;
  const agentId = resolveAgentIdForSessionKey(params.agents, payload?.sessionKey);
  if (!payload || !agentId) return next;

  if (payload.runId) {  // ← THIS IS THE TRIGGER
    next = {
      ...next,
      workingUntilByAgentId: recordWorkingActivity(
        next.workingUntilByAgentId,
        agentId,
        nowMs,
      ),
    };
  }
}
```

**Chat event type definition (runtimeEventBridge.ts:66–74):**
```typescript
export type ChatEventPayload = {
  runId: string;           // ← REQUIRED to trigger working
  sessionKey: string;      // ← REQUIRED to resolve agent ID
  state: "delta" | "final" | "aborted" | "error";
  seq?: number;
  stopReason?: string;
  message?: unknown;
  errorMessage?: string;
};
```

**Key observations:**
- `runId` must be a **non-empty trimmed string** (line 913: `if (payload.runId)`)
- `state` field is **irrelevant** to triggering working
- `message` field is **irrelevant** to triggering working
- Message role, text content, thinking content do NOT affect working latch

### 2. Runtime-Agent Events (event="agent")

**Minimal payload that triggers working:**
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "uuid-string",
    "sessionKey": "agent-session-key"
  }
}
```

**Code path (eventTriggers.ts:958–967):**
```typescript
if (payload.runId) {  // ← SAME TRIGGER
  next = {
    ...next,
    workingUntilByAgentId: recordWorkingActivity(
      next.workingUntilByAgentId,
      agentId,
      nowMs,
    ),
  };
}
```

**Agent event type definition (runtimeEventBridge.ts:76–82):**
```typescript
export type AgentEventPayload = {
  runId: string;           // ← REQUIRED to trigger working
  seq?: number;
  stream?: string;
  data?: Record<string, unknown>;
  sessionKey?: string;
};
```

**Key observations:**
- `runId` alone triggers working
- `stream` field is **irrelevant** to working latch (only affects thinking/streaming latches)
- `data` field is **irrelevant** to working latch
- Phase ("start", "end", etc.) does NOT directly trigger working

---

## The Working Latch Function

**Location:** `eventTriggers.ts:665–672`

```typescript
const recordWorkingActivity = (
  current: NumberByAgentId,
  agentId: string,
  nowMs: number,
): NumberByAgentId => ({
  ...current,
  [agentId]: Math.max(current[agentId] ?? 0, nowMs + WORKING_LATCH_MS),
});
```

**Parameters:**
- `current` — map of `agentId → timestamp` tracking when "working" expires
- `agentId` — agent that triggered activity
- `nowMs` — current time in milliseconds

**Logic:**
- Sets `workingUntilByAgentId[agentId]` to the **maximum** of:
  - Existing expiry time (preserves ongoing latch)
  - `nowMs + 5000` (new 5-second latch)
- Multiple events within 5s extend the latch to 5s from latest event

**Duration constant (line 53):**
```typescript
const WORKING_LATCH_MS = 5_000;
```

---

## Animation Rendering

The working latch is **directly exported** to the 3D scene:

**buildOfficeAnimationState (lines 1353–1371):**
```typescript
return {
  // ... other animation state fields ...
  workingUntilByAgentId: params.state.workingUntilByAgentId,  // ← Raw timestamp map
};
```

The 3D renderer then checks:
```
isAgentWorking = (workingUntilByAgentId[agentId] ?? 0) > nowMs
```

This means:
- At moment `nowMs`, agent shows working animation if stored timestamp is **in the future**
- Animation lasts until expiry timestamp passes
- No intermediate boolean transformation—pure timestamp comparison

---

## Reconciliation (Durable Working State)

**Lines 1068–1075** show an additional working trigger during reconciliation:
```typescript
const isAgentRunning = agent.status === "running" || Boolean(agent.runId);
if (isAgentRunning) {
  workingUntilByAgentId = recordWorkingActivity(
    workingUntilByAgentId,
    agentId,
    nowMs,
  );
}
```

This ensures agents with `status: "running"` or a `runId` in store are **always** shown as working, even if gateway events were missed.

---

## Event Classification

**Gateway event → event trigger classification (runtimeEventBridge.ts:151–156):**
```typescript
export const classifyGatewayEventKind = (event: string): GatewayEventKind => {
  if (event === "presence" || event === "heartbeat") return "summary-refresh";
  if (event === "chat") return "runtime-chat";
  if (event === "agent") return "runtime-agent";
  return "ignore";
};
```

- Only `event: "chat"` and `event: "agent"` reach the working trigger path
- `event: "presence"` and `event: "heartbeat"` are **not processed** by eventTriggers
- Everything else is ignored

---

## Store State Prerequisites

**CRITICAL:** None required.

- Event is processed **independently** of agent store state
- Agent's current `status`, `runId`, or session state are **not checked** before triggering working
- If `agentId` cannot be resolved from `sessionKey`, event is dropped (line 909, 957)
- But if agent exists, working latch fires **unconditionally** on any chat/agent event with runId

---

## Event Sequence Patterns

### Pattern 1: Chat-First (No Lifecycle Required)

```json
{ "event": "chat", "payload": { "runId": "run123", "sessionKey": "session1", "state": "delta" } }
```

Result: Agent immediately shows working for 5s. No lifecycle event needed.

### Pattern 2: Lifecycle Start + Chat Delta

```json
{ "event": "agent", "payload": { "runId": "run123", "sessionKey": "session1", "stream": "lifecycle", "data": { "phase": "start" } } }
```

Result:
- Agent status → "running" (via runtimeEventHandler → updateAgent)
- Working latch set via reconciliation (agent has runId)

Then:
```json
{ "event": "chat", "payload": { "runId": "run123", "sessionKey": "session1", "state": "delta", "message": { "role": "assistant" } } }
```

Result:
- Working latch **extends** 5s from this event timestamp
- Streaming latch also fires (assistant role + text)

### Pattern 3: Just Runid (Minimal Trigger)

```json
{ "event": "chat", "payload": { "runId": "run123", "sessionKey": "session1" } }
```

Result: Working latch fires. No message, no state, no role needed.

---

## Why Agent Stays Idle (Common Issue)

Agent stays idle when:

1. **No `runId` in payload** (most common)
   - `{ "event": "chat", "payload": { "sessionKey": "...", "state": "delta" } }`
   - Condition at line 913 fails, working never recorded

2. **No `sessionKey` or unresolvable sessionKey**
   - Agent ID cannot be resolved (line 905–908)
   - Event rejected before working check

3. **Event type not "chat" or "agent"**
   - Classified as "ignore" (line 155)
   - Never reaches eventTriggers at all

4. **Store reconciliation is stale**
   - If no gateway events with runId arrive, and store status != "running", working never set
   - Fix: send at least one chat event with runId

---

## Implementation Checklist for Agent-Bus Gateway

To trigger Claw3D working animation:

- [ ] **Include `runId` in EVERY chat event** (UUID, non-empty)
- [ ] **Include `runId` in EVERY agent event** (if using lifecycle with chat)
- [ ] **Include `sessionKey`** (must match an agent's registered session)
- [ ] **Event type must be "chat" or "agent"** (not "presence" or "heartbeat")
- [ ] No need to set `message`, `role`, or `state` for working to trigger
- [ ] No need to send lifecycle start first—chat delta with runId is sufficient
- [ ] Working lasts 5000ms from event timestamp; use periodic events to sustain

---

## Minimal Working WebSocket Frame

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "12345678-1234-1234-1234-123456789012",
    "sessionKey": "agent-uuid",
    "state": "delta"
  }
}
```

Send every 4 seconds to sustain working animation (5s latch with 1s overlap margin).

---

## Unresolved Questions

1. Is there validation on `runId` format (UUID vs. any string)? Code only checks truthiness, so any non-empty string works.
2. Can `sessionKey` be optional if `payload` contains agent metadata instead? Code requires sessionKey resolution or direct agentId.
3. Does animation rendering use animation frame throttling that could add latency between working timestamp being set and animation becoming visible?
