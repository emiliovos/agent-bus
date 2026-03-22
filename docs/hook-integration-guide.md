# Hook Integration Guide

Connect ANY coding agent to Agent Bus. Not just Claude Code.

---

## Event Schema

Every event flowing through the bus follows this schema:

```json
{
  "agent": "string",         // Required. Agent identifier (e.g., "claude-backend", "gemini-api")
  "project": "string",       // Required. Project namespace for isolation
  "event": "string",         // Required. One of: session_start, session_end, tool_use, task_complete, heartbeat
  "tool": "string",          // Optional. Tool name (e.g., "Edit", "Read", "Bash")
  "file": "string",          // Optional. File path (e.g., "src/auth.ts")
  "message": "string",       // Optional. Human-readable description
  "ts": 1711065605000        // Optional. Unix timestamp ms (hub adds if missing)
}
```

---

## Event Types

| Type | When | Required Fields | Optional Fields |
|------|------|-----------------|-----------------|
| `session_start` | Agent session begins | agent, project | message |
| `session_end` | Agent session ends | agent, project | message |
| `tool_use` | Agent used a tool | agent, project, tool | file, message |
| `task_complete` | Agent completed a task | agent, project | message |
| `heartbeat` | Keep-alive ping | agent, project | message |

**Example Events:**

Session start:
```json
{
  "agent": "claude-backend",
  "project": "tickets",
  "event": "session_start",
  "message": "Starting work on ticket #123"
}
```

Tool use:
```json
{
  "agent": "claude-backend",
  "project": "tickets",
  "event": "tool_use",
  "tool": "Edit",
  "file": "src/auth.ts",
  "message": "Fixing login validation"
}
```

Task complete:
```json
{
  "agent": "claude-backend",
  "project": "tickets",
  "event": "task_complete",
  "message": "Fixed login validation"
}
```

---

## Claude Code Hooks (Built-In)

### Setup

1. **Set Environment Variables:**
   ```bash
   export AGENT_BUS_AGENT="my-agent-name"       # e.g., "claude-backend"
   export AGENT_BUS_PROJECT="my-project"        # e.g., "tickets"
   export HUB_URL="http://localhost:4000"       # Local, or remote URL
   ```

2. **For Remote Access (Cloudflare Tunnel):**
   ```bash
   export HUB_URL="https://agent-bus.yourdomain.com"
   export CF_CLIENT_ID="xxxx"                   # From CF dashboard
   export CF_CLIENT_SECRET="xxxx"               # From CF dashboard
   ```

3. **Merge Hook Settings:**

   Copy `scripts/claude-settings-template.json` into `.claude/settings.json`:
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

### How It Works

**PostToolUse Hook** (`scripts/hook-post-tool-use.sh`)
- Fires after ANY tool use (Edit, Read, Bash, Write, etc.)
- Environment: `CLAUDE_TOOL_NAME`, `CLAUDE_FILE_PATH`
- Publishes: `{ agent, project, event: "tool_use", tool, file? }`
- Timeout: 1s, fails silently

**Stop Hook** (`scripts/hook-session-event.sh end`)
- Fires when session ends (Stop button or connection closes)
- Publishes: `{ agent, project, event: "session_end" }`

### Example Hook Output

When you use Edit tool:
```json
{
  "agent": "my-agent-name",
  "project": "my-project",
  "event": "tool_use",
  "tool": "Edit",
  "file": "src/auth.ts"
}
```

---

## Gemini CLI Integration

Create a hook script for Gemini CLI (or any other agent).

### Setup

1. **Create Hook Script:**
   ```bash
   #!/usr/bin/env bash
   # gemini-agent-bus-hook.sh
   # Place in a PATH-accessible location or reference directly

   HUB_URL="${HUB_URL:-http://localhost:4000}"
   AGENT="${GEMINI_AGENT_NAME:-gemini-dev}"
   PROJECT="${GEMINI_PROJECT:-my-project}"
   TOOL="${1:-unknown}"
   FILE="${2:-}"

   PAYLOAD="{\"agent\":\"$AGENT\",\"project\":\"$PROJECT\",\"event\":\"tool_use\",\"tool\":\"$TOOL\"}"

   if [ -n "$FILE" ]; then
     PAYLOAD="${PAYLOAD%\}},\"file\":\"$FILE\"}"
   fi

   curl -s -m 1 -X POST "$HUB_URL/events" \
     -H "Content-Type: application/json" \
     -d "$PAYLOAD" > /dev/null 2>&1 || true
   ```

