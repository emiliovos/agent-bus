# Phase 4: Integration & Testing

## Context Links
- [Plan overview](plan.md)
- [Phase 1](phase-01-gateway-server-and-registry.md) | [Phase 2](phase-02-protocol-handler-rpc-methods.md) | [Phase 3](phase-03-event-forwarding-and-presence.md)
- [Existing adapter tests (pattern)](../../tests/adapter.test.ts)
- [Existing hub tests (pattern)](../../tests/hub.test.ts)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 0.5h
- **Description:** Create entry point, write tests, add npm scripts, configure Claw3D, verify end-to-end.

## Requirements

### Functional
1. `src/gateway/index.ts` entry point reads env vars, starts gateway
2. `tests/gateway.test.ts` covers protocol, registry, event forwarding
3. `package.json` gets `dev:gateway` script
4. `scripts/dev-all.js` optionally starts gateway
5. End-to-end: hub event -> gateway -> Claw3D browser shows agent

### Non-Functional
- Tests run in < 5s (no real network, mock WS where needed)
- Zero Claw3D modifications required

## Related Code Files

### Create
- `src/gateway/index.ts` (~25 LOC)
- `tests/gateway.test.ts`

### Modify
- `package.json` — add script
- `scripts/dev-all.js` — add gateway process

## Implementation Steps

### Step 1: Create `src/gateway/index.ts`

```typescript
import { createGateway } from './agent-bus-gateway.js';

const port = parseInt(process.env.GATEWAY_PORT || '18789', 10);
const hubUrl = process.env.HUB_URL || 'ws://localhost:4000';

const gateway = createGateway({ port, hubUrl });

gateway.start();
console.log(`[gateway] OpenClaw-compatible gateway on ws://0.0.0.0:${port}`);
console.log(`[gateway] subscribing to hub at ${hubUrl}`);

function shutdown() {
  console.log('\n[gateway] shutting down...');
  gateway.stop().then(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### Step 2: Add npm script to package.json

```json
"dev:gateway": "tsx watch src/gateway/index.ts"
```

### Step 3: Update scripts/dev-all.js

Add gateway to the procs array:
```javascript
{ name: 'gateway', cmd: 'npx', args: ['tsx', 'watch', 'src/gateway/index.ts'], color: '\x1b[33m' },
```

### Step 4: Write tests — `tests/gateway.test.ts`

**Test groups:**

#### AgentRegistry tests
- `creates agent on session_start event`
- `marks agent idle on session_end event`
- `updates lastSeen on heartbeat`
- `stores chat messages in ring buffer`
- `ring buffer caps at 100 messages`
- `returns empty arrays when no agents/sessions`
- `getPresenceSnapshot returns active agents`
- `handles multiple agents from different projects`

#### Protocol Handler tests
- `connect returns hello-ok with correct structure`
- `connect includes presence snapshot`
- `connect includes features.methods list`
- `connect includes features.events list`
- `health returns { ok: true }`
- `agents.list returns registry agents`
- `agents.list returns empty array when no agents`
- `config.get returns agent by id`
- `config.get returns error for unknown agent`
- `sessions.list returns active sessions`
- `sessions.preview returns chat messages for session`
- `sessions.preview returns empty for unknown session`
- `status returns agent status map`
- `exec.approvals.get returns empty approvals`
- `chat.send returns { ok: true, delivered: false }`
- `chat.abort returns { ok: true, aborted: false }`
- `unknown method returns error response`
- `invalid request structure returns error`

#### Event Forwarding tests (integration)
- `session_start produces lifecycle + presence frames`
- `tool_use produces chat frame only`
- `task_complete produces chat final frame only`
- `session_end produces lifecycle + presence frames`
- `heartbeat produces no frames`
- `chat messages accumulate in session ring buffer`

**Testing approach:**
- Test `AgentRegistry` and `handleRpc` as pure functions (no WS needed)
- Mock AgentEvent inputs, verify output frames/responses
- Follow existing test pattern from `tests/adapter.test.ts`

### Step 5: Claw3D Configuration

To point Claw3D at the gateway instead of OpenClaw:

**In Claw3D's `.env` or environment:**
```
GATEWAY_URL=ws://localhost:18789
```

**Or in Claw3D's `server/index.js`** (if GATEWAY_URL is hardcoded):
- Find the WebSocket connection URL
- Change from `:18789` (OpenClaw) to `:18789` (gateway) — same port, different server

No Claw3D code changes needed — just env var config.

### Step 6: Mark adapter as legacy

Add a comment at the top of `src/adapter/claw3d-adapter.ts`:
```typescript
/**
 * LEGACY — Replaced by src/gateway/ in Phase 7.
 * This adapter used HTTP POST to inject events into Claw3D.
 * The gateway speaks native OpenClaw protocol instead.
 * Kept for reference. Remove when gateway is stable.
 */
```

### Step 7: Live E2E verification

1. Start hub: `npm run dev`
2. Start gateway: `npm run dev:gateway`
3. Configure Claw3D: `GATEWAY_URL=ws://localhost:18789`
4. Start Claw3D: `npm run dev:claw3d`
5. Publish test event:
   ```bash
   curl -X POST http://localhost:4000/events \
     -H "Content-Type: application/json" \
     -d '{"agent":"test-dev","project":"demo","event":"session_start"}'
   ```
6. Verify: Claw3D browser shows "Test Dev" agent in 3D office
7. Publish tool_use, verify chat bubble appears
8. Publish session_end, verify agent goes idle

## Todo List

- [ ] Create `src/gateway/index.ts` entry point
- [ ] Add `dev:gateway` script to package.json
- [ ] Add gateway to `scripts/dev-all.js`
- [ ] Write AgentRegistry unit tests (8 tests)
- [ ] Write Protocol Handler unit tests (18 tests)
- [ ] Write Event Forwarding integration tests (6 tests)
- [ ] Run `npm test` — all tests pass
- [ ] Add legacy comment to `src/adapter/claw3d-adapter.ts`
- [ ] Live E2E: hub + gateway + Claw3D with test events
- [ ] Verify agent appears in Claw3D 3D office

## Success Criteria

1. `npm run dev:gateway` starts gateway on `:18789`
2. `npm test` passes all new + existing tests (target: ~30 new gateway tests)
3. `npm run dev:all` starts hub + gateway + Claw3D together
4. Claw3D connects to gateway via `GATEWAY_URL=ws://localhost:18789`
5. Publishing events to hub -> agents appear and act in Claw3D
6. No Claw3D code modifications required
7. Adapter marked as legacy with clear comment

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claw3D rejects gateway handshake | No 3D visualization | Protocol verified from OpenClaw docs; test with real connection |
| Tests take too long | CI slowdown | All tests use in-memory data, no real WS |
| dev-all.js port conflicts | Startup failure | Gateway on :18789, hub on :4000, Claw3D on :3000 — no overlap |

## Next Steps

After Phase 4:
- Update `docs/system-architecture.md` with gateway architecture
- Update `docs/project-roadmap.md` with Phase 7 entry
- Update `docs/codebase-summary.md` with new files
- Consider: remove OpenClaw from Mac Mini LaunchAgent (gateway replaces it)
- Future: implement `chat.send` forwarding to actual agents via hub
