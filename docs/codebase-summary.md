# Codebase Summary

**Status:** Phase 5 Complete — Hub, adapter, hooks, CLI, and E2E tests fully functional

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
│   └── adapter/                   ← Claw3D adapter (Phase 2 — IMPLEMENTED)
│       ├── claw3d-adapter.ts      ← Dual WebSocket bridge (120 LOC)
│       ├── event-translator.ts    ← AgentEvent → Claw3D frame mapper (110 LOC)
│       └── index.ts               ← Standalone adapter entry point (24 LOC)
├── tests/
│   ├── hub.test.ts                ← 31 passing tests
│   └── adapter.test.ts            ← 39 passing tests (Phase 2)
├── data/                          ← JSONL event logs (runtime, gitignored)
├── package.json                   ← Dependencies + dev scripts
├── tsconfig.json                  ← TypeScript config
├── vitest.config.ts               ← Test runner config
├── scripts/
│   ├── dev-all.js                 ← Unified dev mode (hub + Claw3D)
│   ├── hook-post-tool-use.sh      ← Claude Code PostToolUse hook (Phase 3)
│   ├── hook-session-event.sh      ← Claude Code session start/end hook (Phase 3)
│   ├── claude-settings-template.json ← Hook config template (Phase 3)
│   └── e2e-smoke-test.sh          ← E2E pipeline validation (Phase 5)
├── cli-anything/
│   └── agent-harness/             ← CLI-Anything harness (Phase 4)
│       ├── setup.py               ← Package setup
│       └── cli_anything/
│           └── agent_bus/
│               ├── __main__.py    ← CLI entry point
│               ├── agent_bus_cli.py ← Command router (publish, subscribe, replay, status)
│               ├── skills/
│               │   └── SKILL.md   ← CLI skill metadata
│               ├── core/          ← Event publisher/subscriber logic
│               ├── utils/         ← Hub backend utilities
│               └── tests/
│                   └── test_core.py ← 16 Python unit tests
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
| `src/adapter/claw3d-adapter.ts` | ✓ Complete | 120 | Dual WebSocket bridge, auto-reconnect on disconnect (3s) |
| `src/adapter/event-translator.ts` | ✓ Complete | 110 | Maps AgentEvent→Claw3dEventFrame, deterministic runId/sessionKey |
| `src/adapter/index.ts` | ✓ Complete | 24 | Standalone adapter bootstrap w/ env config |
| `tests/adapter.test.ts` | ✓ Complete | 200+ | 39 tests: translation logic, connect/auth, reconnect, validation |
| `scripts/hook-post-tool-use.sh` | ✓ Complete (Phase 3) | 23 | Claude Code PostToolUse hook, env-configurable, 1s timeout |
| `scripts/hook-session-event.sh` | ✓ Complete (Phase 3) | — | Claude Code session start/end hook |
| `scripts/claude-settings-template.json` | ✓ Complete (Phase 3) | — | Hook configuration template for .claude/settings.json |
| `cli-anything/agent-harness/` | ✓ Complete (Phase 4) | — | Full CLI-Anything harness (publish, subscribe, replay, status) |
| `cli_anything/agent_bus/skills/SKILL.md` | ✓ Complete (Phase 4) | 49 | CLI skill discovery metadata |
| `cli_anything/agent_bus/tests/test_core.py` | ✓ Complete (Phase 4) | — | 16 Python unit tests |
| `scripts/e2e-smoke-test.sh` | ✓ Complete (Phase 5) | 118 | E2E validation: publish 3 events, check JSONL log, verify health |
| `npm run test:e2e` | ✓ Complete (Phase 5) | — | E2E smoke test runner, all 7 checks pass |

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

## Core Components (Phase 2)

### Claw3D Adapter (`src/adapter/`)
- **event-translator.ts** (110 LOC): Maps AgentEvent types to Claw3D EventFrames
  - Deterministic runId (SHA256 hash, 12-char)
  - sessionKey format: `agent:<project>-<agent>:main`
  - Handles all event types: session_start→lifecycle, tool_use→chat(delta), task_complete→chat(final), session_end→lifecycle, heartbeat→filtered
