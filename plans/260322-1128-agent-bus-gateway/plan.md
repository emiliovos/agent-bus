---
title: "Phase 7: Agent-Bus Gateway (OpenClaw Protocol)"
description: "Replace adapter with native OpenClaw gateway at :18789 — Claw3D connects directly, zero Claw3D modifications"
status: pending
priority: P1
effort: 4h
branch: main
tags: [gateway, openclaw, websocket, claw3d]
created: 2026-03-22
---

# Phase 7: Agent-Bus Gateway

## Goal

Replace the HTTP-inject adapter (`src/adapter/`) with a native OpenClaw-compatible WebSocket gateway at `:18789`. Claw3D connects to it via `GATEWAY_URL` config — zero Claw3D modifications. The gateway speaks the OpenClaw protocol (v2), handles RPC methods, maintains an in-memory agent registry, and forwards hub events as Claw3D-compatible frames.

## Architecture

```
hub :4000 ──WS──> gateway :18789 ──WS──> Claw3D proxy :3000 ──WS──> browser
                       |
                  agent registry (in-memory)
                  session registry
                  chat history (ring buffer, 100/session)
```

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Gateway Server & Registry | pending | 1.5h | [phase-01](phase-01-gateway-server-and-registry.md) |
| 2 | Protocol Handler & RPC Methods | pending | 1h | [phase-02](phase-02-protocol-handler-rpc-methods.md) |
| 3 | Event Forwarding & Presence | pending | 1h | [phase-03](phase-03-event-forwarding-and-presence.md) |
| 4 | Integration & Testing | pending | 0.5h | [phase-04](phase-04-integration-and-testing.md) |

## Key Decisions

1. **Reuse `event-translator.ts`** — translateEvent(), deriveRunId(), deriveSessionKey() imported as-is
2. **Reuse `agent-event.ts`** — AgentEvent, isValidEvent() unchanged
3. **Ring buffer** for chat history — 100 msgs/session, no disk persistence
4. **Protocol v2** — matches OpenClaw's current protocol version
5. **Adapter becomes obsolete** — `src/adapter/claw3d-adapter.ts` kept but documented as legacy

## Files

### Create
- `src/gateway/agent-bus-gateway.ts` (~200 LOC) — WS server, hub consumer, client manager
- `src/gateway/agent-registry.ts` (~80 LOC) — agent + session + chat history state
- `src/gateway/protocol-handler.ts` (~100 LOC) — RPC router + response builders
- `src/gateway/index.ts` (~25 LOC) — entry point
- `tests/gateway.test.ts` — protocol, registry, event forwarding tests

### Modify
- `package.json` — add `dev:gateway` script
- `scripts/dev-all.js` — optionally start gateway

### Obsolete (keep, mark legacy)
- `src/adapter/claw3d-adapter.ts`
- `src/adapter/index.ts`

## Dependencies

- Hub must be running at `:4000` (gateway subscribes as WS consumer)
- Claw3D at `:3000` configured with `GATEWAY_URL=ws://localhost:18789`
- No new npm dependencies (uses existing `ws` package)
