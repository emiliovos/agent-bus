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
├── hub/           ← WebSocket + HTTP event hub
├── adapter/       ← Claw3D protocol translator
└── types/         ← Shared interfaces
tests/
├── hub.test.ts
└── adapter.test.ts
data/              ← JSONL event logs (gitignored)
```

## Principles

- **YAGNI**: No features until needed
- **KISS**: Hub is ~100 LOC, adapter is ~100 LOC
- **DRY**: Types shared, not duplicated
- **200-line limit**: Split files exceeding this

## Error Handling

- Silent skip for malformed events (log to stderr, don't crash)
- Auto-reconnect on Claw3D WebSocket disconnect (3s delay)
- Graceful shutdown on SIGINT (flush JSONL, close connections)

## Testing

- Vitest for unit + integration
- Test event schema validation
- Test WebSocket broadcast
- Test Claw3D frame translation
- Test JSONL append + replay
