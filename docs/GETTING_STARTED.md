# Getting Started with Agent Bus

Get agents from your local Claude Code (or any AI session) visualized in Claw3D's 3D office. This guide takes you from zero to working agents in 10–20 minutes.

---

## Prerequisites

- **Node.js 18+** and npm
- **Mac, Linux, or Windows (Git Bash)**
- **Optional:** Claw3D running locally (see [Local Development](#local-development))
- **Optional:** Cloudflare account for remote access (see [Enable Remote Access](#enable-remote-access-cloudflare-tunnel))

---

## Quick Start (5 min)

### 1. Install & Start the Hub

```bash
git clone https://github.com/yourusername/agent-bus.git
cd agent-bus
npm install
npm run dev
```

Hub is running at `http://localhost:4000`.

**Verify:** Open another terminal:

```bash
curl http://localhost:4000/health
# Output: {"status":"ok","clients":0,"events":0}
```

### 2. Send a Test Event

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"agent":"test-agent","project":"demo","event":"tool_use","tool":"Read"}'
```

You should see output from the health endpoint change (event count increments).

### 3. Subscribe to Events (Optional Verification)

```bash
# In another terminal, connect to WebSocket
npm install -g wscat
wscat -c ws://localhost:4000
```

You'll see events stream as JSON objects. Send another test event in a different terminal to confirm.

---

## Add the Gateway (3D Connection)

The Gateway translates agent-bus events to Claw3D's 3D protocol. It connects to the hub and broadcasts agent presence to Claw3D.

### 1. Start the Gateway

```bash
npm run dev:gateway
```

Gateway is running at `ws://localhost:18789`.

### 2. Point Claw3D to the Gateway

In Claw3D's environment or settings, set:

```bash
export GATEWAY_URL="ws://localhost:18789"
```

Then start/restart Claw3D. It will connect to the gateway and register agents.

### 3. Verify

- Open Claw3D UI at `http://localhost:3000`
- Send another test event (see Quick Start step 2)
- You should see an agent appear in the 3D office with a working status animation

**Expected behavior:** Agents show in the office with a "working" latch for ~5 seconds per tool use, then go idle until the next event.

---

## Connect Claude Code Hooks

This is how your actual Claude Code sessions report what they're doing. Hooks fire on every tool use and session end.

### Step 1: Locate the Hook Scripts

The repository includes two scripts:

- **`scripts/hook-post-tool-use.sh`** — fires on every tool use
- **`scripts/hook-session-event.sh`** — fires on session start/end

Note their full paths:

```bash
HOOK_POST_TOOL=$(pwd)/scripts/hook-post-tool-use.sh
HOOK_SESSION=$(pwd)/scripts/hook-session-event.sh
echo "Hooks: $HOOK_POST_TOOL, $HOOK_SESSION"
```

### Step 2: Configure Environment

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or equivalent):

```bash
# Agent identity
export AGENT_BUS_AGENT="my-agent-name"    # e.g., "backend-dev", "frontend-lead"
export AGENT_BUS_PROJECT="my-project"     # e.g., "tickets", "brainstorm"

# Hub URL (http://localhost:4000 for local, or remote via CF tunnel)
export HUB_URL="http://localhost:4000"
```

**For Cloudflare remote access** (see section below), also set CF credentials:

```bash
export CF_CLIENT_ID="your-cf-client-id"
export CF_CLIENT_SECRET="your-cf-client-secret"
```

Reload: `source ~/.bashrc` or `source ~/.zshrc` (or open a new terminal).

### Step 3: Configure Claude Code Hooks

In Claude Code, open **Settings** → **Hooks** (or create `settings.json`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "bash /path/to/agent-bus/scripts/hook-post-tool-use.sh"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "bash /path/to/agent-bus/scripts/hook-session-event.sh end"
      }
    ]
  }
}
```

Replace `/path/to/agent-bus` with the actual path (use `pwd` from earlier).

**Hooks fail silently** — they never block Claude Code, even if the hub is down or network is offline. There's a 1-second timeout per hook.

### Step 4: Verify Integration

1. Start the hub and gateway (if not already running):

   ```bash
   npm run dev:gateway
   ```

2. In Claude Code, use any tool (Read, Write, Bash, etc.)

3. Check the event log:

   ```bash
   tail -f data/events.jsonl
   ```

   You should see a new line like:

   ```json
   {"ts":1711065600000,"agent":"my-agent-name","project":"my-project","event":"tool_use","tool":"Read"}
   ```

4. In Claw3D, the agent should appear and show activity.

---

## Platform-Specific Setup

### macOS

All steps above work directly. To auto-start the hub on login (optional):

```bash
# Create LaunchAgent
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.yourname.agent-bus.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yourname.agent-bus</string>
  <key>ProgramArguments</key>
  <array>
    <string>bash</string>
    <string>-c</string>
    <string>cd ~/path/to/agent-bus && npm start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>~/Library/Logs/agent-bus.log</string>
  <key>StandardErrorPath</key>
  <string>~/Library/Logs/agent-bus-error.log</string>
