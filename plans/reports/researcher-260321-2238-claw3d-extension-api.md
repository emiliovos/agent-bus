# Claw3D Extension & External Event Source Research

**Date:** 2026-03-21
**Researcher:** Claude Code
**Status:** Complete

---

## Executive Summary

Claw3D is a **visualization layer** on top of OpenClaw, not a plugin-based system. It receives all events through a **WebSocket proxy bridge** that speaks a simple JSON-RPC-like protocol. Events drive the 3D office through a **deterministic derivation pipeline** (classify → reduce → reconcile → build). While Claw3D itself is not pluggable, you **can inject custom events** at the gateway-proxy level or by extending the `GatewayClient` event handler to accept non-OpenClaw sources.

---

## 1. How Claw3D Receives Events from the Gateway

### Protocol: WebSocket JSON-RPC-like Frames

**Location:** `server/gateway-proxy.js` (proxy layer)

Claw3D uses a **two-hop WebSocket architecture:**

```
Browser ─── /api/gateway/ws (same-origin) ─── Studio Server ─── ws://gateway:18789 (OpenClaw Gateway)
```

### Message Format

All frames are JSON with this shape:

```typescript
// Request
type ReqFrame = {
  type: "req";
  id: string;           // UUID for matching responses
  method: string;       // e.g., "connect", "agents.list", "chat.send"
  params: unknown;      // payload
};

// Response
type ResFrame = {
  type: "res";
  id: string;           // matches request id
  ok: boolean;
  payload?: unknown;    // response data
  error?: {
    code: string;       // e.g., "INVALID_REQUEST"
    message: string;
    retryable?: boolean;
  };
};

// Event (streaming)
type EventFrame = {
  type: "event";
  event: string;        // e.g., "chat", "agent", "presence", "heartbeat"
  payload?: unknown;    // event data
  seq?: number;         // sequence for dedup
  stateVersion?: {
    presence: number;
    health: number;
  };
};
```

### Critical Flow: First Message Must Be `connect`

The proxy enforces a **state machine:**

1. Browser sends `{ type: "req", method: "connect", id: "...", params: { auth: { token: "..." } } }`
2. Studio verifies/injects auth token server-side (in `gateway-proxy.js` lines 134-152)
3. Studio forwards to upstream gateway
4. Gateway responds with `{ type: "res", id: "...", ok: true }`
5. Only after `connect` succeeds can other requests/events flow

**Code:** `server/gateway-proxy.js` lines 253-281

---

## 2. Can Claw3D Render Custom Agent Activity Without OpenClaw?

**Short answer:** Yes, with caveats. Claw3D doesn't strictly require OpenClaw runtime data.

### Current Architecture

**Runtime event flow:**
```
EventFrame (from gateway)
  → GatewayClient receives
  → gatewayRuntimeEventHandler routes
  → classify as "chat" | "agent" | "summary-refresh" | "ignore"
  → runtime workflows plan state updates
  → agent store updates
  → office UI consumes derived state
```

**Office animation is 100% derived:**

1. **Event reduction** (`eventTriggers.ts` lines 50-148):
   - Records short-lived latches (working for 5s, streaming for 6s, etc.)
   - Parses user directives (desk holds, gym commands, standup requests)

2. **Reconciliation** (`eventTriggers.ts` reconcileOfficeAnimationTriggerState):
   - Rebuilds durable holds from current agent state + transcript history
   - NOT dependent on live gateway streams

3. **Animation building** (`buildOfficeAnimationState`):
   - Collapses trigger state into smaller shape for scene
   - Pure transformation, no gateway dependency

**Minimum to render:**
```typescript
// You need only:
const agentState = {
  agentId: "agent-123",
  status: "running" | "idle" | "error",
  outputLines: string[],
  workingUntilMs?: number,  // if agent is "working"
  lastActivityAt?: number,
};

const officeState = buildOfficeAnimationState({
  agents: [agentState],
  triggerState: {...},  // from event reduction
});

// The 3D scene then consumes officeState to render agent movement, desk holds, etc.
```

### Minimum Event Structure

The absolute minimum to trigger office animation:

```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-abc",
    "stream": "lifecycle",
    "data": {
      "phase": "start"  // or "end", "error"
    },
    "sessionKey": "agent:agent-123:main"
  }
}
```

This will set the agent to `status: "running"` without needing the full OpenClaw runtime.

---

## 3. Gateway Proxy Protocol & Message Relay

### What `gateway-proxy.js` Does

**File:** `server/gateway-proxy.js` (311 lines)

**Core behavior:**

