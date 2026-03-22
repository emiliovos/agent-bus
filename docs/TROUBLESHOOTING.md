# Troubleshooting Guide

Common issues and solutions when running Agent Bus.

---

## Local Development Issues

### Port 3000 or 4000 Already in Use

**Symptom:** `EADDRINUSE: address already in use :::4000`

**Causes:**
- Claw3D LaunchAgent (port 3000)
- Previous hub/gateway process still running
- Another service using the port

**Solutions:**

```bash
# Find and kill process on port 4000
lsof -i :4000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or for port 3000 (Claw3D)
launchctl unload ~/Library/LaunchAgents/com.vibedev.claw3d.plist
launchctl load ~/Library/LaunchAgents/com.vibedev.claw3d.plist

# Or use alternative port
PORT=4001 npm start
```

### `.next/dev/lock` File Error (Claw3D)

**Symptom:** `Error: ENOENT: no such file or directory, open '.next/dev/lock'`

**Cause:** Claw3D crashed with Next.js cache corruption

**Solution:**

```bash
cd claw3d
rm -rf .next
npm run dev
```

### Hub Starts But Gateway Won't Connect

**Symptom:** Gateway logs show `WebSocket connection refused` or `connection reset`

**Cause:** Hub WS port misconfigured or hub not listening on correct interface

**Solution:**

```bash
# Verify hub is listening
netstat -an | grep 4000

# Check logs
npm run dev 2>&1 | grep -i "listening\|error"

# Explicitly start both in separate terminals
# Terminal 1
npm run dev

# Terminal 2 (wait 2 seconds, then)
npm run dev:gateway
```

---

## Agent Visibility Issues

### Agent Shows Idle But Never Working

**Symptom:** Agent appears in Claw3D but no "working" animation on tool use

**Cause:** `sessionKey` format mismatch or missing `runId` in payload

**Solution:**

1. Verify sessionKey format (should be `agent:<agent-id>:main`):

   ```bash
   tail -f data/events.jsonl | grep -o '"agent":"[^"]*"'
   ```

   Format should match Claw3D's expected namespace.

2. Check that `runId` is included in gateway payload:

   ```bash
   npm run dev:gateway 2>&1 | grep -i "runid\|translate"
   ```

3. Update environment if needed:

   ```bash
   export AGENT_BUS_AGENT="alice"  # Simple, no special chars
   npm run dev:gateway
   ```

### Agent Not Appearing in Claw3D at All

**Symptom:** Hub logs show events, gateway connected, but no agent in 3D office

**Causes:**
- Claw3D not running
- Gateway not connected to hub
- GATEWAY_URL env var not set in Claw3D

**Solutions:**

```bash
# 1. Verify gateway is running
curl http://localhost:18789/health 2>/dev/null || echo "Gateway down"

# 2. Verify hub has events
curl http://localhost:4000/health | jq .events

# 3. Check Claw3D env
echo $GATEWAY_URL  # Should be ws://localhost:18789

# 4. Restart Claw3D
npm run dev:all   # Restart everything
```

### Multiple Duplicate Agents with Same Name

**Symptom:** 5 copies of "alice" in 3D office instead of 1

**Cause:** `PROJECT` env var changes per working directory, creating new sessionKey each time

**Solution:** Set fixed project name globally:

```bash
# Add to ~/.bashrc or ~/.zshrc
export AGENT_BUS_PROJECT="my-project"

# Or hardcode in hook script
vi scripts/hook-post-tool-use.sh
# Change: PROJECT="${AGENT_BUS_PROJECT:-$(basename "$(pwd)")}"
# To: PROJECT="${AGENT_BUS_PROJECT:-my-project}"
```

---

## Hook Integration Issues

### Hooks Not Firing (No Events Logged)

**Symptom:** Use a tool in Claude Code, but no events appear in `data/events.jsonl`

**Causes:**
- Hook script path wrong in settings.json
- Environment variables not loaded
- Hook script not executable
- Hub not running

**Solutions:**

