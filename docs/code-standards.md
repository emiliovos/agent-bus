# Code Standards

## Language & Environment

- **Language**: TypeScript 5.9+ (strict mode)
- **Runtime**: Node.js 22 LTS
- **Module System**: ESM
- **Target**: ES2022
- **Package Manager**: npm

## Naming

| Category | Convention | Example |
|----------|-----------|---------|
| Files | kebab-case.ts | `event-hub.ts`, `claw3d-adapter.ts` |
| Variables | camelCase | `eventLog`, `wsClients` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_PORT`, `MAX_REPLAY` |
| Functions | camelCase, verb-first | `broadcastEvent()`, `parseFrame()` |
| Classes | PascalCase | `EventHub`, `Claw3dAdapter` |
| Interfaces | PascalCase, no I prefix | `AgentEvent`, `HubConfig` |
| Types | PascalCase | `EventType`, `Claw3dFrame` |

## Project Structure

```
src/
├── index.ts           ← Hub entry point (server startup + shutdown)
├── hub/
│   └── event-hub.ts   ← WebSocket + HTTP event hub (166 LOC)
├── adapter/           ← Legacy adapter (Phase 2, replaced by gateway)
│   ├── claw3d-adapter.ts    ← Dual WS bridge (83 LOC)
│   ├── event-translator.ts  ← Event mapper (119 LOC)
│   └── index.ts             ← Adapter bootstrap (24 LOC)
├── gateway/           ← OpenClaw gateway (Phase 7 — NEW)
│   ├── agent-bus-gateway.ts ← WS server :18789 (169 LOC)
│   ├── protocol-handler.ts  ← 10 RPC methods (162 LOC)
│   ├── agent-registry.ts    ← Agent/session state (132 LOC)
│   └── index.ts             ← Gateway bootstrap (18 LOC)
└── types/
    └── agent-event.ts ← Shared event schema + validation (48 LOC)
tests/
├── hub.test.ts        ← Hub tests (31 passing)
├── adapter.test.ts    ← Adapter tests (39 passing)
└── gateway.test.ts    ← Gateway tests (28 passing, Phase 7)
claw3d/               ← Embedded Claw3D visualization
├── package.json
├── src/              ← Next.js components + API routes
└── server/           ← WebSocket gateway
data/                 ← JSONL event logs (runtime, gitignored)
scripts/
└── dev-all.js       ← Start hub + Claw3D together
```

## Principles

- **YAGNI**: No features until needed
- **KISS**: Hub is ~100 LOC, adapter is ~100 LOC
- **DRY**: Types shared, not duplicated
- **200-line limit**: Split files exceeding this

## Development Scripts

```bash
npm run dev              # Start hub only (:4000)
npm run dev:gateway      # Start gateway only (:18789) — Phase 7 NEW
npm run dev:adapter      # Start legacy adapter (Phase 2, deprecated)
npm run dev:all         # Start hub + Claw3D + gateway
npm run dev:claw3d      # Start Claw3D only (:3000)
npm test                # Run Vitest suite (98 tests: 31 hub + 39 adapter + 28 gateway)
npm run test:e2e        # Run E2E smoke test (7 checks: publish, JSONL, health)
npm run build           # Compile TypeScript to dist/
npm start               # Run compiled hub (production)
```

## Hook Scripts (Phase 3 + Phase 6)

### Phase 3 Hooks (Local)
```bash
# Claude Code PostToolUse hook — fires on every tool use
bash scripts/hook-post-tool-use.sh
  Env: HUB_URL, AGENT_BUS_AGENT, AGENT_BUS_PROJECT
  Example: Event on Edit tool use

# Claude Code session event hook — fires on session start/end
bash scripts/hook-session-event.sh [start|end]
  Env: Same as above
  Example: Register session lifecycle events
```

### Phase 6 Hooks (Remote with CF Access)
```bash
# Updated hooks with Cloudflare Access authentication
bash scripts/hook-post-tool-use.sh
  Env: HUB_URL, AGENT_BUS_AGENT, AGENT_BUS_PROJECT, CF_ACCESS_SERVICE_TOKEN
  Example: curl -X POST https://agent-bus.boxlab.cloud/events \
    -H "X-Auth-Service-Token: $CF_ACCESS_SERVICE_TOKEN" \
    -d '{...}'

