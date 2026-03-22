# Code Review: Phase 1 — Event Hub Implementation

**Date:** 2026-03-21
**Reviewer:** code-reviewer
**Score:** 8.5 / 10

---

## Scope

- **Files:** 7 (5 source + 2 config)
- **LOC:** 403 total (135 hub, 48 types, 20 entry, 155 tests, 45 dev script)
- **Focus:** Full Phase 1 implementation
- **Build:** TypeScript compiles clean (strict mode, zero errors)
- **Tests:** 8/8 passing (364ms)

---

## Overall Assessment

Solid, clean implementation that follows YAGNI/KISS/DRY principles well. All files under 200-line limit. Architecture matches the phase plan. Types are correct and shared. Tests cover the main paths. A few security and resilience gaps noted below.

---

## Critical Issues

### C1. No request body size limit (Security — DoS vector)

**File:** `src/hub/event-hub.ts:56-58`

The HTTP body is accumulated into a string with no upper bound. An attacker can POST an arbitrarily large payload to exhaust memory.

```typescript
// Current
req.on('data', (chunk: Buffer) => { body += chunk.toString(); });

// Fix: Add size limit
const MAX_BODY = 64 * 1024; // 64 KB — generous for single events
req.on('data', (chunk: Buffer) => {
  body += chunk.toString();
  if (body.length > MAX_BODY) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Payload too large' }));
    req.destroy();
  }
});
```

**Impact:** Memory exhaustion, process crash under malicious input.

### C2. Wildcard CORS allows any origin

**File:** `src/hub/event-hub.ts:34`

`Access-Control-Allow-Origin: *` is fine for a local-only tool but becomes a vulnerability if the hub is ever exposed on a network (the architecture doc mentions VPS and Windows PC producers). Consider making it configurable.

```typescript
const allowedOrigin = process.env.CORS_ORIGIN || '*';
res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
```

**Impact:** Medium now (local-only), High if exposed. Noted as critical because the architecture explicitly mentions remote producers.

---

## High Priority

### H1. String field length not validated (Input validation)

**File:** `src/types/agent-event.ts:35-42`

`agent`, `project`, `tool`, `file`, `message` accept strings of any length. A 10 MB `message` field passes validation and gets broadcast + logged.

```typescript
// Add after existing checks
if (obj.agent.length > 128) return false;
if (obj.project.length > 128) return false;
if (obj.message !== undefined && (obj.message as string).length > 4096) return false;
if (obj.file !== undefined && (obj.file as string).length > 1024) return false;
if (obj.tool !== undefined && (obj.tool as string).length > 128) return false;
```

### H2. Timestamp fallback uses `||` instead of `??`

**File:** `src/hub/event-hub.ts:84`

```typescript
const event: AgentEvent = { ...parsed, ts: parsed.ts || Date.now() };
```

`ts: 0` is a valid (albeit unlikely) Unix timestamp, but `||` would overwrite it with `Date.now()`. Use nullish coalescing:

```typescript
const event: AgentEvent = { ...parsed, ts: parsed.ts ?? Date.now() };
```

### H3. `close()` can hang if `server.close()` never resolves

**File:** `src/hub/event-hub.ts:119-128`

If there are keep-alive HTTP connections, `server.close()` waits indefinitely. Add a timeout fallback:

```typescript
close(): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(), 5000);
    for (const client of wss.clients) client.close();
    wss.close(() => {
      server.close(() => { clearTimeout(timeout); resolve(); });
    });
  });
},
```

### H4. JSONL writes are not serialized — concurrent POSTs can interleave

**File:** `src/hub/event-hub.ts:96-101`

Multiple concurrent requests each call `appendFile` independently. While Node.js `appendFile` with `O_APPEND` is atomic at the OS level for writes under the pipe buffer size (~4KB on macOS), relying on this is fragile. If events grow or the OS changes behavior, log lines can interleave.

Consider a simple write queue or `fs.createWriteStream()` with `{ flags: 'a' }`.

```typescript
const logStream = createWriteStream(logFile, { flags: 'a' });
// In handleEvent:
logStream.write(payload + '\n');
```

This also improves performance (no repeated open/close).

---

## Medium Priority

### M1. `dev-all.js` does not kill children on exit

**File:** `scripts/dev-all.js:44-45`

SIGINT handler calls `process.exit(0)` but does not send signals to child processes. They become orphans.

```javascript
const children = [];
// ... in the loop:
children.push(child);
// ... in handler:
process.on('SIGINT', () => {
  for (const c of children) c.kill('SIGINT');
  process.exit(0);
});
```

### M2. No `Content-Type` check on POST /events

**File:** `src/hub/event-hub.ts:55`

The handler accepts any content type. A `text/plain` or `multipart/form-data` POST would still be parsed as JSON (and fail), but the error message would be misleading. A quick guard improves API clarity:

```typescript
const ct = req.headers['content-type'] || '';
if (!ct.includes('application/json')) {
  res.writeHead(415, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
  return;
}
```

