# Agent Orchestrator

A lean local CLI for delegating work to native Codex, Claude, and Antigravity (`agy`) harnesses, monitoring workers, preserving session context, and recording verified task acceptance. ACPX runs Codex and Claude through their ACP adapters, and Antigravity's documented `agy --print` headless mode runs agy; a small per-turn runner and a private task ledger handle supervision. There is no daemon, port, or dashboard: Ghostty (or any terminal) remains the interface.

## Install

Requires Node 22.13.0+ and existing native harness logins.

```sh
npm ci --ignore-scripts --no-audit --no-fund
make install-local
agent-orchestrator --json doctor
agent-orchestrator --help
```

`make install-local` writes a wrapper to `~/.local/bin/agent-orchestrator` and refuses to replace a conflicting command. It creates no skill links: to use the [coordinator skill](skills/agent-orchestrator/SKILL.md) from a main agent, link `skills/agent-orchestrator` into `~/.agents/skills/` (Codex) and `~/.claude/skills/` (Claude). The skill is explicitly invoked (`$agent-orchestrator`, or `/agent-orchestrator` in Claude Code). See the [daily workflow](docs/DAILY-WORKFLOW.md).

## Use

```sh
agent-orchestrator --json start --harness codex --cwd /path/to/repo --prompt-file review.txt --criteria 'Evidence proving the requested behavior' --scope 'Read-only src/auth inspection'
agent-orchestrator --json start --strict --harness claude --cwd /path/to/repo --prompt-file fix.txt --criteria 'Named check passes' --scope 'Edit src/auth only'
agent-orchestrator --json wait --timeout 600
agent-orchestrator --json result WORKER_ID
agent-orchestrator --json accept WORKER_ID --request CURRENT_REQUEST_ID --note 'Specific independently verified checks'
```

| Command | Purpose |
|---|---|
| `doctor` | Static installation and configuration checks (no model call, no authentication check) |
| `start` | Record a task and launch a worker; `--strict` applies [verified native restrictions with harness-specific limits](docs/CLI.md#permission-boundary) |
| `status [ID]` | Compact worker summaries, reconciling lost runners into `unknown` |
| `wait [ID...]` | Block until the given (or all) workers settle, up to `--timeout` seconds |
| `events ID` | Paged event log with a `nextCursor` |
| `result ID` | Full transcript, validated response, task state, acceptance, and turn history |
| `reply ID` | Continue the same native session; `--correction` spends the one formatting correction |
| `cancel ID` | Request cancellation; poll until it settles |
| `accept ID` | Record coordinator verification of the current `needs_review` result |
| `resolve ID` | Record side-effect reconciliation of an `unknown` request and settle it as failed |

Workers are prompted to return strict JSON. Completion becomes `needs_review`; only an explicit `accept` with the current request ID marks a task accepted. Replies keep the native session. Unknown outcomes block blind resubmission until resolved. The [CLI contract](docs/CLI.md) covers every flag, output format, permission boundary, and limit.

## Harnesses

| Harness | Default model / effort | Notes |
|---|---|---|
| `codex` | gpt-5.6-sol / high | Auto-review mode, verified from the adapter before each prompt |
| `claude` | claude-opus-5-5 / medium | Auto mode, verified from the adapter before each prompt |
| `agy` | gemini-3.8-flash-medium / medium | Offered only when `agy` is on PATH; runs under the user's native `toolPermission` setting |

Other ACP harnesses can be added through a trusted `--config` file (OpenCode works this way). Grok cannot run through the CLI because its ACP interface exposes no permission-mode control. Under default modes `--scope` is advisory; use `start --strict` for any task that edits files.

## Documentation

- [CLI contract](docs/CLI.md): commands, harnesses, configuration, permissions, persistence, and limits.
- [Daily workflow](docs/DAILY-WORKFLOW.md) and [coordinator skill](skills/agent-orchestrator/SKILL.md): how a main agent delegates, monitors, and accepts work. Claude Code is the verified main agent.
- [Live test report](docs/MULTI-HARNESS-TEST-2026-09-27.md): live results across Codex, Claude, Antigravity, OpenCode, and Grok, plus coordinator pilots and routing evidence.
- [Project brief](docs/PROJECT-BRIEF.md): motivation, adoption criteria, and why ACPX.

## Development

`make test` runs syntax checks, the Node suite (ledger, core, and subprocess integration tests against ACP and agy fixtures), and the installer tests. Fixtures exercise protocol behavior without paid calls; native behavior is recorded separately in the live test report.

Runtime state lives in `~/.local/state/agent-orchestrator` (override with `--state-dir`) and can contain task data and native session details. Local evidence archives under `evidence/` are gitignored; never publish native session stores as test artifacts.
