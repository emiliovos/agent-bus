# Code Review: Phase 7 — Agent-Bus Gateway (OpenClaw-compatible)

**Date:** 2026-03-22
**Reviewer:** code-reviewer
**Score: 8.5 / 10**

## Scope

- **Files:** 4 source + 1 test file (736 LOC total)
  - `src/gateway/agent-registry.ts` (129 LOC)
  - `src/gateway/protocol-handler.ts` (127 LOC)
  - `src/gateway/agent-bus-gateway.ts` (169 LOC)
  - `src/gateway/index.ts` (18 LOC)
  - `tests/gateway.test.ts` (293 LOC)
- **Build:** TypeScript strict — passes with zero errors
- **Tests:** 28/28 passing (unit + integration)

## Overall Assessment

Well-structured gateway implementation. Clean separation: registry (state), protocol-handler (RPC routing), gateway (WS server + glue). All files under 200-line limit. Good YAGNI discipline — stubs for `chat.send`/`chat.abort` return honest `delivered: false` / `aborted: false`. Integration tests cover the full hub-to-browser flow.

---

## Critical Issues

None.

---

## High Priority

### H1. `agentChanged` always false on tool_use/task_complete for known agents (logic bug)

**File:** `src/gateway/agent-registry.ts:107`

```ts
return { agentChanged: !this.agents.has(key), frame: translateEvent(event) };
```

At line 82-92, if the agent does NOT exist, it gets auto-registered and `_presenceVersion++` is incremented. But by line 107, `this.agents.has(key)` is now **always true** (just inserted at line 83). So `agentChanged` is always `false` here, even for auto-registered agents.

This means auto-registered agents (tool_use without prior session_start) never trigger a `broadcastPresence()` call from `agent-bus-gateway.ts:72`. The presence version was incremented, but no broadcast is sent to clients.

**Fix:** Track whether the agent was newly created:
```ts
// In the tool_use/task_complete block:
const isNew = !this.agents.has(key);
if (isNew) {
  this.agents.set(key, { ... });
  if (!this.sessions.has(sessionKey)) { ... }
  this._presenceVersion++;
}
// ...
return { agentChanged: isNew, frame: translateEvent(event) };
```

### H2. No max payload / message size on client WebSocket

**File:** `src/gateway/agent-bus-gateway.ts:90`

The hub has `MAX_BODY_BYTES` (1MB) on HTTP POST, but the gateway's WebSocket server has no `maxPayload` configured. A malicious client could send arbitrarily large frames.

**Fix:**
```ts
const wss = new WebSocketServer({ port: config.port, maxPayload: 1048576 });
```
This aligns with the `policy.maxPayload: 1048576` advertised in hello-ok.

### H3. `getAgentConfig` is O(n) linear scan

**File:** `src/gateway/agent-registry.ts:123-125`

```ts
getAgentConfig(agentId: string): AgentInfo | undefined {
  for (const a of this.agents.values()) { if (a.id === agentId) return a; }
  return undefined;
}
```

The agents Map is keyed by `${agent}:${project}`, but `config.get` looks up by `agentId` alone — so it does a linear scan. For small agent counts this is fine, but it also returns **the first match**, silently ignoring that one agent can appear in multiple projects.

**Suggestion:** Either:
- Document this returns the first matching agent (acceptable for v1)
- Or change `config.get` to accept `{ agentId, project }` for precise lookup

Not blocking for v1, but worth a comment.

---

## Medium Priority

### M1. `SUPPORTED_METHODS` array is out of sync with `switch` cases

**File:** `src/gateway/protocol-handler.ts:23-26`

The `SUPPORTED_METHODS` array advertised in features does NOT include `'connect'` or `'status'`, yet both are handled by the switch. Conversely, `'health'` appears in both `SUPPORTED_METHODS` and the spread in `buildHelloOk` line 37, yielding a duplicate `'health'` in the features list:

```ts
features: {
  methods: ['health', ...SUPPORTED_METHODS],  // 'health' appears twice
```

**Fix:** Either remove `'health'` from the spread prefix or from `SUPPORTED_METHODS`. Add `'connect'` and `'status'` to `SUPPORTED_METHODS` for completeness:
```ts
const SUPPORTED_METHODS = [
  'connect', 'health', 'agents.list', 'config.get', 'sessions.list',
  'sessions.preview', 'status', 'exec.approvals.get', 'chat.send', 'chat.abort',
];
// ...
features: { methods: SUPPORTED_METHODS, ... }
```

### M2. Hub reconnect has no backoff / max attempts

**File:** `src/gateway/agent-bus-gateway.ts:81`

On hub disconnect, reconnects every `reconnectMs` (3s default) indefinitely. Under sustained hub outage, this generates a reconnect attempt + error log entry every 3 seconds forever.

