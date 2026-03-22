# Phase 4 — CLI-Anything Generation

**Priority:** P1
**Status:** Not started
**Effort:** ~1h
**Depends on:** Phase 1

## Overview

Run CLI-Anything on the agent-bus codebase to auto-generate a CLI with Skill.md, tests, and REPL. This makes agent-bus discoverable by any LLM.

## Prerequisites

- CLI-Anything installed as Claude Code plugin
- Phase 1 complete (working event hub with source code to analyze)

## Implementation Steps

1. **Install CLI-Anything**
   ```
   /plugin marketplace add HKUDS/CLI-Anything
   /plugin install cli-anything
   ```

2. **Generate CLI**
   ```
   /cli-anything:cli-anything ./
   ```
   This scans the source, generates:
   - Click CLI package under `cli_anything_agent_bus/`
   - Commands: publish, subscribe, replay, status
   - REPL with persistent state
   - Skill.md for auto-discovery
   - Tests (unit + E2E)
   - setup.py for pip install

3. **Validate generated CLI**
   ```
   /cli-anything:validate ./
   ```

4. **Refine if needed**
   ```
   /cli-anything:refine ./ "add project filtering to subscribe command"
   ```

5. **Install to PATH**
   ```
   pip install -e ./cli_anything_agent_bus
   ```

## Expected Generated Commands

```bash
cli-anything-agent-bus publish --agent dev --project tickets --event tool_use --tool Edit --json
cli-anything-agent-bus subscribe --project brainstorm --json
cli-anything-agent-bus replay --last 50 --json
cli-anything-agent-bus status --json
```

## Success Criteria

- [ ] CLI-Anything generates working CLI from source
- [ ] `cli-anything-agent-bus --help` shows all commands
- [ ] Skill.md generated and discoverable
- [ ] Generated tests pass
- [ ] Claude Code can discover and use the CLI via Skill.md

## Todo

- [ ] Install CLI-Anything plugin
- [ ] Run generation
- [ ] Validate output
- [ ] Refine if gaps found
- [ ] Install to PATH
- [ ] Test Skill.md discovery