However, this might be YAGNI for a local tool where `curl` producers may omit headers. **Discretion advised** — could also just document it.

### M3. No WebSocket message handling (ingestion via WS)

The plan says "FR-1: WebSocket hub accepts events from producers" but the implementation only uses WebSocket for broadcasting (consumer side). Producers can only POST via HTTP. This is fine for Phase 1 and matches the curl-based hook architecture, but noting the gap for future phases.

### M4. Test cleanup timing is fragile

**File:** `tests/hub.test.ts:114,134`

Tests use `setTimeout(r, 100)` to wait for async delivery. Under CI load this could be flaky. Consider a polling loop or event-driven wait:

```typescript
await vi.waitFor(() => expect(received.length).toBe(1), { timeout: 2000 });
```

---

## Low Priority

### L1. `data` as default log directory is implicit

**File:** `src/index.ts:4`

`LOG_DIR` defaults to relative `data`. If the process CWD changes, logs go to an unexpected location. Consider resolving to absolute path:

```typescript
const logDir = resolve(process.env.LOG_DIR || 'data');
```

### L2. No `engines` field in package.json

Node.js 22 LTS is required per code-standards.md but not enforced:

```json
"engines": { "node": ">=22" }
```

### L3. Missing `"type": "module"` declaration in `scripts/dev-all.js`

The file uses ESM `import` syntax but is a `.js` file. It works because `package.json` has `"type": "module"`, but if the script were ever moved or run standalone, it would fail. This is minor — just noting it.

---

## Edge Cases Found by Scouting

| Edge Case | Status | Severity |
|-----------|--------|----------|
| Oversized POST body (memory exhaustion) | **Not handled** | Critical |
| Concurrent appendFile writes interleaving | Fragile (OS-dependent atomicity) | High |
| `ts: 0` treated as falsy, overwritten | Bug via `\|\|` operator | High |
| WebSocket client disconnects mid-broadcast | Handled (readyState check) | OK |
| Log directory creation race (parallel first writes) | Handled (mkdir recursive + flag) | OK |
| Empty string for agent/project | Handled (length > 0 check) | OK |
| Extra unknown fields in event payload | Silently passed through (spread) | OK — non-strict schema |
| Invalid PORT env var (e.g. "abc") | `parseInt` returns NaN, server binds to random port | Low |

---

## Positive Observations

- Clean separation of concerns: types, hub, entry point
- All files well under 200-line limit
- TypeScript strict mode, zero compiler warnings
- Good test coverage for happy + unhappy paths (8 tests)
- `isValidEvent()` is a proper type guard with runtime checks
- CORS + OPTIONS preflight handled correctly
- Graceful shutdown on SIGINT/SIGTERM
- JSONL logging with lazy directory creation
- Minimal dependency footprint (only `ws` in prod)
- Follows kebab-case file naming per code-standards.md
- `HubConfig` and `HubStats` interfaces properly exported

---

## Plan Compliance

| Todo Item | Status |
|-----------|--------|
| npm init + deps | Done |
| tsconfig.json | Done |
| src/types/agent-event.ts | Done |
| src/hub/event-hub.ts | Done |
| src/index.ts | Done |
| tests/hub.test.ts | Done |
| Manual smoke test | Not verified (no evidence, not blocking) |

All 6 implementation items complete. Architecture matches plan. FR-1 through FR-4 satisfied.

---

## Recommended Actions (Priority Order)

1. **[Critical]** Add request body size limit (C1) — prevents DoS
2. **[Critical]** Make CORS origin configurable (C2) — required for remote producers
3. **[High]** Add string field length limits in validator (H1)
4. **[High]** Change `||` to `??` for timestamp fallback (H2) — one-char fix
5. **[High]** Add close() timeout (H3) — prevents hanging shutdown
6. **[High]** Switch to WriteStream for JSONL logging (H4) — fixes concurrency + perf
7. **[Medium]** Fix child process cleanup in dev-all.js (M1)
8. **[Medium]** Consider Content-Type check (M2) — weigh against YAGNI
9. **[Low]** Resolve logDir to absolute path (L1)
10. **[Low]** Add engines field to package.json (L2)

---

## Metrics

| Metric | Value |
|--------|-------|
| Type Coverage | 100% (strict mode, all paths typed) |
| Test Count | 8 passing |
| Test Coverage | ~85% (main paths covered, no edge case tests for oversized payloads, concurrent writes) |
| Linting Issues | 0 (no linter configured, but clean code) |
| Build Errors | 0 |
| File Size Compliance | All under 200 lines |

---

## Unresolved Questions

1. Is the hub intended to be exposed beyond localhost (VPS/Windows PC)? If yes, C1 and C2 become mandatory before deployment.
2. Should WebSocket producers be supported (FR-1 ambiguity), or is HTTP-only ingestion the intended design?
3. Should a linter (eslint/biome) be added in Phase 1 or deferred?