```bash
# 1. Verify hook is executable
chmod +x scripts/hook-post-tool-use.sh

# 2. Test hook manually
export AGENT_BUS_AGENT="test"
export AGENT_BUS_PROJECT="demo"
export HUB_URL="http://localhost:4000"
bash scripts/hook-post-tool-use.sh

# Should see event in:
curl http://localhost:4000/health | jq .events

# 3. Verify settings.json hook path is absolute
grep "hook-post-tool-use" ~/.claude/settings.json
# Should be full path like /Users/alice/projects/agent-bus/scripts/hook-post-tool-use.sh

# 4. Check Claude Code logs
# Settings → Logs → PostToolUse
# Look for timeout or command not found errors
```

### Hooks Firing But Wrong Agent/Project Name

**Symptom:** Events logged with `agent: "unknown"` or wrong project

**Cause:** Env vars not set or shell profile not sourced

**Solution:**

```bash
# 1. Verify env vars are set
echo $AGENT_BUS_AGENT
echo $AGENT_BUS_PROJECT

# 2. Add to shell profile
cat >> ~/.bashrc << 'EOF'
export AGENT_BUS_AGENT="my-agent-name"
export AGENT_BUS_PROJECT="my-project"
export HUB_URL="http://localhost:4000"
EOF

# 3. Reload
source ~/.bashrc

# 4. Test hook again
bash scripts/hook-post-tool-use.sh
curl http://localhost:4000/health | jq '.events | .[-1]'
```

### Hooks Not Firing on Windows (Git Bash)

**Symptom:** Tools fire in VS Code, but no events logged

**Causes:**
- `.bashrc` not loaded in non-interactive shell
- Hook path uses forward slashes (incorrect for Git Bash)
- Claude Code not finding `bash.exe`

**Solutions:**

```bash
# 1. Use absolute Windows path in settings.json
# Instead of: C:\path\to\agent-bus\scripts\hook-post-tool-use.sh
# Use: /c/Users/YourName/agent-bus/scripts/hook-post-tool-use.sh

# 2. Hardcode defaults in hook script (edit scripts/hook-post-tool-use.sh)
# Add after line 7:
HUB_URL="${HUB_URL:-http://localhost:4000}"
AGENT="${AGENT_BUS_AGENT:-my-agent-on-windows}"
PROJECT="${AGENT_BUS_PROJECT:-windows-dev}"

# 3. Point Claude Code to Git Bash bash.exe
# Settings → Terminal → shell: C:\Program Files\Git\bin\bash.exe

# 4. Test
bash /c/Users/YourName/agent-bus/scripts/hook-post-tool-use.sh
```

---

## Remote Access (Cloudflare Tunnel) Issues

### Tunnel Won't Start

**Symptom:** `error building ingress: zone lookup failed` or `tunnel not found`

**Causes:**
- Cloudflare authentication expired
- Tunnel config syntax error
- Domain not added to Cloudflare

**Solutions:**

```bash
# 1. Re-authenticate
cloudflared tunnel login
# Opens browser to authorize

# 2. Check tunnel exists
cloudflared tunnel list
# Should list agent-bus-hub

# 3. Validate config
cat ~/.cloudflared/config.yml
# Should have valid YAML syntax (no tabs, 2-space indent)

# 4. Re-create if needed
cloudflared tunnel delete agent-bus-hub
bash scripts/setup-cloudflare-tunnel.sh
```

### Tunnel Returns 403 Forbidden

**Symptom:** `https://agent-bus.yourdomain.com` returns 403 Access Denied

**Cause:** Cloudflare Access policy configured but no service token provided

**Solutions:**

1. **Remove Access policy** (quickest for dev):
   - Cloudflare Dashboard → Applications → Agent Bus
   - Delete or disable access policy

2. **Or configure service token:**
   - Create Service Token in Access dashboard
   - Export credentials:

     ```bash
     export CF_CLIENT_ID="token-id"
     export CF_CLIENT_SECRET="token-secret"
     ```

   - Hook script will auto-include CF headers (already in `hook-post-tool-use.sh`)

### Tunnel Responds But No Events from Remote Claude Code

**Symptom:** `curl https://agent-bus.yourdomain.com/health` works, but hook events don't arrive

**Cause:** Hook script timing out or CF headers missing

**Solutions:**

