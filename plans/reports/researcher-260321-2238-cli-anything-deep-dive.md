# CLI-Anything Deep Dive: Production Readiness for Claude Code + Claw3D Integration

**Date:** 2026-03-21 | **Report ID:** researcher-260321-2238-cli-anything-deep-dive

---

## Executive Summary

CLI-Anything is a **production-ready, actively maintained framework** (v1.0+, launched March 2026) for automatically generating agent-native CLI interfaces from any software codebase. It uses a 7-phase LLM-driven pipeline to transform professional applications (GIMP, Blender, LibreOffice) into structured CLIs with JSON output, REPL mode, and comprehensive test suites. **For your Claude Code + Claw3D bridge use case, it's viable but requires careful setup around state synchronization and Claw3D-specific command bindings.**

**Production metrics:** 1,839+ passing tests across 16 major applications at 100% pass rate. Multi-platform support (Claude Code, OpenCode, OpenClaw, Codex). 5-minute end-to-end generation from codebase to installed CLI.

---

## 1. How the 7-Phase Pipeline Works

Each phase is **LLM-driven** (Claude Opus 4.6+, ideally) and produces documented artifacts:

### Phase 1: Analyze
- **Input:** Source code repository, README, API documentation
- **What it does:** Scans codebase and maps GUI actions → underlying API/function calls. Builds complete software-specific Standard Operating Procedure (SOP) document (e.g., `GIMP.md`)
- **Output:** `<software>.md` describing all mappable operations, parameter types, state models, side effects
- **Key insight:** Works best when source has clear API boundaries. Fails gracefully on closed binaries (harness quality degrades substantially with decompilation)

### Phase 2: Design
- **Input:** Phase 1 SOP document
- **What it does:** Architects command groups (logical groupings), designs state model (e.g., current project, selected objects, edit history), defines normalized input/output formats
- **Output:** `DESIGN.md` with command hierarchy, parameter schemas, state transitions
- **Key insight:** Establishes uniform --json output contract across all commands

### Phase 3: Implement
- **Input:** Phase 2 design document
- **What it does:** Generates Python Click CLI with:
  - Organized command groups (subcommands)
  - REPL mode via ReplSkin (unified interactive shell)
  - Global --json flag for all commands
  - Undo/redo support (50-level stack, state stored in JSON)
  - Session state persistence
- **Output:** `cli_<software>/` package (setup.py, main.py, commands/, models/, etc.)
- **Key technical detail:** Uses Click's `invoke_without_command=True` for REPL entry point. Bare command invocation = enter REPL mode

### Phase 4: Plan Tests
- **Input:** Phase 3 implementation + Phase 1 SOP
- **What it does:** LLM designs comprehensive test strategy covering:
  - Unit tests (synthetic data, mocked backends)
  - End-to-end tests (real files, actual software backends)
  - CLI subprocess verification (installed command behavior)
- **Output:** `TEST.md` with test plan and coverage strategy

### Phase 5: Write Tests
- **Input:** Phase 4 test plan
- **What it does:** Auto-generates pytest test suite with:
  - Fixtures for test data setup/teardown
  - Real software invocation (not mocks)
  - JSON output validation
  - State persistence checks
- **Output:** `tests/test_*.py` files, pytest configuration
- **Coverage tracking:** pytest-cov for coverage reporting

### Phase 6: Document
- **Input:** Phases 3–5 outputs
- **What it does:** Generates:
  - README.md with examples, installation, usage
  - SKILL.md (auto-discoverable metadata for LLM agents)
  - Inline docstrings
- **Output:** Updated `README.md`, `SKILL.md`, `cli_<software>/SKILL.md`
- **Agent discovery:** SKILL.md placed in package enables auto-discovery by Claude Code (~/.claude/skills/) and OpenClaw

