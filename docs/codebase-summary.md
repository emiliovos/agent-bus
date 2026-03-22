# Codebase Summary

**Status:** Phase 1 Complete — Event hub fully functional

**Last Updated:** 2026-03-21

## File Tree

```
agent-bus/
├── CLAUDE.md                      ← Project instructions for Claude Code
├── README.md                      ← Quick start and usage
├── docs/
│   ├── project-overview-pdr.md    ← Requirements and scope
│   ├── system-architecture.md     ← Architecture, event flow, protocols
│   ├── code-standards.md          ← TypeScript conventions, naming
│   └── codebase-summary.md        ← This file
├── plans/
│   └── reports/                   ← Research and review reports
├── claw3d/                        ← Claw3D embedded (git subdir or copy)
│   ├── package.json               ← Next.js app
│   ├── src/                       ← React components, API routes
│   └── server/                    ← Node.js WebSocket gateway
├── src/
│   ├── index.ts                   ← Entry point, graceful shutdown
│   ├── types/
│   │   └── agent-event.ts         ← Event schema + validation
│   ├── hub/
│   │   └── event-hub.ts           ← WebSocket + HTTP server (163 LOC)
│   └── adapter/                   ← Claw3D adapter (Phase 2)
├── tests/
│   └── hub.test.ts                ← 31 passing tests
├── data/                          ← JSONL event logs (runtime, gitignored)
├── package.json                   ← Dependencies + dev scripts
├── tsconfig.json                  ← TypeScript config
├── vitest.config.ts               ← Test runner config
└── scripts/
    └── dev-all.js                 ← Unified dev mode (hub + Claw3D)
```

## Implementation Status

| Component | Status | LOC | Details |
|-----------|--------|-----|---------|
| `src/types/agent-event.ts` | ✓ Complete | 49 | EventType, AgentEvent interface, schema validation |
| `src/hub/event-hub.ts` | ✓ Complete | 163 | HTTP POST /events, WebSocket broadcast, JSONL logging, graceful shutdown |
| `src/index.ts` | ✓ Complete | 21 | Server startup, SIGINT/SIGTERM handling |
| `tests/hub.test.ts` | ✓ Complete | 200+ | 31 tests: validation, broadcast, health, payload limits, field length checks |
| `package.json` | ✓ Complete | — | ws, typescript, tsx, vitest, @types/* |
| `tsconfig.json` | ✓ Complete | — | ES2022, strict mode, ESM |
| `vitest.config.ts` | ✓ Complete | — | Test environment config |
| `claw3d/` | ✓ Embedded | — | Next.js app ready for adapter integration |
| `src/adapter/` | Pending (Phase 2) | ~100 | Claw3D protocol translator |
| CLI-Anything generation | Pending (Phase 2) | Auto | Generated after full integration |

## Core Components (Phase 1)

### Event Hub (`src/hub/event-hub.ts`)
- **HTTP Server**: Accepts POST /events from remote producers
- **WebSocket Server**: Broadcasts events to all connected clients in real-time
- **JSONL Logger**: Persists all events to `data/events.jsonl` (append-only)
- **Input Validation**: Schema validation, max body size (1 MB), field length (1024 chars)
- **Graceful Shutdown**: 5-second timeout to close all connections cleanly

**Endpoints:**
- `POST /events` — Accept validated event, timestamp, broadcast, log
- `GET /health` — Return hub statistics (clients, event count)
- `WebSocket /` — Real-time event stream

### Event Types (`src/types/agent-event.ts`)
- `session_start`, `session_end`, `tool_use`, `task_complete`, `heartbeat`
- Schema: `{ ts, agent, project, event, tool?, file?, message? }`
- Validation function `isValidEvent()` with type guard

### Entry Point (`src/index.ts`)
- Starts hub on PORT (default 4000)
- Logs directory (default `data/`)
- SIGINT/SIGTERM handlers for graceful shutdown

## Dependencies

### Production
- `ws` ^8.x — WebSocket server

### Development
- `typescript` ^5.9
- `tsx` — Direct TypeScript execution
- `vitest` — Test runner
- `@types/ws`, `@types/node`

## Test Coverage (31 tests)

✓ POST /events accepts valid events (200 OK)
✓ Rejects invalid JSON (400)
✓ Rejects invalid schema (400)
✓ Rejects unknown event types (400)
✓ Rejects oversized payloads (413)
✓ Rejects field values exceeding 1024 chars (400)
✓ GET /health returns hub stats
✓ WebSocket broadcasts events to all consumers
✓ JSONL log contains events in correct format
✓ Graceful shutdown closes all connections
