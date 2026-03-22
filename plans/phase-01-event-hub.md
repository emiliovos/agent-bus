# Phase 1 — Project Setup + Event Hub

**Priority:** P0
**Status:** Not started
**Effort:** ~2h

## Overview

Set up TypeScript project and build the core event hub — a WebSocket + HTTP server that receives, logs, and broadcasts agent events.

## Requirements

- FR-1: WebSocket hub accepts events from producers
- FR-2: POST /events HTTP endpoint
- FR-3: Broadcast events to all connected WebSocket consumers
- FR-4: JSONL file logging

## Implementation Steps

1. **Initialize npm project**
   - `npm init -y`
   - Install deps: `ws`, `typescript`, `tsx`, `vitest`, `@types/ws`, `@types/node`
   - Configure `tsconfig.json` (strict, ESM, ES2022, NodeNext)
   - Add scripts: `dev`, `build`, `start`, `test`

2. **Create event types** (`src/types/agent-event.ts`)
   - `AgentEvent` interface: ts, agent, project, event, tool?, file?, message?
   - `EventType` union: session_start, session_end, tool_use, task_complete, heartbeat
   - Validation function: `isValidEvent()`

3. **Create event hub** (`src/hub/event-hub.ts`)
   - HTTP server on configurable port (default 4000)
   - POST /events — parse JSON body, validate, broadcast, log
   - GET /health — return `{ ok: true, clients: N, events: N }`
   - WebSocket server on same port — consumers connect, receive broadcasts
   - JSONL append to `data/events.jsonl`

4. **Create entry point** (`src/index.ts`)
   - Load config from env (PORT, LOG_DIR)
   - Start event hub
   - SIGINT handler: flush log, close connections
   - Console log: `[agent-bus] listening on ws://0.0.0.0:4000`

5. **Write tests** (`tests/hub.test.ts`)
   - Test POST /events with valid event → 200 + broadcast
   - Test POST /events with invalid JSON → 400
   - Test WebSocket consumer receives broadcast
   - Test JSONL file written
   - Test GET /health returns stats

## Files to Create

- `package.json`
- `tsconfig.json`
- `src/types/agent-event.ts`
- `src/hub/event-hub.ts`
- `src/index.ts`
- `tests/hub.test.ts`

## Success Criteria

- [ ] `npm run dev` starts hub on :4000
- [ ] `curl POST :4000/events` with valid JSON → broadcasts to WS clients
- [ ] `data/events.jsonl` grows with each event
- [ ] `npm test` passes all tests
- [ ] `GET :4000/health` returns client count and event count

## Todo

- [ ] npm init + deps
- [ ] tsconfig.json
- [ ] src/types/agent-event.ts
- [ ] src/hub/event-hub.ts
- [ ] src/index.ts
- [ ] tests/hub.test.ts
- [ ] Manual smoke test
