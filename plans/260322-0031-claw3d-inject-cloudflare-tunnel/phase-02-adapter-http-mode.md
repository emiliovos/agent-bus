# Phase 2: Adapter HTTP Mode

## Context Links

- [Phase 1: Claw3D Inject Endpoint](phase-01-claw3d-inject-endpoint.md) — depends on this
- `src/adapter/claw3d-adapter.ts` — current dual WS bridge (120 LOC), to be rewritten
- `src/adapter/event-translator.ts` — unchanged, still translates AgentEvent to Claw3D frames
- `src/adapter/index.ts` — entry point, needs env var changes
- `tests/adapter.test.ts` — event-translator tests (unchanged), need new HTTP adapter tests

## Overview

- **Priority:** P1
- **Status:** Pending (blocked by Phase 1)
- **Effort:** 1.5h

Replace the adapter's dual WebSocket bridge with HTTP POST to Claw3D's `/api/inject-event`. Removes all Claw3D WS connection logic, auth handshake, reconnect logic. Much simpler: listen on hub WS, translate event, POST to inject endpoint.

## Key Insights

- Current adapter is 120 LOC managing two WS connections + auth handshake + reconnect
- New adapter: hub WS consumer + `fetch()` POST — roughly 60-70 LOC
- `event-translator.ts` stays identical — still converts AgentEvent to Claw3dEventFrame
- `buildConnectFrame()` no longer needed by adapter (keep exported for backward compat)
- `CLAW3D_TOKEN` env var removed; replaced by `INJECT_SECRET` and `CLAW3D_INJECT_URL`

## Requirements

### Functional
- Adapter connects to hub WS, receives events, translates, POSTs to inject endpoint
- Uses `CLAW3D_INJECT_URL` (default `http://localhost:3000/api/inject-event`)
- Sends `X-Inject-Secret` header with value from `INJECT_SECRET` env var
- Logs POST failures but keeps running (fire-and-forget, non-blocking)
- Reconnects to hub on disconnect (same 3s delay)

### Non-Functional
- No new npm dependencies (Node 18+ native `fetch`)
- Adapter module remains testable in isolation
- Keep `AdapterConfig` interface backward-compatible where possible

## Architecture

```
Hub WS (ws://localhost:4000)
  │ event: AgentEvent JSON
  ▼
claw3d-adapter.ts
  │ isValidEvent() → translateEvent()
  │ Claw3dEventFrame
  ▼
fetch POST http://localhost:3000/api/inject-event
  │ X-Inject-Secret: <secret>
  │ Body: Claw3dEventFrame JSON
  ▼
Claw3D broadcasts to browsers
```

## Related Code Files

### Modify
- `src/adapter/claw3d-adapter.ts` — rewrite: remove WS-to-Claw3D, add HTTP POST
- `src/adapter/index.ts` — update env vars: remove `CLAW3D_TOKEN`, add `INJECT_SECRET` + `CLAW3D_INJECT_URL`

### Add
- `tests/adapter-http.test.ts` — test new HTTP POST adapter

### No Changes
- `src/adapter/event-translator.ts` — unchanged
- `tests/adapter.test.ts` — existing translator tests, still valid

## Implementation Steps

### Step 1: Update AdapterConfig interface

In `claw3d-adapter.ts`, replace config:

```typescript
export interface AdapterConfig {
  hubUrl: string;           // ws://localhost:4000
  injectUrl: string;        // http://localhost:3000/api/inject-event
  injectSecret: string;     // shared secret for X-Inject-Secret header
  reconnectMs?: number;     // hub reconnect delay (default 3000)
}
```

Remove: `claw3dUrl`, `claw3dToken`

### Step 2: Rewrite createClaw3dAdapter

Remove all Claw3D WS logic (`connectToClaw3d`, `claw3dConnected`, `claw3dWs`, `buildConnectFrame` usage). Replace `forwardEvent` with HTTP POST:

```typescript
async function forwardEvent(event: AgentEvent) {
  const frame = translateEvent(event);
  if (!frame) return;

  try {
    const res = await fetch(config.injectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inject-Secret': config.injectSecret,
      },
      body: JSON.stringify(frame),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[adapter] inject failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('[adapter] inject error:', (err as Error).message);
  }
}
```

Keep: `connectToHub()` (WS consumer from hub), `start()`, `stop()`.

Remove: `connectToClaw3d()`, `claw3dWs`, `claw3dConnected`.

The `connected` getter should now reflect hub connection status only (or be removed — it was checking `claw3dConnected`).

### Step 3: Full rewritten module

