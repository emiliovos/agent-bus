# Agent Bus — Claude Code + Claw3D Bridge via CLI-Anything

## Project Overview

Lightweight event hub that bridges Claude Code sessions (local/VPS) to Claw3D 3D visualization. Uses CLI-Anything to generate discoverable CLI tools. Zero LLM inference cost — pure data routing.

## Architecture

```
Claude Code (Max sub)
    │ hooks: PostToolUse, Stop, Notification
    ▼
cli-anything-agent-bus publish (generated CLI)
    │
    ▼
agent-bus (Node.js WebSocket hub + JSONL log)
    │ broadcasts events
    ▼
claw3d-adapter (translates events → Claw3D protocol)
    │ ws://localhost:3000/api/gateway/ws
    ▼
Claw3D renders agent in 3D office
```

## Key Directories

```
agent-bus/
├── CLAUDE.md                  ← This file
├── README.md                  ← Project README
├── docs/                      ← Documentation
│   ├── project-overview-pdr.md
│   ├── system-architecture.md
│   ├── code-standards.md
│   └── codebase-summary.md
├── plans/                     ← Implementation plans
│   └── reports/               ← Research & review reports
├── src/
│   ├── hub/                   ← WebSocket event hub
│   ├── adapter/               ← Claw3D protocol adapter
│   └── types/                 ← Shared TypeScript types
├── tests/
├── package.json
└── tsconfig.json
```

## Dependencies

- **Claw3D** running at `localhost:3000` (Mac Mini LaunchAgent)
- **OpenClaw Gateway** at `localhost:18789` (passive mode, $0 tokens)
- **CLI-Anything** Claude Code plugin for CLI generation

## Event Schema (JSONL)

```json
{"ts":1711065600,"agent":"backend-dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}
{"ts":1711065605,"agent":"backend-dev","project":"tickets","event":"task_complete","task":"fix auth"}
{"ts":1711065610,"agent":"qa","project":"brainstorm","event":"session_start"}
```

## Claw3D Protocol (WebSocket frames)

Connect: `{ type: "req", method: "connect", id: "uuid", params: { auth: { token } } }`
Agent event: `{ type: "event", event: "agent", payload: { runId, stream: "lifecycle", data: { phase } } }`
Chat event: `{ type: "event", event: "chat", payload: { runId, sessionKey, state, message } }`

## Common Commands

```bash
# Start hub (dev)
npm run dev

# Start hub (production)
npm start

# Run tests
npm test

# Generate CLI via CLI-Anything (after implementation)
# /cli-anything:cli-anything ./

# Publish event manually
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"agent":"test","event":"heartbeat","project":"brainstorm"}'
```

## Constraints

- Zero API token cost — no LLM inference in the pipe
- Uses Claude Max subscription only (existing)
- OpenClaw stays passive (heartbeat=999h)
- Must speak Claw3D's existing WebSocket protocol (no Claw3D modifications)

## Related Projects

- **brainstorm**: `/Users/evtmini/Documents/GitHub/brainstorm` — Paperclip orchestration
- **claw3d**: `/Users/evtmini/Documents/GitHub/claw3d` — 3D visualization (LaunchAgent)
- **CLI-Anything**: `github.com/HKUDS/CLI-Anything` — CLI generation framework

## Development Rules

See global rules at `~/.claude/rules/`:
- `development-rules.md` — YAGNI/KISS/DRY, 200-line limit, kebab-case
- `primary-workflow.md` — Planning → implementation → testing → review
- `orchestration-protocol.md` — Subagent delegation
