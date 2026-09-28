# Agent Orchestrator — CLI for Codex and Claude Code

Run coding agents in parallel, monitor their progress, resume their sessions, and record results only after you verify them. Agent Orchestrator is a local command-line tool for coordinating native Codex and Claude Code workers, with an optional Antigravity (`agy`) integration.

Use it for independent code reviews, bounded edits, and follow-up work across agents. Each worker has a durable task record; a finished model turn becomes `needs_review`, and an explicit acceptance step records your verification. Interrupted work with uncertain side effects requires reconciliation before continuing.

It runs in your existing terminal, including Ghostty. There is no daemon, port, or dashboard. [ACPX](https://github.com/openclaw/acpx) runs the Codex and Claude ACP adapters; Antigravity uses its native headless CLI. This is an early-stage supervisor, with [documented limits](docs/CLI.md#permission-boundary).

## Install

Requires **Node.js 22.13.0+**, npm, Git, Python 3, Make, and a POSIX shell. Native Codex and Claude Code commands must be installed and authenticated for the default configuration. Native turns use your provider account and quota. See [supported environments and setup](docs/GETTING-STARTED.md).

```sh
git clone https://github.com/matheuscoelhomalta/agent-orchestrator.git
cd agent-orchestrator
npm ci --ignore-scripts --no-audit --no-fund
make install-local
export PATH="$HOME/.local/bin:$PATH"
agent-orchestrator --json doctor
agent-orchestrator --help
```

`doctor` checks installation and configuration without calling a model; it does not verify authentication. The installed wrapper points into this checkout, so keep it in place. The [getting started guide](docs/GETTING-STARTED.md) covers your first task, updates, and uninstalling. To delegate from a main agent, install the optional [coordinator skill](skills/agent-orchestrator/SKILL.md) as described in the [terminal workflow](docs/DAILY-WORKFLOW.md).

## Review a repository

Run this from a repository you are authorized to inspect. `--strict` applies native write restrictions; it does not make the workspace read-only.

```sh
TASK_PROMPT=$(mktemp)
cat > "$TASK_PROMPT" <<'PROMPT'
Review README.md for instructions that disagree with the source.
Do not modify files. Report only findings you can support with file references.
PROMPT
agent-orchestrator --json start --strict --harness codex --cwd "$PWD" \
  --prompt-file "$TASK_PROMPT" \
  --criteria 'Each finding cites the conflicting documentation and implementation' \
  --scope 'Read-only inspection of README.md and src/'
rm "$TASK_PROMPT"
```

Save `data.id` and `data.requestId` from the returned JSON. Substitute those values below:

```sh
agent-orchestrator --json wait WORKER_ID --timeout 600
agent-orchestrator --json result WORKER_ID
```

If `wait` returns `settled: false`, keep monitoring. When the result is `needs_review`, inspect the cited evidence yourself before recording acceptance:

```sh
agent-orchestrator --json accept WORKER_ID --request CURRENT_REQUEST_ID \
  --note 'Describe the specific evidence you independently checked'
```

The [parallel review and session continuation examples](docs/WORKFLOWS.md) show how to coordinate several agents without losing their task identities.

## Commands

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

Other ACP harnesses can be added through a trusted `--config` file (OpenCode has bounded live coverage). Model access depends on your native installation and account; the listed defaults are not a guarantee of availability. Grok cannot run through the CLI because its ACP interface exposes no permission-mode control.

Under default modes `--scope` is advisory; use `start --strict` for any task that edits files and read the [harness-specific permission limits](docs/CLI.md#permission-boundary). The Antigravity integration has unresolved provider-terms considerations; review [third-party software and services](THIRD-PARTY.md) before using it. Provider names describe interoperability, not affiliation or endorsement.

## Documentation

- [Getting started](docs/GETTING-STARTED.md): installation, supported environments, updates, and uninstalling.
- [Parallel agent workflows](docs/WORKFLOWS.md): run Codex and Claude Code together, monitor workers, and resume sessions.
- [CLI contract](docs/CLI.md): commands, harnesses, configuration, permissions, persistence, and limits.
- [Daily workflow](docs/DAILY-WORKFLOW.md) and [coordinator skill](skills/agent-orchestrator/SKILL.md): how a main agent delegates, monitors, and accepts work. Claude Code is the verified main agent.
- [Live test report](docs/MULTI-HARNESS-TEST-2026-09-27.md): live results across Codex, Claude, Antigravity, OpenCode, and Grok, plus coordinator pilots and routing evidence.
- [Project brief](docs/PROJECT-BRIEF.md): motivation, adoption criteria, and why ACPX.

## Development

`make test` runs syntax checks, the Node suite (ledger, core, and subprocess integration tests against ACP and agy fixtures), and the installer tests. Fixtures exercise protocol behavior without paid calls; native behavior is recorded separately in the live test report.

Runtime state lives in `~/.local/state/agent-orchestrator` (override with `--state-dir`) and can contain task data and native session details. Local evidence archives under `evidence/` are gitignored; never publish native session stores as test artifacts.

See [contribution guidance](CONTRIBUTING.md), the [security policy](SECURITY.md), and the [code of conduct](CODE_OF_CONDUCT.md). Report ordinary bugs through [GitHub issues](https://github.com/matheuscoelhomalta/agent-orchestrator/issues); report vulnerabilities privately through the security policy.