```typescript
import WebSocket from 'ws';
import { isValidEvent, type AgentEvent } from '../types/agent-event.js';
import { translateEvent } from './event-translator.js';

export interface AdapterConfig {
  hubUrl: string;
  injectUrl: string;
  injectSecret: string;
  reconnectMs?: number;
}

export function createClaw3dAdapter(config: AdapterConfig) {
  const reconnectMs = config.reconnectMs ?? 3000;
  let hubWs: WebSocket | null = null;
  let stopping = false;

  async function forwardEvent(event: AgentEvent) {
    const frame = translateEvent(event);
    if (!frame) return;

    try {
      const res = await fetch(config.injectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inject-Secret': config.injectSecret,
        },
        body: JSON.stringify(frame),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.error(`[adapter] inject failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error('[adapter] inject error:', (err as Error).message);
    }
  }

  function connectToHub() {
    if (stopping) return;
    hubWs = new WebSocket(config.hubUrl);

    hubWs.on('open', () => {
      console.log('[adapter] connected to hub:', config.hubUrl);
    });

    hubWs.on('message', (data: Buffer) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());
        if (!isValidEvent(parsed)) return;
        forwardEvent(parsed);
      } catch (err) {
        console.error('[adapter] invalid hub message:', err);
      }
    });

    hubWs.on('close', () => {
      console.log('[adapter] hub disconnected, reconnecting...');
      hubWs = null;
      if (!stopping) setTimeout(connectToHub, reconnectMs);
    });

    hubWs.on('error', (err) => {
      console.error('[adapter] hub error:', err.message);
    });
  }

  return {
    start() {
      stopping = false;
      connectToHub();
    },
    stop() {
      stopping = true;
      if (hubWs) { hubWs.close(); hubWs = null; }
    },
    get connected(): boolean {
      return hubWs?.readyState === WebSocket.OPEN;
    },
  };
}
```

### Step 4: Update index.ts entry point

```typescript
import { createClaw3dAdapter } from './claw3d-adapter.js';

const hubUrl = process.env.HUB_URL || 'ws://localhost:4000';
const injectUrl = process.env.CLAW3D_INJECT_URL || 'http://localhost:3000/api/inject-event';
const injectSecret = process.env.INJECT_SECRET || '';

if (!injectSecret) {
  console.error('[adapter] INJECT_SECRET is required. Set it via environment variable.');
  process.exit(1);
}

const adapter = createClaw3dAdapter({ hubUrl, injectUrl, injectSecret });
adapter.start();

console.log(`[adapter] bridging ${hubUrl} -> POST ${injectUrl}`);

function shutdown() {
  console.log('\n[adapter] shutting down...');
  adapter.stop();
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### Step 5: Write adapter HTTP tests

Create `tests/adapter-http.test.ts`:

Test cases:
1. `forwardEvent` calls fetch with correct URL, headers, body
2. Non-OK response logged but no throw
3. Network error logged but no throw
4. Heartbeat events not forwarded (translateEvent returns null)
5. Invalid events (isValidEvent false) not forwarded

Use vitest `vi.fn()` to mock global `fetch`. No new dependencies needed.

### Step 6: Update E2E smoke test

Add to `scripts/e2e-smoke-test.sh`:

```bash
# 7. Test adapter HTTP mode (if Claw3D running)
# Optional — only runs if CLAW3D_INJECT_URL is reachable
```

This is optional in E2E since Claw3D may not be running in CI. The unit tests cover the adapter logic.

## Todo List

- [ ] Update `AdapterConfig` interface (remove claw3dUrl/claw3dToken, add injectUrl/injectSecret)
- [ ] Rewrite `createClaw3dAdapter` — remove WS-to-Claw3D, add HTTP POST
- [ ] Update `index.ts` — new env vars (`CLAW3D_INJECT_URL`, `INJECT_SECRET`)
- [ ] Remove `CLAW3D_TOKEN` requirement from `index.ts`
- [ ] Write `tests/adapter-http.test.ts` with fetch mock
- [ ] Verify existing translator tests still pass (`npm test`)
- [ ] Update `scripts/dev-all.js` if it references CLAW3D_TOKEN
- [ ] Manual integration test: hub + adapter + Claw3D with inject endpoint

## Success Criteria

1. `INJECT_SECRET=test npm run dev:adapter` starts, connects to hub, POSTs events to Claw3D
2. Events appear in Claw3D browser (agents visible in 3D office)
3. `npm test` passes — all translator tests + new HTTP adapter tests
4. No `ws` connection to Claw3D WS gateway (verify with `lsof -i :3000`)
5. Adapter recovers from hub disconnect (3s reconnect)
6. Adapter logs but survives Claw3D inject endpoint being down

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| fetch not available in Node <18 | Low | High | package.json already requires node>=18 |
| High event rate overwhelms inject endpoint | Low | Med | Events are human-speed (tool_use, session lifecycle) |
| Breaking existing tests | Low | Low | translator tests untouched, new test file for HTTP adapter |

## Security Considerations

- `INJECT_SECRET` stored in env var, never committed
- HTTP POST over localhost is safe; over CF tunnel it's HTTPS
- 5s timeout on fetch prevents hanging on unresponsive Claw3D
