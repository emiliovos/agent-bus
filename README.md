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

# Optional: clone Claw3D for full sandbox (3D visualization on :3000)
git clone --depth 1 https://github.com/iamlukethedev/Claw3D.git claw3d && cd claw3d && npm install && cd ..

npm run dev        # Hub only (:4000)
npm run dev:all    # Hub + Claw3D (:4000 + :3000)
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

1. Copy hook scripts or reference them from your clone:

```bash
# Set env vars (add to ~/.zshrc or ~/.bashrc)
export AGENT_BUS_AGENT="my-agent-name"
export AGENT_BUS_PROJECT="my-project"
export HUB_URL="http://localhost:4000"  # or remote: http://<tailscale-ip>:4000
```

2. Merge `scripts/claude-settings-template.json` into your `.claude/settings.json`, updating the path:

```json
{
  "hooks": {
    "PostToolUse": [{
      "type": "command",
      "command": "bash /path/to/agent-bus/scripts/hook-post-tool-use.sh"
    }],
    "Stop": [{
      "type": "command",
      "command": "bash /path/to/agent-bus/scripts/hook-session-event.sh end"
    }]
  }
}
```

Hooks fail silently with 1s timeout — they never block Claude Code.

## Architecture

See [docs/system-architecture.md](docs/system-architecture.md) for full details.

## License

MIT
