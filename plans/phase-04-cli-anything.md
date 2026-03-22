# Phase 4 — CLI-Anything Generation

**Priority:** P1
**Status:** Complete
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

- [x] CLI-Anything generates working CLI from source
- [x] `cli-anything-agent-bus --help` shows all commands
- [x] Skill.md generated and discoverable
- [x] Generated tests pass
- [x] Claude Code can discover and use the CLI via Skill.md

## Deliverables

- [x] CLI-Anything harness at cli-anything/agent-harness/
- [x] Commands: publish, subscribe, replay, status (all working)
- [x] SKILL.md for agent discovery
- [x] setup.py with pip install -e support
- [x] 16/16 Python tests passing
- [x] CLI installed as cli-anything-agent-bus