**Suggestion:** Add exponential backoff with a cap (e.g., max 30s). Low priority since hub is local, but good hygiene.

### M3. `nextConnId` counter could overflow

**File:** `src/gateway/agent-bus-gateway.ts:26,93`

`nextConnId` is a plain number. After ~9 quadrillion connections (Number.MAX_SAFE_INTEGER) it loses precision. Practically irrelevant, but a comment or modular wrap would be defensive:
```ts
const connId = `ws-${nextConnId++ % 1_000_000}`;
```

### M4. Stale agents never pruned from registry

**File:** `src/gateway/agent-registry.ts`

The registry grows monotonically. If an agent sends `session_start` but never `session_end` (crash, hook failure), the agent stays `active` forever. The `lastSeen` field exists but nothing checks it.

**Suggestion:** Add a `pruneStale(maxAgeMs: number)` method called from the tick timer. Remove agents whose `lastSeen + maxAgeMs < Date.now()`.

### M5. `chat.send` and `chat.abort` log user-controlled input

**File:** `src/gateway/protocol-handler.ts:116,121`

```ts
console.log(`[gateway] chat.send to ${params.sessionKey}: ${msg}`);
console.log(`[gateway] chat.abort for ${params.sessionKey}`);
```

These log unsanitized user input. If logs are ingested by a log viewer that renders HTML/ANSI, this is a minor injection vector (log injection). Low risk in a local tool, but worth noting.

---

## Low Priority

### L1. No test for concurrent client broadcast

Tests cover single-client flow. No test verifies that two connected clients both receive the same broadcast frame. The `broadcast()` function logic is straightforward, but a test would add confidence.

### L2. Integration test timing fragility

**File:** `tests/gateway.test.ts:208,256`

Tests use `setTimeout(r, 500)` and `setTimeout(r, 300)` for synchronization. Under CI load, these could flake. Consider polling with a short interval + timeout instead.

### L3. `tick` event missing `stateVersion`

**File:** `src/gateway/agent-bus-gateway.ts:141`

The presence broadcast includes `stateVersion`, but the tick event does not. Claw3D may expect consistency. Minor — depends on Claw3D's tick handling.

---

## Edge Cases Found by Scout

1. **Hub message not valid JSON** — Handled: try/catch at gateway line 62-75
2. **Client sends non-JSON** — Handled: try/catch at gateway line 98-121
3. **Client sends valid RPC but unknown method** — Handled: default case returns error
4. **Client disconnects mid-message** — Handled: ws `close` event cleans up Map
5. **Hub disconnects** — Handled: auto-reconnect with configurable delay
6. **Multiple agents same ID different projects** — Handled: Map key is `${agent}:${project}`
7. **agent_event without session_start** — Handled: auto-register at registry line 82
8. **Empty agent or project string** — Blocked by `isValidEvent` validation at hub level

---

## Positive Observations

- **Clean architecture:** Three files with single responsibilities, all under 200 LOC
- **Honest stubs:** `chat.send` returns `delivered: false` instead of pretending
- **Ring buffer:** MAX_MESSAGES=100 prevents unbounded memory growth
- **Type safety:** `isValidRpc` guard + strict TS config
- **Connect-first protocol:** Rejects RPCs before handshake (line 106-109)
- **Graceful shutdown:** Properly closes hub WS, client WS, and WSS
- **Good test coverage:** 28 tests across unit + integration, all passing
- **YAGNI discipline:** No over-engineering; exec.approvals returns empty array

---

## Recommended Actions

1. **[H1] Fix `agentChanged` logic bug** — auto-registered agents dont trigger presence broadcast
2. **[H2] Set `maxPayload` on WSS** — aligns with advertised policy, prevents abuse
3. **[M1] Fix SUPPORTED_METHODS** — remove duplicate `health`, add missing `connect`/`status`
4. **[M4] Add stale agent pruning** — hook into existing tick timer
5. **[M2] Add reconnect backoff** — cap at 30s to reduce log noise

Items 1-2 are recommended before Claw3D integration testing. Items 3-5 can be deferred.

---

## Metrics

| Metric | Value |
|--------|-------|
| Type Coverage | 100% (strict mode, zero errors) |
| Test Coverage | 28 tests, all passing |
| Linting Issues | 0 |
| LOC (source) | 443 |
| LOC (tests) | 293 |
| Files under 200L | 4/4 |

---

## Unresolved Questions

1. Does Claw3D expect `stateVersion` on tick events? Need to verify against Claw3D source.
2. Should `config.get` support project scoping, or is agent-ID-only sufficient for Claw3D?
3. What is Claw3D's behavior when receiving duplicate `health` in the methods array? Likely benign but untested.