# Same for session event hook
bash scripts/hook-session-event.sh [start|end]
  Env: Same as above
```

### Setup & Configuration
```bash
# Interactive Cloudflare Tunnel setup (Phase 6)
bash scripts/setup-cloudflare-tunnel.sh
  Sets up CF tunnel, creates Access policy, installs LaunchAgent
  Creates/updates cloudflared config at ~/.cloudflare/

# Use scripts/claude-settings-template.json as reference
# Use scripts/cloudflared-config-template.yml for tunnel config
```

## CLI-Anything Commands (Phase 4)

```bash
# Publish event
cli-anything-agent-bus publish --agent dev --project tickets --event tool_use --tool Edit --file auth.ts

# Subscribe to live events
cli-anything-agent-bus subscribe --project tickets --json

# Replay from JSONL log
cli-anything-agent-bus replay --last 20 --json

# Check hub health
cli-anything-agent-bus status --json
```

## Error Handling

- Validate all input (schema, size, field lengths) before processing
- Return 400 for schema violations, 413 for oversized payloads
- Log malformed events to stderr, don't crash the hub
- Graceful shutdown on SIGINT (flush JSONL, close connections, 5s timeout)
- Phase 2 Adapter: Auto-reconnect on hub/Claw3D disconnect (3s delay, configurable)
- Adapter: Wait for Claw3D auth response before forwarding events
- Adapter: Fail fast if CLAW3D_TOKEN env var is missing
- **Phase 3 Hooks**: Fail silently with 1s timeout — never block Claude Code
- **Phase 3 Hooks**: Gracefully fall back to default env values (localhost:4000, whoami, pwd basename)
- **Phase 4 CLI**: Validate hub connectivity before executing commands (retry on timeout)
- **Phase 5 E2E**: Use ephemeral ports (4444) to avoid conflicts with dev server
- **Phase 6 CF Tunnel**: Validate CF Access token before sending requests (exit with error if missing)
- **Phase 6 CF Tunnel**: Handle 401 Unauthorized (expired CF token) gracefully
- **Phase 6 LaunchAgent**: Log errors to ~/Library/Logs/com.cloudflare.cloudflared.log for debugging

## Testing

- **Framework**: Vitest (fast, ESM-native) for TypeScript; pytest for Python
- **Coverage**: 98 unit tests (31 hub + 39 adapter + 28 gateway) + 16 Python tests + 7 E2E checks
- **Strategy**: Integration tests over mocks (real WebSocket, real JSONL I/O)
- **File organization**: Colocate test names with feature (*.test.ts for each module)

**Phase 1 Hub tests (31):**
- Schema validation (invalid JSON, missing fields, unknown event types)
- Field length validation (max 1024 chars)
- Payload size limits (max 1 MB)
- WebSocket broadcast (all clients receive events)
- JSONL persistence (events written and readable)
- Graceful shutdown (connections closed, no hanging processes)

**Phase 2 Adapter tests (39):**
- Event translation (all EventType → Claw3dEventFrame)
- runId/sessionKey derivation (deterministic, consistent)
- Connect frame auth flow
- Dual WebSocket connection (hub + Claw3D)
- Input validation via isValidEvent type guard
- Auto-reconnect on disconnect (hub + Claw3D)
- Clean shutdown (all connections closed)

**Phase 7 Gateway tests (28) — NEW:**
- AgentRegistry: agent registration, session tracking, auto-register on tool_use
- Chat message ring buffer (max 100 per session)
- Protocol handler: RPC validation, all 10 methods (connect, agents.list, config.get, etc.)
- Presence versioning and broadcasting
- Event translation (session_start, tool_use, task_complete, session_end, heartbeat)
- Hub connection resilience (reconnect on disconnect)
- Client handshake flow (connect required before other methods)

**Phase 4 CLI tests (16 Python):**
- Publisher module: event creation, validation
- Subscriber module: WebSocket connection, message parsing
- Replay module: JSONL parsing, filtering
- Status module: health endpoint querying
- CLI router: command dispatch, error handling

**Phase 5 E2E tests (7 checks):**
- Hub startup and liveliness on ephemeral port
- Event publishing (session_start, tool_use, session_end)
- JSONL log correctness (event count, types, order)
- Health endpoint statistics accuracy
- Clean shutdown and resource cleanup
