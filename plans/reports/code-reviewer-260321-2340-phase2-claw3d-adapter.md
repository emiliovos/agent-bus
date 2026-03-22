# Code Review: Phase 2 -- Claw3D Adapter

**Reviewer:** code-reviewer
**Date:** 2026-03-21
**Score:** 8/10

---

## Scope

- **Files:** 4 (3 source + 1 test)
- **LOC:** 420 total (119 + 115 + 23 + 163)
- **Focus:** Phase 2 Claw3D adapter -- event translation, dual WS client, reconnection
- **TypeScript:** Passes `tsc --noEmit` with zero errors
- **Tests:** 16/16 passing (99ms)

---

## Overall Assessment

Solid, well-structured implementation. Clean separation between translator (pure functions) and adapter (stateful WS management). Protocol compliance with Claw3D is correct based on research report. All files under 200-line limit. Good test coverage on the translator layer. A few security/robustness gaps worth addressing before production use.

---

## Critical Issues

### [C1] No validation of hub messages before translation

**File:** `src/adapter/claw3d-adapter.ts:30`

The adapter `JSON.parse`s incoming hub messages and casts directly to `AgentEvent` without validation. If the hub broadcasts malformed data (or a different message type is added later), the adapter will blindly forward garbage to Claw3D.

```typescript
// Current
const event = JSON.parse(data.toString()) as AgentEvent;
forwardEvent(event);

// Recommended
const parsed: unknown = JSON.parse(data.toString());
if (!isValidEvent(parsed)) {
  console.warn('[adapter] ignoring invalid hub message');
  return;
}
forwardEvent(parsed);
```

**Impact:** Defense-in-depth. Hub already validates, but the adapter should not trust its upstream unconditionally. `isValidEvent` already exists in `src/types/agent-event.ts` -- zero cost to import.

### [C2] Connect rejection not handled

**File:** `src/adapter/claw3d-adapter.ts:60-70`

The adapter checks for `msg.type === 'res' && msg.ok === true` but never handles the rejection case (`ok === false`). Per the Claw3D protocol (research report Section 3), a failed connect returns `{ type: "res", ok: false, error: { code, message } }`. Currently the adapter silently ignores this and stays in `claw3dConnected = false` forever, dropping all events until the next reconnect cycle (which will also fail with the same bad token).

```typescript
// Recommended addition after line 66:
if (msg.type === 'res' && msg.ok === false) {
  const errMsg = (msg.error as Record<string, unknown>)?.message ?? 'unknown';
  console.error('[adapter] Claw3D connect rejected:', errMsg);
  // Don't reconnect with same bad credentials -- log and let operator fix
  claw3dWs?.close();
}
```

**Impact:** Without this, a bad CLAW3D_TOKEN causes silent failure with no actionable log output. Operator sees "connected to Claw3D" but never "authenticated."

---

## High Priority

### [H1] Token logged if debug/verbose logging added later

**File:** `src/adapter/claw3d-adapter.ts:54-57`

The token is passed directly into `buildConnectFrame` which embeds it in a JSON object. Currently safe because only the frame is sent over WS (not logged). However, if anyone adds `console.log(connectFrame)` for debugging, the token leaks to stdout. Consider masking in debug contexts or adding a comment warning.

**Mitigation:** Already acceptable for current code. Add a code comment:

```typescript
// WARNING: connectFrame contains auth token -- never log this object
const connectFrame = buildConnectFrame(config.claw3dToken);
```

### [H2] No event buffering during Claw3D reconnection window

**File:** `src/adapter/claw3d-adapter.ts:85-91`

When `claw3dConnected` is `false` (during reconnection), `forwardEvent` silently drops events. For short reconnection windows this is acceptable, but agent lifecycle events (`session_start`, `session_end`) are semantically important -- dropping them means Claw3D never learns an agent started/stopped.

**Suggestion (defer to Phase 3 if YAGNI):** Buffer last N lifecycle events per agent and replay on reconnect. Current behavior is documented-acceptable for MVP.

### [H3] Missing test coverage for adapter WS logic

**File:** `tests/adapter.test.ts`

All 16 tests cover only the translator (pure functions). The `createClaw3dAdapter` function -- reconnection, connect handshake, event forwarding -- has zero test coverage. The plan explicitly requested "Test auto-reconnect logic" which is not implemented.

**Recommendation:** Add integration test with mock WS servers:

```typescript
// tests/adapter-integration.test.ts
import { WebSocketServer } from 'ws';
import { createClaw3dAdapter } from '../src/adapter/claw3d-adapter.js';

it('forwards events after successful connect handshake', async () => {
  // Start mock hub + mock Claw3D WS servers
  // Create adapter, wait for connect, send event via hub, assert Claw3D receives frame
});

it('reconnects to Claw3D on disconnect', async () => {
  // Close mock Claw3D, assert adapter reconnects after delay
});
```

---

## Medium Priority

### [M1] `deriveRunId` hash collision risk is low but undocumented

**File:** `src/adapter/event-translator.ts:29-34`

12-char hex = 48 bits = ~16.7 million unique IDs before 50% collision probability (birthday paradox). Fine for this use case (tens of agents, not millions), but worth a brief comment noting the design choice.

