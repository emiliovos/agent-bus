# Agent Bus

Lightweight event hub that bridges AI coding sessions (Claude Code, Gemini, etc.) to [Claw3D](https://github.com/iamlukethedev/Claw3D) 3D visualization. Zero inference cost — pure event routing.

**Status:** Phase 7 Complete — All phases delivered + OpenClaw Gateway + Cloudflare Tunnel

## How it Works

```
Your AI session (anywhere) → CF Tunnel HTTPS → agent-bus hub → Claw3D renders in 3D
```

1. Claude Code hooks emit events on every tool use (via CF Tunnel)
2. Agent Bus receives, logs, and broadcasts events
3. OpenClaw Gateway translates to 3D office protocol (Phase 7)
4. Agents appear and move in the 3D retro office
5. JSONL logs captured for audit & replay

## Quick Start

### Local Development (Single Machine)

```bash
npm install

# Optional: clone Claw3D for full sandbox (3D visualization on :3000)
git clone --depth 1 https://github.com/iamlukethedev/Claw3D.git claw3d && cd claw3d && npm install && cd ..

npm run dev        # Hub only (:4000)
npm run dev:gateway # Gateway only (:18789) — Phase 7
npm run dev:all    # Hub + Claw3D + Gateway (:4000 + :3000 + :18789)
```

### Production (Remote Access via Cloudflare Tunnel)

```bash
npm install && npm run build
npm start          # Start hub (:4000)

# Setup Cloudflare Tunnel (interactive)
bash scripts/setup-cloudflare-tunnel.sh
```

Tunnel endpoints:
- Hub: https://agent-bus.boxlab.cloud
- Claw3D: https://claw3d.boxlab.cloud

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

### Claude Code Hook Integration

#### Step 1: Get CF Access Token

```bash
# From Cloudflare dashboard → Applications → Agent Bus
export CF_ACCESS_SERVICE_TOKEN="<your-service-token>"
```

#### Step 2: Configure Environment

```bash
# Add to ~/.zshrc or ~/.bashrc
export AGENT_BUS_AGENT="my-agent-name"
export AGENT_BUS_PROJECT="my-project"
export HUB_URL="https://agent-bus.boxlab.cloud"  # Remote
export CF_ACCESS_SERVICE_TOKEN="<token>"

# Or for local dev:
# export HUB_URL="http://localhost:4000"
```

#### Step 3: Merge Hook Settings

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

## Documentation

| Document | Purpose |
|----------|---------|
| [README](README.md) | This file — quick start |
| [Project Overview PDR](docs/project-overview-pdr.md) | Requirements & success criteria |
| [System Architecture](docs/system-architecture.md) | Technical design & protocols |
| [Code Standards](docs/code-standards.md) | Development conventions |
| [Deployment Guide](docs/deployment-guide.md) | Setup, monitoring, troubleshooting |
| [Project Roadmap](docs/project-roadmap.md) | Phase status & timeline |
| [Codebase Summary](docs/codebase-summary.md) | File inventory & LOC |

## Tech Stack

- **Hub:** Node.js + TypeScript, WebSocket, JSONL logging
- **Gateway:** TypeScript, OpenClaw protocol, 10 RPC methods (Phase 7)
- **Visualization:** Claw3D (Next.js), 3D office environment
- **CLI:** Python Click, event replay, publish/subscribe
- **Transport:** Cloudflare Tunnel (HTTPS) + CF Access (service tokens)
- **Testing:** Vitest (98 tests) + pytest (16 tests) + E2E (7 checks)

## Cost

| Component | Cost |
|-----------|------|
| Infrastructure | $0 (existing Mac Mini) |
| CF Tunnel | $0 (quota-based) |
| CF Access | $0 (service tokens only) |
| OpenClaw | $0 (passive mode, 999h heartbeat) |
| **Total** | **$0** |

## License

MIT
