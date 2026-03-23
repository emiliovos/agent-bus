# Codebase Summary

**Status:** Phase 7 Complete — 100 tests passing (38 hub + 40 adapter + 22 gateway).

**Last Updated:** 2026-03-22 | Key fix: handleEvent() returns frames[] for idle→active Claw3D lifecycle

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
│   ├── index.ts                   ← Hub entry point, graceful shutdown
│   ├── types/
│   │   └── agent-event.ts         ← Event schema + validation (48 LOC)
│   ├── hub/
│   │   ├── event-hub.ts           ← WebSocket + HTTP server (166 LOC)
│   │   └── dashboard.ts           ← Live dashboard UI (138 LOC)
│   ├── adapter/                   ← Claw3D adapter (Phase 2 — IMPLEMENTED)
│   │   ├── claw3d-adapter.ts      ← Dual WebSocket bridge (83 LOC)
│   │   ├── event-translator.ts    ← AgentEvent → Claw3D frame mapper (119 LOC)
│   │   └── index.ts               ← Adapter entry point (24 LOC)
│   └── gateway/                   ← OpenClaw gateway (Phase 7 — NEW)
│       ├── agent-bus-gateway.ts   ← WS server :18789 (169 LOC)
│       ├── protocol-handler.ts    ← 10 OpenClaw RPC methods (162 LOC)
│       ├── agent-registry.ts      ← Agent/session state (132 LOC)
│       └── index.ts               ← Gateway entry point (18 LOC)
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
| `src/hub/dashboard.ts` | ✓ Complete | 138 | Live dashboard UI: agent cards, event feed, stats bar (dark theme, responsive, zero deps) |
| `scripts/hook-post-tool-use.sh` | ✓ Complete (Phase 3) | 23 | Claude Code PostToolUse hook, env-configurable, 1s timeout |
| `scripts/hook-session-event.sh` | ✓ Complete (Phase 3) | — | Claude Code session start/end hook |
| `scripts/claude-settings-template.json` | ✓ Complete (Phase 3) | — | Hook configuration template for .claude/settings.json |
| `cli-anything/agent-harness/` | ✓ Complete (Phase 4) | — | Full CLI-Anything harness (publish, subscribe, replay, status) |
| `cli_anything/agent_bus/skills/SKILL.md` | ✓ Complete (Phase 4) | 49 | CLI skill discovery metadata |
| `cli_anything/agent_bus/tests/test_core.py` | ✓ Complete (Phase 4) | — | 16 Python unit tests |
| `scripts/e2e-smoke-test.sh` | ✓ Complete (Phase 5) | 118 | E2E validation: publish 3 events, check JSONL log, verify health |
| `npm run test:e2e` | ✓ Complete (Phase 5) | — | E2E smoke test runner, all 7 checks pass |
| `scripts/setup-cloudflare-tunnel.sh` | ✓ Complete (Phase 6) | 91 | Interactive CF tunnel setup with LaunchAgent |
| `scripts/hook-post-tool-use.sh` | ✓ Complete (Phase 6) | 30 | Claude Code PostToolUse hook with CF Access auth |
| `scripts/hook-session-event.sh` | ✓ Complete (Phase 6) | 28 | Session lifecycle hook with CF Access auth |
| `scripts/cloudflared-config-template.yml` | ✓ Complete (Phase 6) | — | Cloudflare tunnel config template |
| **Phase 6 Cloudflare Tunnel** | ✓ Complete | — | Remote access via CF tunnel + LaunchAgent auto-start |
| **Phase 7 OpenClaw Gateway** | ✓ Complete | 481 LOC | Adapter replaced by native OpenClaw-compatible gateway |
| `src/gateway/agent-bus-gateway.ts` | ✓ Complete (Phase 7) | 169 | WS server :18789, hub consumer, event forwarding |
| `src/gateway/protocol-handler.ts` | ✓ Complete (Phase 7) | 162 | 10 RPC methods (connect, agents.list, config.get, etc.) |
| `src/gateway/agent-registry.ts` | ✓ Complete (Phase 7) | 132 | In-memory agent/session state, ring buffer messages |
| `tests/gateway.test.ts` | ✓ Complete (Phase 7) | 294 | 22 gateway tests (registry, RPC, integration) |

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

## Test Coverage (100 tests passing)

**Phase 1 Hub (38 tests):**
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

