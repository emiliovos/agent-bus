# Phase 1 — Project Setup + Event Hub

**Priority:** P0
**Status:** Complete
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

- [x] `npm run dev` starts hub on :4000
- [x] `curl POST :4000/events` with valid JSON → broadcasts to WS clients
- [x] `data/events.jsonl` grows with each event
- [x] `npm test` passes all tests (31 tests passing)
- [x] `GET :4000/health` returns client count and event count

## Todo

- [x] npm init + deps (ws, typescript, tsx, vitest, @types/*)
- [x] tsconfig.json (strict, ESM, ES2022, NodeNext)
- [x] src/types/agent-event.ts (AgentEvent interface, EventType union, isValidEvent)
- [x] src/hub/event-hub.ts (HTTP+WS server, POST /events, GET /health, JSONL logging, body size limit 1MB, field length limit 1024)
- [x] src/index.ts (entry point with env config, SIGINT/SIGTERM handlers, graceful shutdown 5s timeout)
- [x] tests/hub.test.ts (31 tests, all passing)
- [x] Manual smoke test (tested curl POST, WS broadcast, JSONL logging)

## Additional Completions

- [x] vitest.config.ts (scoped to tests/ only, excludes claw3d/)
- [x] scripts/dev-all.js (parallel launcher for agent-bus + claw3d)
- [x] Claw3D embedded in claw3d/ directory (cloned from GitHub, .git removed)
- [x] package.json scripts: dev, dev:all, dev:claw3d, build, build:claw3d, start, test

## Code Review Score

8.5/10 — Critical issues fixed:
- Body size limit enforcement (1MB)
- WriteStream proper resource management
- Nullish coalescing (??) operator for field defaults
- Close timeout (5s) for graceful shutdown
- Field length validation (1024 chars max)
