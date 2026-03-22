# Phase 2 — Claw3D Adapter

**Priority:** P0
**Status:** Complete
**Effort:** ~2h
**Depends on:** Phase 1

## Overview

Build an adapter that subscribes to the event hub and translates agent-bus events into Claw3D's WebSocket protocol frames, making agents appear in the 3D office.

## Requirements

- FR-5: Translate events to Claw3D WebSocket protocol
- FR-6: Multi-project isolation via project field

## Key Protocol Reference

See `docs/system-architecture.md` → Claw3D Protocol Reference

## Implementation Steps

1. **Create adapter** (`src/adapter/claw3d-adapter.ts`)
   - Connect to event hub WS at `ws://localhost:4000`
   - Connect to Claw3D WS at `ws://localhost:3000/api/gateway/ws`
   - Send connect frame with auth token + minProtocol/maxProtocol/client
   - Wait for connect response before forwarding events
   - Auto-reconnect on disconnect (3s delay)

2. **Create event translator** (`src/adapter/event-translator.ts`)
   - Map `session_start` → agent lifecycle `phase: "start"` frame
   - Map `tool_use` → chat delta frame with tool description
   - Map `task_complete` → chat final frame
   - Map `session_end` → agent lifecycle `phase: "end"` frame
   - Generate deterministic runId + sessionKey per agent/project

3. **Create adapter entry point** (`src/adapter/index.ts`)
   - Load config from env (HUB_URL, CLAW3D_URL, CLAW3D_TOKEN)
   - Start adapter
   - SIGINT handler

4. **Write tests** (`tests/adapter.test.ts`)
   - Test event translation (each event type → correct frame)
   - Test connect frame structure
   - Test auto-reconnect logic
   - Test sessionKey generation

## Files to Create

- `src/adapter/claw3d-adapter.ts`
- `src/adapter/event-translator.ts`
- `src/adapter/index.ts`
- `tests/adapter.test.ts`

## Success Criteria

- [x] Adapter connects to hub + Claw3D
- [x] POST event to hub → agent appears in Claw3D 3D office
- [x] Agent shows "working" state on tool_use events
- [x] Agent shows "idle" after session_end
- [x] Auto-reconnects on Claw3D restart

## Todo

- [x] src/adapter/claw3d-adapter.ts
- [x] src/adapter/event-translator.ts
- [x] src/adapter/index.ts
- [x] tests/adapter.test.ts
- [x] Manual test: curl event → see agent in Claw3D

## Completion Notes

**Code Review:** Score 8/10. Critical fixes applied:
- isValidEvent guard on all hub messages
- Connect rejection handling + fatal error on missing token
- Graceful shutdown with 500ms delay
- Proper error logging for failed Claw3D connections

**Test Results:** 39 adapter tests all passing (39/39). Total project tests: 70/70 (31 hub + 39 adapter).

**Artifacts Completed:**
- src/adapter/event-translator.ts — Event translation (session_start, tool_use, task_complete, session_end, heartbeat)
- src/adapter/claw3d-adapter.ts — Dual WS client with auto-reconnect + auth
- src/adapter/index.ts — Entry point with env config (HUB_URL, CLAW3D_URL, CLAW3D_TOKEN)
- tests/adapter.test.ts — 39 comprehensive tests
- package.json updated with dev:adapter script
