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
├── index.ts           ← Entry point (server startup + shutdown)
├── hub/
│   └── event-hub.ts   ← WebSocket + HTTP event hub (163 LOC)
├── adapter/           ← Claw3D protocol translator (Phase 2)
│   └── claw3d-adapter.ts
└── types/
    └── agent-event.ts ← Shared event schema + validation (49 LOC)
tests/
├── hub.test.ts        ← Hub tests (31 passing)
└── adapter.test.ts    ← Adapter tests (Phase 2)
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
npm run dev              # Start agent-bus hub only (:4000)
npm run dev:all         # Start hub + Claw3D together
npm run dev:claw3d      # Start Claw3D only (:3000)
npm test                # Run Vitest suite (31 tests)
npm run build           # Compile TypeScript to dist/
npm start               # Run compiled hub (production)
```

## Error Handling

- Validate all input (schema, size, field lengths) before processing
- Return 400 for schema violations, 413 for oversized payloads
- Log malformed events to stderr, don't crash the hub
- Graceful shutdown on SIGINT (flush JSONL, close connections, 5s timeout)
- Phase 2: Auto-reconnect on Claw3D WebSocket disconnect (3s delay)

## Testing

- **Framework**: Vitest (fast, ESM-native)
- **Coverage**: 31 tests (validation, broadcast, health checks, limits)
- **Strategy**: Integration tests over mocks (real WebSocket, real JSONL I/O)
- **File organization**: Colocate test names with feature (hub.test.ts for hub/)

**Test categories:**
- Schema validation (invalid JSON, missing fields, unknown event types)
- Field length validation (max 1024 chars)
- Payload size limits (max 1 MB)
- WebSocket broadcast (all clients receive events)
- JSONL persistence (events written and readable)
- Graceful shutdown (connections closed, no hanging processes)