**Phase 7 Gateway (22 tests):**
✓ AgentRegistry: agent registration on session_start
✓ Auto-registration on tool_use without session_start
✓ Idle→active transitions return frames[] array
✓ Chat message ring buffer (max 100 per session)
✓ State version increments on changes
✓ Agent name derivation (kebab→title case)
✓ Emoji assignment (hash-based, deterministic)
✓ Protocol handler: all 10 RPC methods
✓ RPC validation (rejects non-req types)
✓ Config.get returns full config for hydration
✓ Gateway connects to hub
✓ Browser WebSocket connect handshake
✓ Hub event flows to browser client
✓ agents.list reflects hub events
✓ Rejects messages before connect handshake
✓ Error responses for unknown methods

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

## Core Components (Phase 7 — OpenClaw Gateway)

### Gateway Architecture (`src/gateway/`, 481 LOC total)

**agent-bus-gateway.ts (169 LOC):** WebSocket server on :18789 (OpenClaw protocol)
- Consumes hub WS stream at startup
- Dual-connects: hub (:4000) as consumer, clients (:18789) as producers
- Broadcasts translated Claw3D frames to all connected browser clients
- Broadcasts presence events (agent list) to all clients
- Tick keepalive every 30s to maintain connections
- Auto-reconnects to hub on disconnect (configurable 3s delay)

**protocol-handler.ts (162 LOC):** OpenClaw RPC protocol
- `connect`: Initial handshake, returns hello-ok + agent snapshot
- `health`: Simple health check (ok: true)
- `agents.list`: Active agents + identities
- `config.get`: Full config (agents list for Claw3D hydration)
- `sessions.list`: Filter by agentId or search, Claw3D UI pagination
- `sessions.preview`: Batch preview (keys) or single session messages
- `status`: Agent status (active/idle) + lastSeen
- `exec.approvals.get`: Returns empty (no approval queue)
- `chat.send`: Logs but doesn't route (read-only gateway)
- `chat.abort`: Logs but doesn't abort (read-only gateway)

**agent-registry.ts (132 LOC):** In-memory state machine
- Auto-registers agents on `session_start`, `tool_use`, or `task_complete`
- Tracks agent status (active/idle), identity (name, emoji, theme)
- Stores chat messages in ring buffer (max 100 per session)
- Derives deterministic runId and sessionKey from agent+project
- Presence versioning for Claw3D state sync

### Phase 7 Benefits
- **No adapter process needed** — gateway consumes hub directly
- **OpenClaw-compatible protocol** — Claw3D browser clients unchanged
- **Real-time state sync** — presence and chat buffer updates broadcast
- **Working animation latch** — tool_use events trigger 5s animation
- **Backward compatible** — adapter still works for legacy setups

## Core Components (Phase 6 — Cloudflare Tunnel + Remote Access)

### Cloudflare Tunnel Setup (`scripts/setup-cloudflare-tunnel.sh`, 91 LOC)
Interactive setup script that:
- Prompts for Claw3D API token (OpenClaw auth)
- Configures CF tunnel for agent-bus.yourdomain.com → :4000
- Configures CF tunnel for claw3d.yourdomain.com → :3000
- Creates CF Access policy (service token authentication)
- Installs/configures LaunchAgent for auto-start on Mac Mini login
- Updates hook scripts with CF Access headers

**Execution:**
```bash
bash scripts/setup-cloudflare-tunnel.sh
```

### Updated Hooks with CF Access (`scripts/hook-*.sh`)
Phase 6 updates:
- `hook-post-tool-use.sh` (30 LOC): Adds CF Access service token header
- `hook-session-event.sh` (28 LOC): Adds CF Access service token header
- Both hooks work over CF tunnel with `X-Auth-Service-Token` header

**Environment Variables:**
- `CF_ACCESS_SERVICE_TOKEN` — Service token for CF Access policy
- `HUB_URL` — Remote hub URL (e.g., https://agent-bus.yourdomain.com)

### Cloudflare Config Template (`scripts/cloudflared-config-template.yml`)
Template for cloudflared configuration:
```yaml
tunnel: agent-bus-<uuid>
credentials-file: ~/.cloudflare/agent-bus.json
ingress:
  - hostname: agent-bus.yourdomain.com
    service: http://localhost:4000
  - hostname: claw3d.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### LaunchAgent Configuration
Mac Mini:
- Service: `com.cloudflare.cloudflared`
- Location: `~/Library/LaunchAgents/com.cloudflare.cloudflared.plist`
- Auto-starts on login
- Keeps CF tunnel active 24/7

### Deployment Status
- **Hub**: https://agent-bus.yourdomain.com (remote access enabled)
- **Claw3D**: https://claw3d.yourdomain.com (remote access enabled)
- **Authentication**: CF Access service tokens (machine-to-machine)
- **JSONL Logs**: Persisted locally on Mac Mini
- **Token Cost**: $0 (passive OpenClaw mode, CF tunnel only)
