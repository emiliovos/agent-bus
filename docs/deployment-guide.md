# Deployment Guide

**Phase:** 7 Complete — OpenClaw gateway deployed + CF tunnel
**Date:** 2026-03-22

---

## Quick Start

### Local Development (Single Machine)

```bash
npm install
npm run dev:all    # Hub + Claw3D + Adapter
```

Hub on `http://localhost:4000`, Claw3D on `http://localhost:3000`.

### Production Deployment (Mac Mini + Remote Access)

```bash
npm install
npm run build
npm start          # Start hub (:4000)

# In separate terminal
npm run dev:gateway    # Start gateway (:18789) — PHASE 7

# Setup Cloudflare Tunnel (optional, for remote access)
bash scripts/setup-cloudflare-tunnel.sh
```

**Note:** The gateway is the new standard. The legacy adapter is deprecated but still available for compatibility.

---

## Environment Variables

### Hub Server (src/index.ts)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 4000 | Hub server port |
| `LOG_DIR` | data | JSONL log directory (created if missing) |
| `NODE_ENV` | development | Set to `production` for prod |

### Gateway (src/gateway/index.ts) — Phase 7

| Variable | Default | Required | Purpose |
|----------|---------|----------|---------|
| `PORT` | 18789 | No | Gateway WebSocket port |
| `HUB_URL` | ws://localhost:4000 | No | Hub WebSocket endpoint (consumer) |

### Adapter (src/adapter/index.ts) — Deprecated, use gateway instead

| Variable | Default | Required | Purpose |
|----------|---------|----------|---------|
| `HUB_URL` | http://localhost:4000 | No | Hub WebSocket endpoint |
| `CLAW3D_URL` | http://localhost:3000 | No | Claw3D server URL |
| `CLAW3D_TOKEN` | — | Yes | OpenClaw Gateway token (not needed for native gateway) |

### Claude Code Hooks (Phase 3)

| Variable | Default | Purpose |
|----------|---------|---------|
| `HUB_URL` | http://localhost:4000 | Hub endpoint (POST /events) |
| `AGENT_BUS_AGENT` | whoami | Agent identifier |
| `AGENT_BUS_PROJECT` | pwd basename | Project namespace |

### Cloudflare Tunnel (Phase 6)

| Variable | Default | Purpose |
|----------|---------|---------|
| `CF_ACCESS_SERVICE_TOKEN` | — | CF Access service token |
| `HUB_URL` | https://agent-bus.boxlab.cloud | Remote hub URL (with CF token) |

---

## Cloudflare Tunnel Setup (Phase 6)

### Prerequisites
- Mac Mini with macOS 11+
- Cloudflare account with tunnel domain (agent-bus.boxlab.cloud)
- Claw3D API token (OpenClaw auth)

### Automated Setup

```bash
bash scripts/setup-cloudflare-tunnel.sh
```

**Prompts:**
1. Claw3D API token (for OpenClaw auth)
2. Cloudflare email
3. Cloudflare API token
4. Tunnel name (default: agent-bus)

**Actions:**
1. Downloads cloudflared binary (if needed)
2. Creates CF tunnel config at `~/.cloudflare/agent-bus.json`
3. Sets up DNS routes:
   - `agent-bus.boxlab.cloud` → localhost:4000
   - `claw3d.boxlab.cloud` → localhost:3000
4. Creates CF Access policy with service token
5. Installs LaunchAgent for auto-start
6. Updates hook scripts with CF Access headers

### Manual Tunnel Config

**1. Create credentials file:**
```bash
mkdir -p ~/.cloudflare
# Paste from CF dashboard
echo '{"a":"...", "b":"..."}' > ~/.cloudflare/agent-bus.json
```

**2. Create tunnel config:**
```bash
# Copy template and edit
cp scripts/cloudflared-config-template.yml ~/.cloudflare/agent-bus.yml

# Update with your tunnel UUID
cat >> ~/.cloudflare/agent-bus.yml <<'EOF'
tunnel: <your-tunnel-uuid>
credentials-file: /Users/<user>/.cloudflare/agent-bus.json
EOF
```

**3. Test tunnel:**
```bash
cloudflared tunnel run --config ~/.cloudflare/agent-bus.yml agent-bus
```

**4. Install LaunchAgent:**
```bash
cat > ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cloudflare.cloudflared</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/cloudflared</string>
    <string>tunnel</string>
    <string>run</string>
    <string>--config</string>
    <string>/Users/<user>/.cloudflare/agent-bus.yml</string>
    <string>agent-bus</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>/Users/<user>/Library/Logs/com.cloudflare.cloudflared.log</string>
  <key>StandardOutPath</key>
  <string>/Users/<user>/Library/Logs/com.cloudflare.cloudflared.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
```