### Phase 7: Publish
- **Input:** All previous artifacts
- **What it does:**
  - Generates setup.py with dependencies, entry points
  - Registers with PyPI or local pip install
  - Makes commands available on system PATH
  - Updates CLI-Hub registry (central marketplace at https://hkuds.github.io/CLI-Anything/hub/)
- **Output:** Installed, launchable CLI available globally

---

## 2. How to Create a Custom CLI: Step-by-Step

### Quickstart (5 minutes)

```bash
# 1. Install CLI-Anything plugin in Claude Code (if using Claude Code)
/plugin marketplace add HKUDS/CLI-Anything
/plugin install cli-anything

# 2. Point at your target codebase
/cli-anything:cli-anything ./path/to/claw3d
# or remote URL
/cli-anything:cli-anything https://github.com/your-org/claw3d.git

# 3. Pipeline runs automatically (Phases 1–7)
# Outputs: cli_claw3d/ package with setup.py, tests, SKILL.md, etc.

# 4. Install locally
pip install -e ./cli_claw3d

# 5. Use it
cli-claw3d --help
cli-claw3d render --json
```

### For Non-Claude Code Environments

**Direct CLI generator invocation** (if you clone the repo):

```bash
git clone https://github.com/HKUDS/CLI-Anything.git
cd CLI-Anything

# Install dependencies
pip install -r requirements.txt

# Run generator (requires Claude API key with Opus 4.6+)
python -m cli_anything.generator \
  --source-path ./path/to/claw3d \
  --output-dir ./cli_claw3d \
  --model claude-opus-4-6  # or claude-sonnet-4-6

# Install generated CLI
pip install -e ./cli_claw3d
```

### Prerequisites for Success

1. **Source code required:** If only compiled binaries exist, harness quality degrades (decompilation needed)
2. **API visibility:** Software must expose programmatic APIs (not just GUI-driven)
3. **Frontier LLM:** Claude Opus 4.6+ or equivalent (GPT-5.4). Weaker models produce incomplete harnesses requiring manual fixes
4. **Test infrastructure:** Generated tests need real software backend running (not mocks)

---

## 3. SKILL.md Generation & LLM Auto-Discovery

### Generation Process

**Phase 6.5** of the pipeline uses `skill_generator.py` to extract metadata from generated CLI:

```python
# Reads Click decorators from cli_<software>/commands/*.py
# Parses setup.py (version, dependencies, author)
# Reads README.md (description, examples)
# Outputs: SKILL.md with standardized structure
```

### SKILL.md Format (Markdown + YAML frontmatter)

```markdown
---
name: cli-claw3d
version: 1.0.0
description: Agent-native CLI for Claw3D visualization engine
author: VibeDev Studio
keywords: [3d-visualization, rendering, claw3d]
dependencies:
  - python: ">=3.9"
  - claw3d-sdk: ">=2.0"
requirements:
  - CLAW3D_HOME environment variable set
  - OpenClaw Gateway running (for skill auto-registration)
compatible_agents:
  - Claude Code
  - OpenClaw
  - Codex
---

# cli-claw3d Skill

## Overview
Control Claw3D programmatically through structured commands...

## Commands

### render
Render a 3D scene.

**Parameters:**
- `--project` (string, required): Path to .claw project file
- `--output` (string): Output file path
- `--json`: Return JSON response

**Example:**
```bash
cli-claw3d render --project scene.claw --output scene.png --json
```

## Usage Examples
[Interactive REPL vs scripted modes]

## State Management
[Undo/redo, current project context]

## Error Handling
[Common errors and recovery]
```

### Auto-Discovery Mechanism

**Claude Code discovery flow:**

1. At startup, Claude Code scans `~/.claude/skills/` and `.claude/skills/` directories
2. For each directory with `SKILL.md`, reads name + description only (lightweight)
3. When user task matches skill description, Claude loads full SKILL.md into context
4. Agent executes skill per instructions (including bundled commands or external invocation)

**Installed location for pip-installed CLIs:**

```
~/.local/lib/python3.x/site-packages/cli_claw3d/
├── SKILL.md           ← Auto-discovered by OpenClaw/Claude Code
├── commands/
├── models/
└── __main__.py
```

**Optional manual registration:**

```bash
# Copy SKILL.md to Claude Code skills directory
cp cli_claw3d/SKILL.md ~/.claude/skills/cli-claw3d/SKILL.md

# Or for OpenClaw
cp cli_claw3d/SKILL.md ~/.openclaw/skills/cli-claw3d/SKILL.md
openclaw skills reload
```

### Key Insight

SKILL.md is **static documentation + metadata**, not auto-generated runtime contract. It tells agents "what I can do" but doesn't enforce schema validation. Use `--help` and `--json` introspection at runtime for dynamic capability discovery.

---

## 4. REPL & ReplSkin: Persistent State Model

### Architecture

Every generated CLI operates in **dual mode:**

| Mode | Entry | Use Case | State Persistence |
|------|-------|----------|-------------------|
| **REPL (Interactive)** | Bare command: `cli-claw3d` | Agent experimenting, multi-step workflows | File-backed session state (JSON) |
| **Subcommand (Scripted)** | `cli-claw3d render --project x.claw` | Automation, pipelines, single operations | Per-invocation state only |

### REPL Implementation (ReplSkin)

**ReplSkin** is a unified interactive shell framework (all generated CLIs share it):

```python
# cli_<software>/repl_skin.py
class ReplSkin:
    def __init__(self, app_name):
        self.banner = f"Welcome to {app_name} (type 'help' for commands)"
        self.prompt = f"{app_name}> "
        self.history_file = Path.home() / f".{app_name}_history"
        self.state_file = Path.home() / f".{app_name}_session.json"

    def run(self):
        # Colored prompts, tab completion, command history
        # Loads state from state_file at startup
        # Saves state after each command
        # Supports undo (50-level stack), redo
        pass
```

### State Persistence Details

**Session state file** (`~/.cli_claw3d_session.json`):

```json
{
  "version": 1,
  "current_project": "scene.claw",
  "selected_objects": ["cube_1", "light_main"],
  "recent_renders": [
    {"path": "output_1.png", "timestamp": "2026-03-21T14:23:01Z"}
  ],
  "undo_stack": [
    {"operation": "select", "state_before": {...}, "state_after": {...}},
    ...
  ],
  "redo_stack": []
}
```

**Undo/Redo mechanics:**

- Every state-changing command (open project, select object, render) pushes `{operation, state_before, state_after}` to undo stack
- `cli-claw3d undo` pops from undo stack, pushes to redo stack, restores state_before
- Supports 50-level depth (configurable)
- Automatic cleanup on new state change (redo stack discarded)

### For Claude Code + Claw3D: Important Caveat

**Persistent session state is LOCAL to CLI invocation context.** If you spawn multiple Claude Code sessions or Claw3D instances, they won't share REPL state by default. You'll need:

1. **Shared state backend** (e.g., Redis, SQLite) OR
2. **State synchronization protocol** between CLI and Claw3D gateway OR
3. **Stateless architecture** where each CLI call is independent (safer for distributed agents)

---

## 5. Refining & Extending Generated CLIs

### `/cli-anything:refine` Command

Performs **gap analysis** between current CLI coverage and software's full capability surface, then auto-generates missing commands.

#### How It Works

```bash
# Broad refinement (analyze entire codebase)
/cli-anything:refine ./cli_claw3d

# Focused refinement (target specific area)
/cli-anything:refine ./cli_claw3d \
  --focus "3D scene composition and object hierarchy manipulation"
```

**Internally:**

1. Scans generated CLI (what commands exist)
2. Scans source code again (full API surface)
3. Runs gap analysis: "Which APIs aren't wrapped by CLI commands?"
4. Generates missing command implementations + tests + documentation
5. Integrates into existing package

**Iterative usage:** Run `/refine` multiple times to incrementally expand coverage.

#### Custom Extensions (Manual Edits)

Generated CLI is a standard Python package. You can manually add commands:

```python
# cli_claw3d/commands/custom.py
import click
from ..models import Project

@click.command()
@click.option('--project', type=click.Path(), required=True)
@click.option('--json', is_flag=True)
def export_fbx(project, json):
    """Export project as FBX for external tools."""
    p = Project.load(project)
    output = p.export_fbx()
    if json:
        click.echo(output.to_json())
    else:
        click.echo(f"Exported to {output}")

# Register in cli_claw3d/__main__.py
@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    ...
    cli.add_command(export_fbx, 'export-fbx')
```

**Then reinstall:**

```bash
pip install -e ./cli_claw3d
```

---

## 6. OpenClaw Integration

### How It Works

Each generated CLI package ships with **built-in OpenClaw support**:

```
cli_claw3d/
├── SKILL.md                    ← For OpenClaw discovery
├── opencode-commands/
│   └── SKILL.md               ← OpenCode-specific variant
├── openclaw-skill/
│   └── SKILL.md               ← OpenClaw-specific variant
└── setup.py                   ← Declares entry points
```

### Installation for OpenClaw

```bash
# 1. Install generated CLI
pip install -e ./cli_claw3d

# 2. Register skill with OpenClaw
openclaw skills register \
  --name "cli-claw3d" \
  --path ~/.local/lib/python3.x/site-packages/cli_claw3d/openclaw-skill/SKILL.md

# 3. Reload OpenClaw skills
openclaw skills reload

# 4. Verify
openclaw skills list | grep cli-claw3d
```

### Alternative: Manual SKILL.md Copy

```bash
mkdir -p ~/.openclaw/skills/cli-claw3d
cp cli_claw3d/SKILL.md ~/.openclaw/skills/cli-claw3d/

# Optionally copy binaries for direct invocation
cp cli_claw3d/__main__.py ~/.openclaw/skills/cli-claw3d/cli
chmod +x ~/.openclaw/skills/cli-claw3d/cli
```

### Key Integration Point

OpenClaw Gateway (running on localhost:18789 in your setup) is **event-agnostic**. It routes heartbeats and commands but doesn't care about CLI internals. The SKILL.md tells OpenClaw agents "use `openclaw skills invoke cli-claw3d -- <args>`" or direct CLI invocation, depending on your architecture.

---

## 7. Test Generation & Coverage

### Auto-Generated Test Suite

Phase 5 produces `tests/` directory with:

#### Unit Tests (Synthetic Data)

```python
# tests/test_cli_basic.py
import pytest
from cli_claw3d.models import Project
from cli_claw3d.commands import render

def test_render_with_synthetic_data(tmp_path):
    """Test render command with minimal synthetic project."""
    project = Project.create_minimal(tmp_path / "test.claw")
    result = render(project=str(project.path), output=str(tmp_path / "out.png"))
    assert result.success
    assert (tmp_path / "out.png").exists()
```

#### End-to-End Tests (Real Software)

```python
# tests/test_cli_e2e.py
import subprocess
import json

def test_cli_render_e2e(claw3d_fixture):
    """Test actual installed CLI command."""
    result = subprocess.run([
        "cli-claw3d", "render",
        "--project", str(claw3d_fixture.project_path),
        "--output", "/tmp/test.png",
        "--json"
    ], capture_output=True, text=True)

    assert result.returncode == 0
    output = json.loads(result.stdout)
    assert output["success"] == True
    assert Path("/tmp/test.png").exists()
```

#### CLI Subprocess Tests

```python
# tests/test_cli_subprocess.py
def test_cli_help():
    """Verify --help works."""
    result = subprocess.run(["cli-claw3d", "--help"], capture_output=True, text=True)
    assert result.returncode == 0
    assert "Usage:" in result.stdout

def test_cli_json_output():
    """Verify --json flag produces valid JSON."""
    result = subprocess.run([
        "cli-claw3d", "list-projects", "--json"
    ], capture_output=True, text=True)
    assert result.returncode == 0
    json.loads(result.stdout)  # Will raise if invalid JSON
```

### Coverage Measurement

Uses **pytest-cov**:

```bash
# Run tests with coverage report
pytest --cov=cli_claw3d tests/

# Generate HTML report
pytest --cov=cli_claw3d --cov-report=html tests/
# View in browser: htmlcov/index.html
```

### Reported Metrics

- **1,839+ passing tests** across 16 applications
- **100% pass rate** (1,625 unit + 214 E2E tests typical split)
- **Real software backend validation** (not mocks)
- **Typical coverage:** 85–95% depending on GUI complexity

### Gap: What Doesn't Get Tested

1. **Interactive REPL workflows** — harder to test automatically (type commands, examine history)
2. **GUI-only features** — if not mappable to API, won't exist in CLI
3. **Real-time/streaming operations** — edge case in generated suites
4. **Performance at scale** — unit tests don't stress-test large datasets

---

## 8. Limitations & Gotchas: Production Reality Check

### Hard Limitations

1. **Requires frontier-class LLM** — Claude Opus 4.6 or GPT-5.4 minimum. Smaller models (Sonnet, GPT-4) produce incomplete, error-prone harnesses requiring extensive manual fixing.

2. **Source code must be available** — Compiled binaries only = harness quality degrades substantially (decompilation required, unreliable). Best case: well-documented APIs in source.

3. **Single-phase immutability** — Once a phase completes, re-running just that phase doesn't cascade to downstream phases. You must re-run full pipeline or use `/refine` for incremental expansion.

4. **GUI-only features get lost** — If a feature exists only in the GUI (no API backing), it won't appear in CLI. E.g., "click to select" → no CLI equivalent unless API exists.

### Technical Gotchas

| Gotcha | Manifestation | Mitigation |
|--------|--------------|-----------|
| **Export exit code unreliable** | Software exits 0 but output file corrupted | Always validate output file (size, magic bytes, format) in CLI command |
| **Silent effect loss** | GUI applies effects at render time; naive export drops them | Use native renderer → filter translation → actual render script |
| **Format translation bugs** | Mapping effects between formats (MLT → ffmpeg) loses filters | Test each format combo with real software; maintain test matrix |
| **Floating-point precision** | Non-integer frame rates (29.97fps) cause cumulative rounding errors | Use `round()` not `int()`; integer arithmetic for display; ±1 frame tolerance in tests |
| **JSON output incomplete** | `--json` flag exists but doesn't cover all state changes | Verify schema in generated tests; may need manual extension |
| **Undo/redo doesn't persist across sessions** | Closing REPL loses undo stack | Document that session state is ephemeral; persist critical state explicitly |
| **Circular dependencies in state** | Undo/redo serialization fails if objects reference each other | Design state model to avoid cycles (use IDs instead of direct refs) |

### Scalability Notes

- **Single CLI instance:** Handles 100+ commands without issue
- **Concurrent agents:** ReplSkin session state is file-based, non-atomic. If 2 agents edit `~/.cli_claw3d_session.json` simultaneously, race condition possible. **Solution:** Use separate session files per agent or shared-state service (Redis)
- **Large codebases:** Phase 1 (Analyze) may timeout on 100k+ LOC repositories. **Solution:** Provide summary docs, stub implementation, or split into subdomains.

### OpenClaw-Specific Gotchas

1. **SKILL.md path discovery** — If skill installed via pip but OpenClaw hasn't reloaded, old version persists. Always run `openclaw skills reload` after install.

2. **Stateless by default** — OpenClaw heartbeats are stateless (Paperclip doesn't preserve CLI session). Each heartbeat invocation starts fresh REPL. **Solution:** Persist critical state to Redis/SQLite outside CLI.

3. **Error handling opacity** — If CLI command fails silently, OpenClaw gateway might not catch it. **Solution:** Always check exit codes in heartbeat-runner.sh; use `--json` for structured errors.

---

## 9. Sandbox & Development Environment Setup

### Local Testing (Recommended)

```bash
# 1. Clone CLI-Anything repo
git clone https://github.com/HKUDS/CLI-Anything.git
cd CLI-Anything

# 2. Create isolated venv
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set API key for LLM calls
export ANTHROPIC_API_KEY="sk-..."  # Claude Opus 4.6+ access required

# 5. Run generator on test codebase
python -m cli_anything.generator \
  --source-path ./path/to/test/app \
  --output-dir ./test_cli_output \
  --model claude-opus-4-6 \
  --verbose

# 6. Install generated CLI locally (editable mode)
pip install -e ./test_cli_output

# 7. Run tests
cd test_cli_output
pytest tests/ -v --cov=cli_test_app

# 8. Verify CLI works
cli-test-app --help
cli-test-app --version
cli-test-app <command> --json
```

### For Claw3D Specifically

```bash
# 1. Point generator at Claw3D repo
# Assuming Claw3D source is available at /Users/evtmini/Projects/claw3d

/cli-anything:cli-anything \
  /Users/evtmini/Projects/claw3d \
  --output /tmp/cli_claw3d_gen \
  --model claude-opus-4-6

# 2. Test the generated CLI
cd /tmp/cli_claw3d_gen
pip install -e .

# 3. Verify Claw3D backend is running (localhost:3000)
curl http://localhost:3000/api/health

# 4. Run CLI commands
cli-claw3d list-projects --json
cli-claw3d render --project example.claw --output /tmp/test.png --json

# 5. Verify OpenClaw skill registration
openclaw skills list | grep cli-claw3d
```

### CI/CD Integration

Use GitHub Actions or local CI to:

```yaml
# .github/workflows/cli-generation.yml
name: Generate & Test CLI
on: push

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install -r requirements.txt
      - run: |
          export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
          python -m cli_anything.generator \
            --source-path . \
            --output-dir ./generated_cli
      - run: |
          pip install -e ./generated_cli
          pytest ./generated_cli/tests/
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-report
          path: ./generated_cli/test-results/
```

---

## 10. Contributing: Submitting to CLI-Hub Registry

### Step 1: Generate CLI for Target Software

Follow Section 2 (Create Custom CLI) to produce a fully tested, documented CLI package.

### Step 2: Prepare Submission

Ensure your generated CLI includes:

```
cli_<software>/
├── setup.py              ← Correct version, dependencies, author info
├── README.md             ← Comprehensive usage examples
├── SKILL.md              ← Agent-discoverable metadata
├── HARNESS.md            ← (optional) Document custom logic
├── CONTRIBUTING.md       ← (optional) How to extend further
├── tests/                ← 100% passing test suite
└── cli_<software>/
    ├── __init__.py
    ├── __main__.py       ← Entry point
    ├── commands/         ← Organized command modules
    ├── models/           ← Data models
    ├── repl_skin.py      ← REPL interface
    └── utils/            ← Helper functions
```

### Step 3: Update CLI-Hub Registry

**registry.json** (central marketplace at `HKUDS/CLI-Anything/registry.json`):

```json
{
  "clis": [
    {
      "name": "cli-claw3d",
      "version": "1.0.0",
      "description": "Agent-native CLI for Claw3D visualization",
      "author": "VibeDev Studio",
      "repository": "https://github.com/vibedev/cli-claw3d",
      "package_name": "cli-claw3d",
      "python_version": ">=3.9",
      "dependencies": ["claw3d-sdk>=2.0"],
      "skill_url": "https://raw.githubusercontent.com/vibedev/cli-claw3d/main/SKILL.md",
      "compatible_agents": ["Claude Code", "OpenClaw", "Codex"],
      "test_coverage": 92,
      "last_updated": "2026-03-21"
    }
  ]
}
```

### Step 4: Submit PR to HKUDS/CLI-Anything

```bash
# Fork https://github.com/HKUDS/CLI-Anything
# Clone your fork
git clone https://github.com/YOUR-ORG/CLI-Anything.git
cd CLI-Anything

# Add your entry to registry.json
# Commit and push
git add registry.json
git commit -m "feat: add cli-claw3d to registry"
git push origin main

# Create PR on GitHub
# Title: "Add cli-claw3d to registry"
# Description: Include link to repo, test results, motivation
```

### Step 5: Merge & Automatic Publishing

Once PR is merged:

1. **CLI-Hub updates automatically** (registry.json is the source of truth)
2. **PyPI publishing (optional):** If your package is on PyPI, users can `pip install cli-claw3d`
3. **Marketplace discovery:** CLI appears on https://hkuds.github.io/CLI-Anything/hub/ within hours

### PR Checklist

```markdown
- [ ] CLI generates with zero errors
- [ ] All tests pass (100%)
- [ ] README has examples and troubleshooting
- [ ] SKILL.md is complete and discovery-ready
- [ ] registry.json entry added with correct schema
- [ ] GitHub repo is public and has LICENSE
- [ ] Link to test run logs or GitHub Actions proof
- [ ] No breaking changes to upstream CLI-Anything
```

---

## Key Implementation Questions Unresolved

1. **State synchronization across multiple Claude Code sessions:** If two Claude Code instances try to manipulate Claw3D simultaneously via cli-claw3d, session state files will race. Need explicit design for distributed state.

2. **Claw3D API surface clarity:** Need to validate that Claw3D source exposes all rendering/composition APIs (not just GUI). If significant functionality is GUI-only, CLI coverage will be partial.

3. **REPL vs headless operation:** For OpenClaw integration, will you run agents in REPL mode (interactive with undo/redo history) or headless (stateless, each command independent)? REPL adds complexity but more powerful workflows.

4. **Performance expectations:** Unknown how large Claw3D projects might be. If state serialization (undo/redo) becomes a bottleneck, need optimization (e.g., delta-based snapshots instead of full state copies).

5. **Test infrastructure for 3D rendering:** Real software backend tests require Claw3D running. Need headless rendering support (no GUI, just backend) or CI/CD with display server (Xvfb).

---

## Summary Table: Suitability for Claude Code + Claw3D

| Dimension | Assessment | Notes |
|-----------|------------|-------|
| **Production Readiness** | ✅ Yes | 1,839+ tests, active maintenance, v1.0+ released |
| **Claw3D Integration** | ✅ Likely | If API-rich source available; needs validation |
| **Claude Code Native** | ✅ Yes | Auto-discovers skills, SKILL.md support built-in |
| **OpenClaw Support** | ✅ Yes | SKILL.md registration, heartbeat-compatible |
| **State Management** | ⚠️ Partial | File-based REPL state, not distributed by default |
| **Distributed Agents** | ⚠️ Requires Design | Needs shared-state backend (Redis) for multi-session sync |
| **Extensibility** | ✅ Yes | `/refine` command, manual code edits, full Python package |
| **Test Coverage** | ✅ High | 85–95% typical, real software validation |
| **Limitations** | ⚠️ Documented | LLM model dependency, source code required, some GUI features unreachable |

---

## Recommended Next Steps

1. **Validate Claw3D API surface** — Audit whether Claw3D source exposes all rendering/project operations via programmable APIs (not just GUI). If >80% API-mappable, proceed to Phase 2.

2. **POC generation** — Run CLI-Anything on Claw3D with conservative scope (e.g., project load, object selection, basic render). Target 1–2 core commands. Takes ~1 hour.

3. **State design decision** — Choose: REPL mode (stateful, complex) or headless (stateless, simple). Impacts architecture significantly.

4. **Distributed state** — If multi-agent orchestration needed, prototype Redis backend for session state (undo/redo, current project context).

5. **Test infrastructure** — Set up headless Claw3D rendering in CI/CD (Xvfb or native headless mode).

---

## Sources

- [GitHub - HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything)
- [CLI-Anything Official Site](https://clianything.org/)
- [CLI Anything API Documentation](https://www.aitoolnet.com/clianything)
- [How to Use CLI-Anything (APIdog Blog)](https://apidog.com/blog/how-to-use-cli-anything/)
- [SKILL.md Format Standard](https://www.mintlify.com/blog/skill-md)
- [awesome-llm-skills Repository](https://github.com/Prat011/awesome-llm-skills)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/cli/skills)
- [Click REPL Framework](https://github.com/click-contrib/click-repl)
- [pytest-cov Documentation](https://pytest-cov.readthedocs.io/)
- [CLI-Anything Hub Registry](https://hkuds.github.io/CLI-Anything/hub/)