```javascript
// 1. On browser WebSocket connection:
wss.on("connection", (browserWs) => {
  // 2. Start upstream connection (async)
  startUpstream();

  // 3. On first browser message, expect connect:
  browserWs.on("message", (raw) => {
    const parsed = JSON.parse(raw);
    if (!connectRequestId) {
      if (parsed.type !== "req" || parsed.method !== "connect") {
        closeBoth(1008, "connect required");
        return;
      }
    }
    // 4. Forward to upstream (with token injection if needed)
    upstreamWs.send(JSON.stringify(parsed));
  });

  // 5. Relay upstream responses/events back to browser
  upstreamWs.on("message", (upRaw) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(String(upRaw));
    }
  });
});
```

**Key responsibilities:**
- Enforce connect-first protocol
- Inject upstream token from server-side Studio settings (keeps secrets off browser)
- Proxy request/response/event frames bidirectionally
- Handle disconnection, timeouts, malformed JSON

### Token Injection (Lines 28-34)

```javascript
const injectAuthToken = (params, token) => {
  const next = isObject(params) ? { ...params } : {};
  const auth = isObject(next.auth) ? { ...next.auth } : {};
  auth.token = token;  // Server-side token, never from browser
  next.auth = auth;
  return next;
};
```

This is the security boundary: browser cannot override the upstream token.

---

## 4. Agent Rendering in the 3D Office

### Event-to-Animation Pipeline

**File:** `src/lib/office/eventTriggers.ts`

Events are **not imperative commands** to the scene. They're **state latches** that the 3D engine derives from:

#### Phase 1: Event Reduction (Classify & Latch)

```typescript
export type OfficeAnimationTriggerState = {
  deskHoldByAgentId: BooleanByAgentId,      // agent at desk
  workingUntilByAgentId: NumberByAgentId,   // working latch (5s)
  streamingUntilByAgentId: NumberByAgentId, // streaming latch (6s)
  thinkingUntilByAgentId: NumberByAgentId,  // thinking latch (6s)
  phoneCallByAgentId: PhoneCallByAgentId,   // active phone booth
  textMessageByAgentId: TextMessageByAgentId, // SMS booth
  // ... many more holds for gym, QA lab, server room, etc.
};

// Event → trigger state
const reduceOfficeAnimationTriggerEvent = (event, prevState) => {
  // Parse "working" hints from chat events
  // Record "gym workout" directives
  // Latch streaming/thinking timestamps
  // Extract desk/room directives from agent output
};
```

#### Phase 2: Reconciliation (Rebuild from State)

```typescript
const reconcileOfficeAnimationTriggerState = (
  agents: AgentState[],           // from store
  currentTriggerState: OfficeAnimationTriggerState,
  transcript: string[]            // agent output lines
): OfficeAnimationTriggerState => {
  // Re-derive durable holds from agent.status + transcript history
  // "If agent output contains 'gym', agent should hold gym until...?
  // "If agent status changed from idle to running, start working latch"
  // Stateless rebuilding from first principles
};
```

#### Phase 3: Animation Build (Collapse to Scene Shape)

```typescript
export type OfficeAnimationState = {
  deskHoldByAgentId: BooleanByAgentId,
  gymHoldByAgentId: BooleanByAgentId,        // derived from trigger state
  phoneBoothHoldByAgentId: BooleanByAgentId, // "
  // ...
};

const buildOfficeAnimationState = (agents, triggerState) => {
  // Remove timers that have expired
  // Collapse trigger state to boolean holds
  // Merge approval status, streaming activity, etc.
  // Return final shape for 3D scene
};
```

### What Triggers Agent Movement

**File:** `src/features/retro-office/RetroOffice3D.tsx`

The scene **subscribes to OfficeAnimationState** and maps holds to destinations:

```typescript
const useAgentTick = (agent: AgentState, animationState: OfficeAnimationState) => {
  // If deskHoldByAgentId[agent.id] → navigate to assigned desk
  // If phoneBoothHoldByAgentId[agent.id] → navigate to phone booth
  // If gymHoldByAgentId[agent.id] → navigate to gym
  // If streamingByAgentId[agent.id] → idle at current desk, show stream indicator
  // If workingUntilByAgentId[agent.id] → show "working" status until timer expires
};
```

**Navigation resolution:** `src/features/retro-office/core/navigation.ts`

---

## 5. Contributing to Claw3D: PR Guidelines

**File:** `CONTRIBUTING.md`

### Before Starting
- Install OpenClaw locally (claw3d doesn't build it; it's a UI layer)
- Read `CODE_DOCUMENTATION.md` (practical code map, extension points)
- Use GitHub Issues for bugs/features/questions

### Testing Requirements (Pre-PR)
```bash
npm run lint      # ESLint
npm run typecheck # TypeScript check
npm run test      # Vitest unit tests
npm run e2e       # Playwright end-to-end (optional)
```

### PR Expectations
- Keep PRs focused (one task per PR)
- Include tests if you touched runtime workflows or office intent
- Update docs when user-facing behavior or architecture changes
- If you touched bundled assets or dependency/licensing, update `THIRD_PARTY_*` docs
- Link to relevant GitHub issue when possible