---

## CF Access Service Tokens

### Generate Token
1. CF dashboard → Applications → Agent Bus (policy)
2. Create Service Token → copy token
3. Set as environment variable:
```bash
export CF_ACCESS_SERVICE_TOKEN="<token>"
```

### Add Token to Hooks

```bash
# Update hook scripts
echo "export CF_ACCESS_SERVICE_TOKEN='<token>'" >> ~/.zshrc

# Or embed in hook scripts
sed -i 's|^CF_ACCESS_SERVICE_TOKEN=|CF_ACCESS_SERVICE_TOKEN="<token>"|' \
  scripts/hook-post-tool-use.sh
```

---

## NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start hub only (:4000) |
| `npm run dev:gateway` | Start gateway only (:18789) — Phase 7 |
| `npm run dev:all` | Start hub + Claw3D + gateway |
| `npm run dev:adapter` | Start legacy adapter (deprecated) |
| `npm run dev:claw3d` | Start Claw3D only (:3000) |
| `npm run build` | Compile TypeScript → dist/ |
| `npm start` | Run compiled hub (production) |
| `npm test` | Run Vitest suite (98 tests) |
| `npm run test:e2e` | Run E2E smoke test |

---

## Production Checklist

- [ ] Node.js 18+ installed
- [ ] Hub PORT configured (default 4000)
- [ ] Gateway PORT configured (default 18789)
- [ ] LOG_DIR exists with write permissions
- [ ] Gateway started (npm run dev:gateway) — Phase 7
- [ ] CF Tunnel credentials installed (optional, for remote access)
- [ ] LaunchAgent configured for auto-start (optional)
- [ ] CF Access service token distributed (optional)
- [ ] Hook scripts updated with remote HUB_URL (if using CF tunnel)
- [ ] Firewall allows :4000 and :18789 (or CF tunnel only)
- [ ] JSONL logs backed up periodically

---

## Monitoring

### Hub Health

```bash
curl https://agent-bus.boxlab.cloud/health
```

Response:
```json
{
  "ok": true,
  "clients": 3,
  "events": 1042,
  "uptime": 86400
}
```

### LaunchAgent Status

```bash
launchctl list com.cloudflare.cloudflared

# View logs
tail -f ~/Library/Logs/com.cloudflare.cloudflared.log
```

### Adapter Logs

```bash
# If running in terminal
npm run dev:adapter    # See console output

# If running as background process
tail -f /path/to/agent-bus.log
```

---

## Troubleshooting

### CF Tunnel Not Connecting

1. Check credentials:
```bash
ls -la ~/.cloudflare/
cloudflared --version
```

2. Test tunnel manually:
```bash
cloudflared tunnel run --config ~/.cloudflare/agent-bus.yml agent-bus
```

3. Check LaunchAgent:
```bash
launchctl list | grep cloudflare
tail -f ~/Library/Logs/com.cloudflare.cloudflared.log
```

### CF Access 401 Unauthorized

1. Verify service token valid (CF dashboard)
2. Check token not expired
3. Rotate token if needed:
```bash
export CF_ACCESS_SERVICE_TOKEN="<new-token>"
bash scripts/hook-post-tool-use.sh
```

### Hub Not Responding

1. Check port in use:
```bash
lsof -i :4000
```

2. Restart hub:
```bash
npm start    # Background
# or
npm run dev  # Foreground
```

3. Check logs:
```bash
ls -la data/events.jsonl
tail -100 data/events.jsonl
```

### Adapter Disconnect

1. Check hub running:
```bash
curl http://localhost:4000/health
```

2. Check Claw3D running:
```bash
curl http://localhost:3000/
```

3. Check CLAW3D_TOKEN valid
4. Restart adapter (auto-reconnect in 3s)

---

## Rollback

### Disable CF Tunnel (revert to local)

```bash
launchctl unload ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist

# Update hook scripts back to localhost
export HUB_URL="http://localhost:4000"
```

### Stop Hub

```bash
# Find process
ps aux | grep "node.*src/index.ts"

# Kill
kill <pid>
```

---

## Cost Summary

| Component | Cost | Notes |
|-----------|------|-------|
| Agent Bus (Node.js) | $0 | Runs on existing Mac Mini |
| Claw3D (Next.js) | $0 | Embedded in project |
| CF Tunnel | $0 | Uses quota |
| CF Access | $0 | Service token only |
| OpenClaw (passive) | $0 | 999h heartbeat |
| **Total** | **$0** | Pure data routing |

---

## Related Links

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Cloudflare Access Docs](https://developers.cloudflare.com/cloudflare-one/access/)
- [agent-bus README](../README.md)
- [System Architecture](./system-architecture.md)
