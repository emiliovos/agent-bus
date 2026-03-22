# Agent Bus

Lightweight event hub that bridges AI coding sessions (Claude Code, Gemini, etc.) to [Claw3D](https://github.com/iamlukethedev/Claw3D) 3D visualization. Zero inference cost — pure event routing.

## How it works

```
Your AI session → hooks fire → agent-bus → Claw3D renders in 3D
```

1. Claude Code hooks emit events on every tool use
2. Agent Bus receives, logs, and broadcasts events
3. Claw3D adapter translates to 3D office protocol
4. Agents appear and move in the 3D retro office

## Quick Start

```bash
npm install
npm run dev
```

Hub starts on `ws://localhost:4000`. POST events or connect via WebSocket.

## Usage

### Publish an event

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"agent":"backend-dev","project":"tickets","event":"tool_use","tool":"Edit"}'
```

### Subscribe to events

```js
const ws = new WebSocket('ws://localhost:4000');
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

### Claude Code hook integration

Add to `.claude/settings.json` on any machine:

```json
{
  "hooks": {
    "PostToolUse": [{
      "command": "curl -s http://localhost:4000/events -d '{\"agent\":\"dev\",\"event\":\"tool_use\",\"tool\":\"$TOOL_NAME\"}'"
    }]
  }
}
```

## Architecture

See [docs/system-architecture.md](docs/system-architecture.md) for full details.

## License

MIT