</dict>
</plist>
EOF

# Load
launchctl load ~/Library/LaunchAgents/com.yourname.agent-bus.plist
```

Check status: `launchctl list | grep agent-bus`

Unload: `launchctl unload ~/Library/LaunchAgents/com.yourname.agent-bus.plist`

### Windows (Git Bash)

All setup is identical, but paths differ:

1. **Hooks in settings.json:**

   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "type": "command",
           "command": "bash C:\\path\\to\\agent-bus\\scripts\\hook-post-tool-use.sh"
         }
       ]
     }
   }
   ```

2. **Environment variables** — use `C:\Users\YourName\.bashrc` or VS Code `.env` plugin:

   ```bash
   export AGENT_BUS_AGENT="my-agent"
   export AGENT_BUS_PROJECT="my-project"
   export HUB_URL="http://localhost:4000"
   ```

   Load: `source ~/.bashrc` in new Git Bash terminal.

3. **Node execution** — Git Bash should auto-discover `npm`. If not:

   ```bash
   export PATH="$PATH:/c/Program Files/nodejs"
   ```

### Linux / VPS

Same as macOS, but use **systemd** for auto-start instead of LaunchAgent:

```bash
sudo tee /etc/systemd/system/agent-bus.service << 'EOF'
[Unit]
Description=Agent Bus Hub
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/agent-bus
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable agent-bus
sudo systemctl start agent-bus

# Check status
sudo systemctl status agent-bus
```

---

## Enable Remote Access (Cloudflare Tunnel)

Run agents on a VPS or Mac Mini and access them from anywhere via HTTPS. Cloudflare Tunnel + Access handles authentication and encryption.

### Prerequisites

- Cloudflare account with a domain (e.g., `yourdomain.com`)
- Machine running the hub (Mac Mini or Linux VPS)

### Automated Setup

```bash
bash scripts/setup-cloudflare-tunnel.sh
```

**Interactive prompts:**

1. **Tunnel name** (default: `agent-bus-hub`) — identifies this tunnel
2. **Cloudflare domain** (e.g., `yourdomain.com`)
3. **Subdomain** (e.g., `agent-bus`) — full URL: `https://agent-bus.yourdomain.com`

**Actions:**

- Installs `cloudflared` CLI
- Authenticates with Cloudflare
- Creates tunnel config at `~/.cloudflared/config.yml`
- Registers `https://agent-bus.yourdomain.com` → `localhost:4000`

### Manual Configuration (if automated script fails)

1. **Install cloudflared:**

   ```bash
   # macOS
   brew install cloudflared

   # Linux
   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

2. **Authenticate:**

   ```bash
   cloudflared tunnel login
   # Browser opens — authorize with Cloudflare
   ```

3. **Create tunnel:**

   ```bash
   cloudflared tunnel create agent-bus-hub
   # Note the tunnel UUID printed
   ```

4. **Create config** (`~/.cloudflared/config.yml`):

   ```yaml
   tunnel: agent-bus-hub
   credentials-file: /Users/yourname/.cloudflared/cert.pem

   ingress:
     - hostname: agent-bus.yourdomain.com
       service: http://localhost:4000
     - hostname: claw3d.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. **Run tunnel:**

   ```bash
   cloudflared tunnel run agent-bus-hub
   ```

   Hub now accessible at `https://agent-bus.yourdomain.com`.

