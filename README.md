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

### For Users: Get Started in 5 Minutes

New to Agent Bus? Follow the [Getting Started Guide](docs/GETTING_STARTED.md):
- Local hub setup
- Claude Code hook integration
- Platform-specific instructions (macOS, Windows, Linux)
- Remote access via Cloudflare Tunnel

### For Developers: Local Development

```bash
npm install

# Optional: clone Claw3D for full sandbox (3D visualization on :3000)
git clone --depth 1 https://github.com/iamlukethedev/Claw3D.git claw3d && cd claw3d && npm install && cd ..

npm run dev        # Hub only (:4000, open http://localhost:4000 for dashboard)
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

Tunnel endpoints: `https://agent-bus.yourdomain.com` and `https://claw3d.yourdomain.com` (replace with your Cloudflare domain)

## Usage

### Publish Events

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"agent":"alice","project":"demo","event":"tool_use","tool":"Read"}'
```

### Subscribe to Events

```js
const ws = new WebSocket('ws://localhost:4000');
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

### Integrate Claude Code

See [Getting Started Guide → Connect Claude Code Hooks](docs/GETTING_STARTED.md#connect-claude-code-hooks) for step-by-step integration with environment variables, hook scripts, and settings configuration.

## Documentation

### For Users & Operators

| Document | Purpose |
|----------|---------|
| [Getting Started](docs/GETTING_STARTED.md) | Step-by-step setup (5–20 min) |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |

### For Developers & Architects

| Document | Purpose |
|----------|---------|
| [System Architecture](docs/system-architecture.md) | Technical design, event schema, protocols |
| [Code Standards](docs/code-standards.md) | Development conventions and patterns |
| [Project Overview PDR](docs/project-overview-pdr.md) | Requirements, success criteria, constraints |
| [Deployment Guide](docs/deployment-guide.md) | Environment variables, production setup |
| [Project Roadmap](docs/project-roadmap.md) | Phase status, milestones, timeline |
| [Codebase Summary](docs/codebase-summary.md) | File inventory, LOC, module structure |

## Tech Stack

- **Hub:** Node.js + TypeScript, WebSocket, JSONL logging
- **Gateway:** TypeScript, OpenClaw protocol, 10 RPC methods (Phase 7)
- **Visualization:** Claw3D (Next.js), 3D office environment
- **CLI:** Python Click, event replay, publish/subscribe
- **Transport:** Cloudflare Tunnel (HTTPS) + CF Access (service tokens)
- **Testing:** Vitest (121 tests across 3 suites) + E2E smoke tests

## Cost

| Component | Cost |
|-----------|------|
| Hub Server | $0 (any machine, local or VPS) |
| Cloudflare Tunnel | $0 (free tier) |
| Cloudflare Access | $0 (service tokens) |
| OpenClaw Gateway | $0 (passive mode, no LLM inference) |
| **Total** | **$0/month** |

## License

MIT