### [M2] `buildConnectFrame` uses `Date.now()` making it impure

**File:** `src/adapter/event-translator.ts:45`

`id: connect-${Date.now()}` makes the function non-deterministic. This complicates testing (test uses regex match instead of exact value). Consider accepting an optional `id` parameter or extracting ID generation.

```typescript
export function buildConnectFrame(token: string, id?: string): Claw3dReqFrame {
  return {
    type: 'req',
    id: id ?? `connect-${Date.now()}`,
    // ...
  };
}
```

**Impact:** Minor. Current regex test is acceptable.

### [M3] `process.exit(0)` in shutdown prevents graceful cleanup

**File:** `src/adapter/index.ts:19`

`process.exit(0)` is called immediately after `adapter.stop()`. Since `stop()` calls `ws.close()` (which is async internally), the process may exit before close frames are sent. Use a small delay or listen for the `close` event.

```typescript
function shutdown() {
  console.log('\n[adapter] shutting down...');
  adapter.stop();
  setTimeout(() => process.exit(0), 500);
}
```

### [M4] Entry point warns on missing token but proceeds anyway

**File:** `src/adapter/index.ts:7-8`

When `CLAW3D_TOKEN` is empty string, the adapter will connect to Claw3D and send a connect frame with `auth: { token: '' }`. This will get rejected by the gateway. Consider making this a hard error.

```typescript
if (!claw3dToken) {
  console.error('[adapter] FATAL: CLAW3D_TOKEN not set');
  process.exit(1);
}
```

---

## Low Priority

### [L1] `Claw3dEventFrame.event` could be a string union

**File:** `src/adapter/event-translator.ts:17`

```typescript
event: string;  // "agent" | "chat"
```

The comment documents the values but doesn't enforce them. A union type (`'agent' | 'chat'`) would catch typos at compile time.

### [L2] No barrel export from `src/adapter/`

There is no `src/adapter/mod.ts` or re-export from the adapter directory. The entry point `index.ts` imports directly from `claw3d-adapter.ts`. This is fine for the current two-file setup but will need attention if the adapter grows.

---

## Edge Cases Found by Scouting

1. **Hub sends events before adapter connects to Claw3D:** Events silently dropped. Acceptable for MVP, document as known behavior.
2. **Claw3D gateway rejects connect but doesn't close socket:** Adapter stays in `claw3dConnected=false` forever. Fixed by C2 above.
3. **Rapid hub events during Claw3D reconnect window:** All lost. See H2.
4. **Agent/project strings with colons or special chars:** `deriveSessionKey` uses format `agent:{project}-{agent}:main`. If agent="foo:bar", the sessionKey becomes `agent:proj-foo:bar:main` which Claw3D may misparse. Consider sanitizing or documenting allowed characters.
5. **Empty agent or project string:** `isValidEvent` in hub rejects empty strings, so this is protected upstream. Adapter lacks its own guard (see C1).

---

## Positive Observations

- Clean functional architecture: translator is pure, adapter is stateful -- good separation
- All files under 200-line limit (largest: 119 LOC)
- `translateEvent` returns `null` for unknown events instead of throwing -- safe default
- Deterministic `runId` derivation ensures stable agent identity across events
- Dual-connection pattern (hub WS + Claw3D WS) is clean and well-structured
- Test coverage on translator is thorough (12 translation cases + 4 utility tests)
- Protocol compliance matches research report findings exactly (connect frame, event frame shapes)
- KISS principle followed -- no unnecessary abstractions

---

## Metrics

| Metric | Value |
|--------|-------|
| TypeScript Strict | Pass (0 errors) |
| Tests | 16/16 passing |
| Test Coverage | Translator: high, Adapter WS: none |
| Linting Issues | No linter configured (not in scope) |
| File Size | All under 200 LOC |
| YAGNI Compliance | Good -- no over-engineering |

---

## Recommended Actions (Priority Order)

1. **[C1]** Add `isValidEvent` check in adapter hub message handler (5 min)
2. **[C2]** Handle Claw3D connect rejection response (10 min)
3. **[M4]** Make missing `CLAW3D_TOKEN` a fatal error in entry point (2 min)
4. **[M3]** Add small delay before `process.exit` in shutdown (2 min)
5. **[H3]** Add integration tests for adapter WS logic (30 min, can defer)
6. **[H2]** Consider event buffering during reconnection (defer to Phase 3)

---

## Plan TODO Status

| Task | Status |
|------|--------|
| src/adapter/claw3d-adapter.ts | Done |
| src/adapter/event-translator.ts | Done |
| src/adapter/index.ts | Done |
| tests/adapter.test.ts | Done (translator only; WS integration tests missing) |
| Manual test: curl event -> Claw3D | Not verified in review |

---

## Unresolved Questions

1. Should the adapter validate `sessionKey` format against what Claw3D expects, or is the current `agent:{project}-{agent}:main` pattern sufficient? The research report shows `agent:<agentId>:main` -- our format differs slightly by including project.
2. Is there a maximum `message` length Claw3D accepts for chat events? Unbounded strings from hub could cause issues in the 3D renderer.
3. Should the adapter emit a synthetic `session_end` to Claw3D when it disconnects (so agents don't appear stuck "running" in the 3D office)?
