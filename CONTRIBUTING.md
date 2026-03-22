# Contributing to Agent Bus

Welcome! This guide explains how to contribute code, report issues, and improve the project.

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2_1/code_of_conduct/). Report violations to the project maintainers.

## How to Contribute

### Reporting Bugs
1. Check existing issues to avoid duplicates
2. Include: reproduction steps, expected vs. actual behavior, Node.js version
3. Attach relevant logs or curl output

### Suggesting Features
1. Open an issue with context — why is this needed?
2. Describe the use case and expected behavior
3. Link related issues or external references

### Submitting Code

#### Fork & Branch
```bash
git clone https://github.com/YOUR-USERNAME/agent-bus.git
cd agent-bus
git checkout -b fix/short-description
```

#### Development Setup
```bash
npm install
npm run dev              # Start hub on :4000
npm test               # Run all tests
```

#### Code Standards
- **Language:** TypeScript 5.9+, strict mode
- **Module System:** ESM
- **Files:** kebab-case.ts (e.g., `event-hub.ts`, not `eventHub.ts`)
- **Classes:** PascalCase (e.g., `EventHub`)
- **Functions:** camelCase, verb-first (e.g., `broadcastEvent()`)
- **Constants:** UPPER_SNAKE_CASE
- **File Size:** Keep files under 200 LOC — split if larger
- **Principles:** YAGNI (You Aren't Gonna Need It), KISS (Keep It Simple), DRY (Don't Repeat Yourself)

#### Testing
- **Framework:** Vitest (fast, ESM-native)
- **Location:** `tests/*.test.ts` colocated with features
- **Coverage:** Hub (38 tests), Gateway (22 tests), E2E (7 checks)
- **Requirement:** All tests must pass before PR

**Run tests:**
```bash
npm test              # All unit + integration tests
npm run test:e2e     # E2E smoke tests (start fresh hub)
```

**Test Strategy:**
- Write integration tests, not mocks (use real WebSocket, real JSONL I/O)
- Test schema validation, size limits, broadcast behavior
- Test error cases (invalid JSON, oversized payloads, missing fields)
- Test graceful shutdown and cleanup

#### Commit Convention
Use [Conventional Commits](https://www.conventionalcommits.org/):
```bash
git commit -m "feat: add new RPC method

Additional context here if needed."
```

**Prefixes:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code cleanup (no behavior change)
- `test:` — Add/improve tests
- `chore:` — Dependencies, tooling

#### PR Guidelines

**One feature per PR.** If your change touches multiple concerns, split into separate PRs.

**PR Description Template:**
```markdown
## Summary
Brief description of what changed and why.

## Type
- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor

## Changes
- List major changes
- Update to X component
- New tests for Y behavior

## Testing
- [ ] Unit tests passing
- [ ] E2E tests passing
- [ ] Tested locally with `npm run dev`

## Documentation
- [ ] Updated if API changed
- [ ] Added examples if new feature
- [ ] No breaking changes (or migration path included)
```

### Architecture Overview

**Hub** (:4000) — Core event router
- Accepts HTTP POST /events
- Broadcasts to WebSocket consumers
- Logs events to JSONL file
- ~160 LOC, single responsibility

**Gateway** (:18789) — OpenClaw protocol adapter
- Consumes hub WebSocket feed
- Implements 10 RPC methods (connect, agents.list, config.get, etc.)
- Maintains agent registry and session chat history
- ~480 LOC total (3 modules)

**Hooks** — Event producers
- Claude Code: PostToolUse + Stop hooks fire on tool use / session end
- Generic: Any tool that HTTP POSTs can publish events
- Fail silently with 1s timeout (never block main process)

**Types** — Shared schema
```typescript
interface AgentEvent {
  ts: number;            // Unix timestamp ms
  agent: string;         // Agent identifier
  project: string;       // Project namespace
  event: EventType;      // session_start | session_end | tool_use | task_complete | heartbeat
  tool?: string;         // Tool name (for tool_use)
  file?: string;         // File path (optional)
  message?: string;      // Description (optional)
}
```

### Adding New Agent Producers

To emit events from ANY coding agent (not just Claude Code):

1. **HTTP POST to hub:**
   ```bash
   curl -X POST http://localhost:4000/events \
     -H "Content-Type: application/json" \
     -d '{"agent":"gemini-dev","project":"brainstorm","event":"tool_use","tool":"Edit"}'
   ```

2. **For remote access (Cloudflare Tunnel):**
   ```bash
   curl -X POST https://agent-bus.yourdomain.com/events \
     -H "CF-Access-Client-Id: $CF_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_CLIENT_SECRET" \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```

3. **Hook Pattern (Bash/Python):**
   ```bash
   #!/usr/bin/env bash
   # Fire on tool use event
   curl -s -m 1 -X POST http://localhost:4000/events \
     -H "Content-Type: application/json" \
     -d "{\"agent\":\"$AGENT\",\"project\":\"$PROJECT\",\"event\":\"tool_use\"}" \
     > /dev/null 2>&1 || true
   ```

4. **CLI Integration:**
   ```bash
   # Use CLI-Anything to generate discoverable CLI
   cli-anything-agent-bus publish \
     --agent gemini-dev \
     --project brainstorm \
     --event tool_use \
     --tool Edit
   ```

## Review Process

1. **Automated checks:**
   - TypeScript compilation (`npm run build`)
   - All tests pass (`npm test`)
   - No conflicts with main branch

2. **Manual review:**
   - Code follows standards (naming, size, principles)
   - Changes align with architecture
   - Tests adequately cover new behavior
   - Docs updated if needed

3. **Approval & merge:**
   - At least one reviewer approval
   - All checks passing
   - Squash or rebase to main (keep history clean)

## Local Development Workflow

```bash
# Start full environment
npm run dev:all        # Hub (:4000) + Gateway (:18789) + Claw3D (:3000)

# In another terminal, publish test event
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"agent":"test","project":"dev","event":"tool_use","tool":"Edit","file":"test.ts"}'

# Watch JSONL log
tail -f data/events.jsonl

# Subscribe to events
wscat -c ws://localhost:4000

# Run tests
npm test

# Build for production
npm run build
npm start
```

## Questions?

- GitHub Issues for bugs / features
- Discussions for architecture questions
- README.md for quick start
- docs/ for detailed guides

Thank you for contributing!