- **claw3d-adapter.ts** (120 LOC): Dual WebSocket bridge
  - Connects to hub (ws://localhost:4000) and Claw3D (ws://localhost:3000/api/gateway/ws)
  - Sends connect frame with OpenClaw token first
  - Validates connect response (ok=true → authenticated)
  - Auto-reconnect on disconnect (configurable, default 3s)
  - Input validation via isValidEvent type guard
- **index.ts** (24 LOC): Standalone adapter bootstrap
  - Reads env: HUB_URL, CLAW3D_URL, CLAW3D_TOKEN
  - SIGINT/SIGTERM shutdown handlers
  - Fails fast if token missing

## Test Coverage (70 tests)

**Phase 1 Hub (31 tests):**
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

**Phase 2 Adapter (39 tests):**
✓ Derives deterministic runId from agent+project
✓ Formats sessionKey correctly
✓ Builds connect frame with auth token
✓ Translates session_start→agent lifecycle event
✓ Translates tool_use→chat event with tool info
✓ Translates task_complete→chat event (final state)
✓ Translates session_end→agent lifecycle event
✓ Filters heartbeat events (returns null)
✓ Connects to hub and Claw3D simultaneously
✓ Validates hub messages before forwarding
✓ Waits for Claw3D auth response before sending events
✓ Rejects invalid connect response
✓ Auto-reconnects to hub on disconnect
✓ Auto-reconnects to Claw3D on disconnect
✓ Stops all connections on shutdown

## Core Components (Phase 3 — Hook Integration)

### Claude Code Hooks (`scripts/`)
- **hook-post-tool-use.sh** (23 LOC): Fires on every tool use (Edit, Read, Bash, etc.)
  - Reads env: HUB_URL, AGENT_BUS_AGENT, AGENT_BUS_PROJECT
  - Extracts tool name (CLAUDE_TOOL_NAME) and file path (CLAUDE_FILE_PATH)
  - POSTs event to hub with 1s timeout
  - Fails silently — never blocks Claude Code
- **hook-session-event.sh**: Fires on session start/end
- **claude-settings-template.json**: Configuration template for merging into `.claude/settings.json`

### Phase 3 Integration Points
- Hooks send tool events without latency penalties
- Environment-configurable (HUB_URL, agent name, project name)
- Seamless integration with existing Claude Code workflows

## Core Components (Phase 4 — CLI-Anything Harness)

### CLI-Anything Agent Bus (`cli-anything/agent-harness/`)
- **agent_bus_cli.py**: Command router with 4 subcommands
  - `publish`: Emit events to hub (agent, project, event type, optional tool/file)
  - `subscribe`: Real-time WebSocket feed (filter by project, JSON output)
  - `replay`: Play back JSONL log (--last N, --json)
  - `status`: Hub health and connection stats
- **skills/SKILL.md**: CLI discovery metadata for CLI-Anything integration
- **tests/test_core.py**: 16 unit tests covering all commands
- **core/ + utils/**: Event publishing, subscription, JSONL replay logic

### Phase 4 Integration
- Generates discoverable CLI via `/cli-anything:cli-anything ./`
- No deployment friction — zero-token metadata service
- Provides audit trail and replay capabilities

## Core Components (Phase 5 — E2E Smoke Tests)

### E2E Test Suite (`scripts/e2e-smoke-test.sh`)
7 validation checks (all passing):
1. Hub startup on ephemeral port (4444)
2. Publish session_start → verify 200 OK
3. Publish tool_use (Edit auth.ts) → verify 200 OK
4. Publish session_end → verify 200 OK
5. JSONL log contains exactly 3 events
6. Log includes session_start, tool_use, session_end
7. Health endpoint reports 3 events

**Execution:**
```bash
npm run test:e2e
```

All 7 checks pass with clean hub shutdown.