2. **Call Hook from Gemini CLI:**
   ```python
   # In your Gemini CLI on_tool_use handler
   import subprocess

   def fire_hook(tool_name, file_path=None):
       hook_script = "/path/to/gemini-agent-bus-hook.sh"
       args = [hook_script, tool_name]
       if file_path:
           args.append(file_path)

       # Fire and forget (1s timeout)
       try:
           subprocess.run(args, timeout=1, capture_output=True)
       except subprocess.TimeoutExpired:
           pass  # Fail silently
   ```

3. **Set Environment (if using remote):**
   ```bash
   export HUB_URL="https://agent-bus.yourdomain.com"
   export CF_CLIENT_ID="xxxx"
   export CF_CLIENT_SECRET="xxxx"
   ```

---

## Codex / Other CLI Agents

For any agent with network access, use the curl pattern:

### Simple POST Pattern

```bash
#!/usr/bin/env bash
# Fire whenever your agent completes a task

AGENT="${AGENT_NAME:-codex-dev}"
PROJECT="${PROJECT_NAME:-research}"
HUB_URL="${HUB_URL:-http://localhost:4000}"

curl -s -m 1 -X POST "$HUB_URL/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent\":\"$AGENT\",
    \"project\":\"$PROJECT\",
    \"event\":\"task_complete\",
    \"message\":\"Task finished\"
  }" > /dev/null 2>&1 || true
```

### Python Integration

```python
import requests
import json
from datetime import datetime

def publish_event(agent, project, event_type, tool=None, file=None, message=None):
    """Publish event to agent-bus hub."""

    hub_url = os.getenv("HUB_URL", "http://localhost:4000")

    payload = {
        "agent": agent,
        "project": project,
        "event": event_type,
        "ts": int(datetime.now().timestamp() * 1000),
    }

    if tool:
        payload["tool"] = tool
    if file:
        payload["file"] = file
    if message:
        payload["message"] = message

    try:
        requests.post(
            f"{hub_url}/events",
            json=payload,
            timeout=1,
            headers={"Content-Type": "application/json"},
        )
    except requests.RequestException:
        pass  # Fail silently


# Usage
publish_event(
    agent="codex-dev",
    project="research",
    event_type="tool_use",
    tool="Bash",
    file="train_model.py",
    message="Running training script"
)
```

### JavaScript/Node.js Integration

```javascript
async function publishEvent(agent, project, eventType, options = {}) {
  const hubUrl = process.env.HUB_URL || 'http://localhost:4000';

  const payload = {
    agent,
    project,
    event: eventType,
    ts: Date.now(),
    ...options,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    await fetch(`${hubUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    // Fail silently
  }
}

// Usage
publishEvent('nodejs-dev', 'project-x', 'tool_use', {
  tool: 'Edit',
  file: 'index.js',
  message: 'Updating server logic',
});
```

---

## Custom Integrations

Any tool that can HTTP POST can integrate. Examples:

### Cron Job
```bash
#!/usr/bin/env bash
# /usr/local/bin/agent-bus-heartbeat
# Run every 5 minutes: */5 * * * * /usr/local/bin/agent-bus-heartbeat

AGENT="cron-worker"
PROJECT="maintenance"
HUB_URL="${HUB_URL:-http://localhost:4000}"

curl -s -m 1 -X POST "$HUB_URL/events" \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"$AGENT\",\"project\":\"$PROJECT\",\"event\":\"heartbeat\"}" \
  > /dev/null 2>&1 || true
```

### Webhook from GitHub Actions
```yaml
name: Notify Agent Bus
on: workflow_run

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Publish event
        run: |
          curl -X POST ${{ secrets.HUB_URL }}/events \
            -H "Content-Type: application/json" \
            -H "CF-Access-Client-Id: ${{ secrets.CF_CLIENT_ID }}" \
            -H "CF-Access-Client-Secret: ${{ secrets.CF_CLIENT_SECRET }}" \
            -d '{
              "agent": "github-actions",
              "project": "ci-cd",
              "event": "task_complete",
              "message": "Workflow: ${{ github.workflow }} completed"
            }'
