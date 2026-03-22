# Codebase Summary

**Status:** Scaffolded — not yet implemented

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
├── src/
│   ├── hub/                       ← WebSocket event hub (to implement)
│   ├── adapter/                   ← Claw3D protocol adapter (to implement)
│   └── types/                     ← Shared TypeScript interfaces (to implement)
├── tests/                         ← Vitest test suite (to implement)
├── data/                          ← JSONL event logs (runtime, gitignored)
├── package.json                   ← (to create)
└── tsconfig.json                  ← (to create)
```

## Implementation Status

| Component | Status | LOC Target |
|-----------|--------|-----------|
| `src/types/` | Not started | ~30 |
| `src/hub/` | Not started | ~100 |
| `src/adapter/` | Not started | ~100 |
| `tests/` | Not started | ~150 |
| `package.json` | Not started | — |
| `tsconfig.json` | Not started | — |
| CLI-Anything generation | Not started | Auto-generated |

## Dependencies (planned)

### Production
- `ws` — WebSocket server
- No other deps (KISS)

### Development
- `typescript` ^5.9
- `tsx` — Direct TS execution
- `vitest` — Testing
- `@types/ws`, `@types/node`
