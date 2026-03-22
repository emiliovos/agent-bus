# Agent Bus CLI Skill

## Name
cli-anything-agent-bus

## Description
Command-line interface for the Agent Bus event hub. Publish agent events, subscribe to live broadcasts, replay from JSONL logs, and check hub health.

## Commands

### publish
Publish an event to the hub.
```bash
cli-anything-agent-bus publish --agent dev --project tickets --event tool_use --tool Edit --file auth.ts
```

### subscribe
Subscribe to live events via WebSocket.
```bash
cli-anything-agent-bus subscribe --project tickets --json
```

### replay
Replay past events from the JSONL log.
```bash
cli-anything-agent-bus replay --last 20 --json
```

### status
Check hub health and connection stats.
```bash
cli-anything-agent-bus status --json
```

## Environment Variables
- `HUB_URL` — Hub base URL (default: http://localhost:4000)
- `AGENT_BUS_LOG` — Path to JSONL log file (default: data/events.jsonl)

## Output Modes
- Human-readable (default)
- JSON (`--json` flag)

## Event Types
- `session_start` — Agent session begins
- `session_end` — Agent session ends
- `tool_use` — Agent uses a tool (Edit, Read, Bash, etc.)
- `task_complete` — Agent finishes a task
- `heartbeat` — Keep-alive signal