```

### Slack Bot
```python
# In your Slack bot message handler
def on_message(message):
    publish_event(
        agent="slack-bot",
        project="team-chat",
        event_type="tool_use",
        tool="Slack",
        message=f"User sent message: {message.text[:100]}"
    )
```

---

## Remote Access (Cloudflare Tunnel)

To send events from machines outside your local network:

### 1. Update HUB_URL
```bash
export HUB_URL="https://agent-bus.yourdomain.com"
```

### 2. Add CF Access Headers

**Bash:**
```bash
curl -X POST "$HUB_URL/events" \
  -H "CF-Access-Client-Id: $CF_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{...}"
```

**Python:**
```python
headers = {
    "Content-Type": "application/json",
    "CF-Access-Client-Id": os.getenv("CF_CLIENT_ID"),
    "CF-Access-Client-Secret": os.getenv("CF_CLIENT_SECRET"),
}

requests.post(f"{hub_url}/events", json=payload, headers=headers, timeout=1)
```

**JavaScript:**
```javascript
const headers = {
  'Content-Type': 'application/json',
  'CF-Access-Client-Id': process.env.CF_CLIENT_ID,
  'CF-Access-Client-Secret': process.env.CF_CLIENT_SECRET,
};

fetch(`${hubUrl}/events`, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
})
```

### 3. Store Credentials Safely

**Local development (.bashrc/.zshrc):**
```bash
export CF_CLIENT_ID="xxxx"
export CF_CLIENT_SECRET="xxxx"
```

**Production (environment file):**
```bash
# .env (gitignored)
CF_CLIENT_ID=xxxx
CF_CLIENT_SECRET=xxxx
HUB_URL=https://agent-bus.yourdomain.com
```

**Docker/Container:**
```dockerfile
ENV HUB_URL=https://agent-bus.yourdomain.com
ENV CF_CLIENT_ID=${CF_CLIENT_ID}
ENV CF_CLIENT_SECRET=${CF_CLIENT_SECRET}
```

---

## Best Practices

### 1. Fail Silently
Always set 1-second timeout and catch errors. Never block main process:

```bash
# Good
curl -s -m 1 -X POST ... > /dev/null 2>&1 || true

# Bad (blocks if hub is down)
curl -X POST ... || exit 1
```

### 2. Use Standard Agent Names
Consistent naming helps identify agents in Claw3D:
- `claude-backend`, `claude-frontend` (Claude Code)
- `gemini-api`, `gemini-ml` (Gemini CLI)
- `codegenx-dev` (Codex)
- `github-actions`, `cron-worker` (Automated)

### 3. Include File Path When Possible
Helps with visualization and debugging:

```json
{
  "agent": "claude-backend",
  "project": "tickets",
  "event": "tool_use",
  "tool": "Edit",
  "file": "src/auth.ts"
}
```

### 4. Use Descriptive Messages
Optional, but helpful for audit trails:

```json
{
  "agent": "claude-backend",
  "project": "tickets",
  "event": "tool_use",
  "tool": "Bash",
  "message": "Running integration tests before commit"
}
```

### 5. Test Locally First
Verify connectivity before deploying:

```bash
# Test local hub
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"agent":"test","project":"dev","event":"heartbeat"}'

# Watch events
tail -f data/events.jsonl
```

---

## Troubleshooting

**Event not appearing in hub?**
- Check HUB_URL is accessible: `curl http://localhost:4000/health`
- Verify JSON is valid: `echo '{"agent":"test",...}' | jq .`
- Check field lengths don't exceed 1024 chars

**Remote access failing (CF Tunnel)?**
- Verify CF credentials: `echo $CF_CLIENT_ID`
- Test connectivity: `curl https://agent-bus.yourdomain.com/health`
- Check CF Access headers are included in request

**Events not showing in Claw3D?**
- Gateway must be running: `curl http://localhost:18789` (will fail, but connects)
- Browser WebSocket connected to `:18789`, not `:4000`
- Agent name must match (case-sensitive)

---

## Examples Repository

See `examples/` directory in agent-bus for working integrations:
- `examples/gemini-cli-hook.sh` — Gemini CLI hook
- `examples/github-actions-workflow.yml` — GitHub Actions
- `examples/cron-heartbeat.sh` — Cron job
- `examples/python-sdk.py` — Python library
- `examples/nodejs-sdk.js` — Node.js library