### Connect Claude Code to Remote Hub

Update environment variables:

```bash
export HUB_URL="https://agent-bus.yourdomain.com"
```

The hook script will POST events to your remote hub over HTTPS. **Tunnel handles all encryption and authentication.**

**Optional: Add Cloudflare Access (Service Tokens)**

For additional security, add CF Access policies:

1. In Cloudflare dashboard → Applications → Create Access Policy
2. Generate Service Token (client ID + secret)
3. Configure hooks to send CF headers (see `hook-post-tool-use.sh` line 24–26)

Set in environment:

```bash
export CF_CLIENT_ID="your-token-id"
export CF_CLIENT_SECRET="your-token-secret"
```

Hook script will automatically include CF headers in all requests.

---

## Verify End-to-End

### Local Setup

1. **Terminal 1:** Start hub and gateway

   ```bash
   npm run dev:gateway
   ```

2. **Terminal 2:** Send a test event

   ```bash
   curl -X POST http://localhost:4000/events \
     -H "Content-Type: application/json" \
     -d '{"agent":"alice","project":"demo","event":"tool_use","tool":"Bash"}'
   ```

3. **Terminal 3:** Watch events

   ```bash
   tail -f data/events.jsonl
   ```

4. **Claw3D window:** Agent "alice" should appear in the 3D office

### Remote Setup

1. **VPS/Mac Mini:** Tunnel running (`cloudflared tunnel run agent-bus-hub`)

2. **Local machine:** Claude Code with hooks configured, `HUB_URL=https://agent-bus.yourdomain.com`

3. **Use a tool in Claude Code:** Hook fires → event sent over HTTPS → tunnel → hub → Claw3D

4. **Verify:** Check Claw3D; agent appears

---

## What to Expect

### Agent Appearance

- **First tool use:** Agent appears in the 3D office (name from `AGENT_BUS_AGENT`)
- **Working state:** Agent shows "working" animation for ~5 seconds
- **Idle state:** After 5 seconds, agent goes idle (gray/dimmed)
- **Next tool use:** Working animation again

### Logging

All events are logged to `data/events.jsonl` (JSONL format):

```json
{"ts":1711065600000,"agent":"alice","project":"demo","event":"tool_use","tool":"Bash"}
{"ts":1711065602000,"agent":"alice","project":"demo","event":"tool_use","tool":"Read"}
{"ts":1711065605000,"agent":"alice","project":"demo","event":"session_end"}
```

Timestamps are Unix milliseconds. Logs are append-only and atomic (safe for concurrent access).

### Network Behavior

- **Hub down:** Hooks fail silently (1s timeout), Claude Code is never blocked
- **Claw3D down:** Hub still accepts and logs events; gateway reconnects automatically
- **Remote tunnel down:** Same behavior — hooks timeout gracefully

---

## Troubleshooting

**Port already in use:** See [Troubleshooting Guide](TROUBLESHOOTING.md)

**Hooks not firing:** Verify environment variables and hook script paths (see Step 2 & 3 above)

**Agent not appearing in Claw3D:** Check gateway is running (`npm run dev:gateway`) and Claw3D points to correct `GATEWAY_URL`

**Remote tunnel issues:** See [Troubleshooting](TROUBLESHOOTING.md) → CF Tunnel section

---

## Next Steps

- [API Reference](../docs/system-architecture.md) — Event schema, WebSocket protocol
- [Code Standards](../docs/code-standards.md) — Integrate agent-bus into your project
- [Troubleshooting](TROUBLESHOOTING.md) — Common issues and fixes
- [CLI Commands](../docs/project-overview-pdr.md) — Advanced: replay, status, custom publishers