### Architecture Guardrails (`.cursor/rules/claw3d-project-guardrails.mdc`)
- Keep OpenClaw as source of truth (don't replicate state in UI)
- Distinguish immersive office (React Three Fiber) from builder (Phaser)
- Respect server/client boundary (no direct filesystem access from browser)
- Don't break OpenClaw gateway protocol compatibility

---

## 6. Plugin/Extension Architecture

### Current State: No Plugin System

Claw3D is **monolithic**. There is **no plugin registry, loader, or extension point** system.

Why?
- It's early-stage (open-source in 2025, still stabilizing)
- Focus is on being a thin visualization layer over OpenClaw
- Intentional: keep OpenClaw as system of record

### How You Can Extend

**Option 1: Extend at the Event Source**

Create a **bridge adapter** that speaks the gateway WebSocket protocol:

```typescript
// pseudocode
class CustomEventBridge {
  connect(studioProxyUrl: string, token: string) {
    const ws = new WebSocket(studioProxyUrl);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "req",
        id: "connect-123",
        method: "connect",
        params: { auth: { token } },
      }));
    });
  }

  emitAgentEvent(agentId: string, status: "running" | "idle") {
    this.ws.send(JSON.stringify({
      type: "event",
      event: "agent",
      payload: {
        runId: "run-xyz",
        sessionKey: `agent:${agentId}:main`,
        stream: "lifecycle",
        data: { phase: status === "running" ? "start" : "end" },
      },
    }));
  }
}
```

**Option 2: Patch GatewayClient Event Handler**

Modify `src/lib/gateway/GatewayClient.ts` to accept events from multiple sources:

```typescript
class ExtendedGatewayClient extends GatewayClient {
  injectCustomEvent(event: EventFrame) {
    // Bypass WebSocket, inject directly into event handler
    this.eventHandlers.forEach((handler) => handler(event));
  }
}
```

**Option 3: Modify gateway-proxy.js**

Add a local event injection endpoint:

```javascript
// In server/gateway-proxy.js, add:
app.post("/api/inject-event", (req, res) => {
  const event = req.body;
  // Validate, then broadcast to all connected browsers
  for (const browserWs of connectedBrowsers) {
    browserWs.send(JSON.stringify(event));
  }
  res.json({ ok: true });
});
```

This is **not officially supported** but technically feasible.

---

## 7. Event Trigger System (`eventTriggers.ts`)

### Overview

**File:** `src/lib/office/eventTriggers.ts` (650+ lines)

Maps gateway events → office animation state. This is the **single entry point** for office behavior.

### Event Classification

**File:** `src/features/agents/state/runtimeEventBridge.ts` lines 143-156

```typescript
export type GatewayEventKind =
  | "summary-refresh"    // presence, heartbeat
  | "runtime-chat"       // chat event (messages)
  | "runtime-agent"      // agent event (lifecycle, streams)
  | "ignore";            // unknown

export const classifyGatewayEventKind = (event: string): GatewayEventKind => {
  if (event === "presence" || event === "heartbeat") return "summary-refresh";
  if (event === "chat") return "runtime-chat";
  if (event === "agent") return "runtime-agent";
  return "ignore";
};
```

### Trigger State Latches

```typescript
const WORKING_LATCH_MS = 5_000;           // agent marked "working" for 5s
const GYM_WORKOUT_LATCH_MS = 60_000;      // gym activity lasts 60s
const STREAM_ACTIVITY_LATCH_MS = 6_000;   // streaming indicator for 6s
const THINKING_ACTIVITY_LATCH_MS = 6_000; // thinking indicator for 6s
```

### Intent Parsing

**File:** `src/lib/office/deskDirectives.ts`

Parses user text into office directives:

```typescript
export const resolveOfficeIntentSnapshot = (text: string) => {
  // Detect "go to gym", "work on desk", "@standup", etc.
  // Return: { deskHold, gymHold, qaHold, standupRequest, ... }
};

export const resolveOfficeDeskDirective = (text: string) => {
  // If text contains "desk", agent should go to assigned desk
};

export const resolveOfficeGymDirective = (text: string) => {
  // If text contains "gym", "workout", "train" → gym hold
};
```

### Custom Room Extension

To add a new room (e.g., "library"):

1. **Add intent parsing:**
   ```typescript
   // In deskDirectives.ts
   export const resolveOfficeLibraryDirective = (text: string) => {
     return /library|book|research/.test(text.toLowerCase());
   };
   ```

2. **Add to trigger state:**
   ```typescript
   export type OfficeAnimationTriggerState = {
     libraryHoldByAgentId: BooleanByAgentId,  // new field
     // ...
   };
   ```

3. **Add navigation target:**
   ```typescript
   // In src/features/retro-office/core/navigation.ts
   const libraryTarget = {
     x: 15, y: 12, // room coordinates
     name: "library",
   };
   ```

4. **Add room objects:**
   ```typescript
   // In src/features/retro-office/core/furnitureDefaults.ts
   const defaultLibrary = {
     type: "bookshelf",
     position: [15, 0, 12],
     // ...
   };
   ```

5. **Render in scene:**
   ```typescript
   // In RetroOffice3D.tsx
   case "bookshelf":
     return <Bookshelf key={obj.id} {...obj} />;
   ```

6. **Wire animation:**
   ```typescript
   // In RetroOffice3D.tsx useAgentTick()
   if (animationState.libraryHoldByAgentId[agent.id]) {
     navigateTo(libraryTarget);
   }
   ```

**Example to follow:** `src/features/retro-office/core/navigation/gymRoute.ts`

---

## 8. Contributing Workflow

### Recommended Onboarding Order (from CODE_DOCUMENTATION.md)

1. `README.md` — overview
2. `ARCHITECTURE.md` — system boundaries
3. `src/app/office/page.tsx` — office composition root
4. `src/features/office/screens/OfficeScreen.tsx` — office UI wiring
5. `src/features/agents/state/gatewayRuntimeEventHandler.ts` — event routing
6. `src/features/agents/state/runtimeEventCoordinatorWorkflow.ts` — state updates
7. `src/lib/office/eventTriggers.ts` — animation derivation ⭐
8. `src/lib/office/deskDirectives.ts` — intent parsing
9. `src/features/retro-office/RetroOffice3D.tsx` — 3D scene
10. `src/features/retro-office/core/navigation.ts` — pathfinding

### Test Coverage Examples

- `tests/unit/deskDirectives.test.ts` — office intent parsing
- `tests/unit/officeEventTriggers.test.ts` — animation trigger derivation
- `tests/unit/gatewayRuntimeEventHandler.chat.test.ts` — chat event handling
- `tests/unit/transcript.test.ts` — history/transcript merging

### Code Quality Gates

```bash
# Before opening PR:
npm run lint       # Must pass
npm run typecheck  # Must pass
npm run test       # Should pass
```

---

## Unresolved Questions

1. **Plugin System Roadmap**: Is there a planned date for plugin/extension support, or will Claw3D remain monolithic? (ROADMAP.md doesn't mention it under "Later" phase)

2. **Event Versioning**: Does the gateway protocol support event versioning? If the event contract changes, how is backward compatibility maintained?

3. **Non-OpenClaw Sources**: Are there any known implementations of non-OpenClaw event sources feeding into Claw3D? (No examples found in public repo)

4. **Immersive Office ↔ Builder Convergence**: The ROADMAP mentions "converge the immersive office and builder stack on a clearer shared model." How will custom event sources fit into the unified model?

5. **State Versioning**: `GatewayStateVersion` has `presence` and `health` fields. Are these reserved, or can custom bridges use them for custom state tracking?

6. **Concurrent Event Streams**: Can Claw3D handle events from multiple independent gateways or event sources simultaneously? Is there session-key isolation?

---

## Key Files for Extension

| File | Purpose | Extensibility |
|------|---------|---|
| `server/gateway-proxy.js` | WebSocket relay | Add POST endpoint for event injection |
| `src/lib/gateway/GatewayClient.ts` | Event reception | Extend `onEvent()` to accept custom sources |
| `src/lib/office/eventTriggers.ts` | Animation derivation | Add new latch types, trigger conditions |
| `src/lib/office/deskDirectives.ts` | Intent parsing | Add new directive resolvers |
| `src/features/retro-office/RetroOffice3D.tsx` | 3D scene | Add new room/object rendering |
| `src/features/retro-office/core/navigation.ts` | Agent pathfinding | Add new navigation targets |
| `src/features/retro-office/core/furnitureDefaults.ts` | Office defaults | Add new room objects |

---

## Bottom Line

**Claw3D can render custom agent activity without OpenClaw**, provided you:

1. Emit `EventFrame` objects in the correct format
2. Route them through the gateway-proxy WebSocket (or inject via post-proxy hook)
3. Ensure event classification works (agent/chat/presence)
4. Let the derivation pipeline do the heavy lifting (don't try to push animation state directly)

The system is **not pluggable by design**, but **highly injectable** at the event source layer. For the VibeDev Studio use case (Claude Code session bridge), the cleanest path is:

- **Bridge adapter** in Claude Code that opens a WebSocket to Studio's `/api/gateway/ws`
- Speaks the OpenClaw protocol (req/res/event frames)
- Emits `agent` and `chat` events with minimal payloads
- Let Claw3D's derivation pipeline handle the rest

No modification to Claw3D itself needed.