```bash
# 1. Test hook with remote URL
export HUB_URL="https://agent-bus.yourdomain.com"
export CF_CLIENT_ID="your-token-id"
export CF_CLIENT_SECRET="your-token-secret"
bash scripts/hook-post-tool-use.sh

# 2. Check response
curl -v https://agent-bus.yourdomain.com/health

# 3. Verify tunnel is running
cloudflared tunnel status agent-bus-hub

# 4. Increase timeout in hook script if network is slow
# Edit scripts/hook-post-tool-use.sh line 23
# Change: curl -s -m 1 ...
# To: curl -s -m 5 ...   (5 second timeout)
```

---

## Gateway Issues

### Gateway Crashes on Claw3D Restart

**Symptom:** Gateway logs show `WebSocket error: connection reset` repeatedly

**Cause:** Claw3D restart resets WS connection; no auto-reconnect

**Solution:** Use auto-restart wrapper (or manual restart):

```bash
# Manual restart wrapper
while true; do
  npm run dev:gateway
  echo "Gateway crashed, restarting in 5s..."
  sleep 5
done

# Or in systemd (for VPS)
sudo tee /etc/systemd/system/agent-bus-gateway.service << 'EOF'
[Unit]
Description=Agent Bus Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/user/agent-bus
ExecStart=/usr/bin/npm run dev:gateway
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable agent-bus-gateway
sudo systemctl start agent-bus-gateway
```

### Gateway Receives Events But Claw3D Doesn't Update

**Symptom:** Hub logs show 5 events, but Claw3D agent doesn't move

**Cause:** Missing `runId` in translated payload, or Claw3D protocol mismatch

**Solution:**

```bash
# 1. Check gateway logs for translation errors
npm run dev:gateway 2>&1 | grep -i "runid\|translate\|error"

# 2. Verify Claw3D is listening on :18789
curl http://localhost:18789/health 2>/dev/null || echo "Gateway not responding"

# 3. Upgrade to latest gateway code
git pull origin main
npm install
npm run build
npm run dev:gateway
```

---

## Performance & Memory Issues

### Hub Uses Too Much Memory

**Symptom:** `Node process memory grows over time`

**Cause:** Large number of connected WebSocket clients or unbounded event log

**Solution:**

```bash
# 1. Check connected clients
curl http://localhost:4000/health | jq .clients

# 2. Rotate/archive event log
mv data/events.jsonl data/events.jsonl.$(date +%s)
npm run dev  # Hub creates fresh log

# 3. Limit max clients (edit src/index.ts)
# Add: if (hub.clients.size > 100) ws.close();

# 4. Monitor
watch -n 1 'ps aux | grep node | grep -v grep | awk "{print \$6}"'
```

### Events Arrive Late or Out of Order

**Symptom:** Events have timestamps but appear delayed in Claw3D

**Cause:** Network latency (especially remote), or queue backup

**Solution:**

```bash
# 1. Check hub queue
npm run dev 2>&1 | tail -5  # Look for queue size

# 2. For remote access, test latency
curl -w "Time: %{time_total}s\n" https://agent-bus.yourdomain.com/health

# 3. If > 500ms, consider:
#    - Regional Cloudflare endpoint (check dashboard)
#    - Or use VPS closer to your location
#    - Or local hub + tunnel only for Claw3D, not hooks
```

---

## Quick Reference Table

| Issue | Check First | Quick Fix |
|-------|------------|-----------|
| Port in use | `lsof -i :4000` | `kill -9 <pid>` |
| Agent not appearing | Gateway running? | `npm run dev:gateway` |
| No events logged | Env vars set? | `echo $AGENT_BUS_AGENT` |
| Wrong agent name | Project changes? | `export AGENT_BUS_PROJECT="fixed"` |
| Windows hooks not firing | `.bashrc` sourced? | Hardcode in hook script |
| Tunnel 403 error | Access policy? | Remove or add service token |
| Gateway crashes | Claw3D restarted? | Use restart wrapper |
| Memory leak | Too many clients? | Archive old logs |

---

## Getting Help

- **Hub logs:** `npm run dev 2>&1 | tail -20`
- **Gateway logs:** `npm run dev:gateway 2>&1 | tail -20`
- **Recent events:** `tail -10 data/events.jsonl`
- **Health check:** `curl http://localhost:4000/health | jq`
- **Tunnel status:** `cloudflared tunnel status agent-bus-hub`

---

## Still Stuck?

Check the [System Architecture](system-architecture.md) and [Code Standards](code-standards.md) for deeper technical details.
