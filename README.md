# Agent Orchestrator

A lean local CLI for delegating work to native Codex, Claude, and Antigravity (`agy`) harnesses, monitoring workers, preserving session context, and recording verified task acceptance. ACPX handles Codex/Claude execution and documented `agy --print` headless mode handles Antigravity; a small per-turn runner and private task ledger handle supervision. Ghostty remains your terminal interface.

## Use

```sh
npm ci --ignore-scripts --no-audit --no-fund
make install-local
agent-orchestrator --json doctor
agent-orchestrator --help
```

Node 22.13.0+ and existing native harness logins are required. The installer refuses to replace a conflicting command. The CLI installer creates no skill links. The coordinator skill is separately linked into this machine’s Codex shared root (`~/.agents/skills/agent-orchestrator`) and Claude root (`~/.claude/skills/agent-orchestrator`), with both pointing to [skills/agent-orchestrator](skills/agent-orchestrator/SKILL.md). It remains explicitly invoked. See the [daily workflow](docs/DAILY-WORKFLOW.md).

```sh
agent-orchestrator --json start --harness codex --cwd /path/to/repo --prompt-file /path/to/task.txt --criteria 'Evidence proving the requested behavior' --scope 'Read-only src/auth inspection'
agent-orchestrator --json status
agent-orchestrator --json result WORKER_ID
agent-orchestrator --json accept WORKER_ID --request CURRENT_REQUEST_ID --note 'Specific independently verified checks'
```

Completion JSON becomes `needs_review`; only explicit verified acceptance marks a task accepted. Replies retain native sessions. Unknown outcomes block blind resubmission. See the [CLI contract](docs/CLI.md) for commands, configuration, permissions, persistence, and limitations.

## Project record

Current behavior:

- [CLI contract](docs/CLI.md): commands, harnesses (including Antigravity), permissions, persistence, and limits.
- [Daily workflow](docs/DAILY-WORKFLOW.md) and [coordinator skill](skills/agent-orchestrator/SKILL.md): how a main agent delegates and supervises.
- [Multi-harness test and coordinator pilot](docs/MULTI-HARNESS-TEST-2026-09-27.md): latest live results across Codex, Claude, Antigravity, OpenCode, and Grok.
- [Live CLI test](docs/LIVE-CLI-TEST-2026-09-27.md): same-day independent Codex/Claude/Grok check.
- [Project brief](docs/PROJECT-BRIEF.md): motivations, desired outcome, and adoption criteria.

Dated evidence and history (superseded where they conflict with the documents above):

- [Research](docs/RESEARCH.md), [original architecture candidate](docs/ARCHITECTURE.md), [ACPX coverage audit](docs/ACPX-GAP-AUDIT.md), [verification criteria](docs/VERIFICATION-PLAN.md), [handoff](docs/HANDOFF.md), and the [original live trial](docs/ACPX-TRIAL-REPORT.md): pre-implementation research and decisions.
- [Implementation verification](docs/IMPLEMENTATION-VERIFICATION.md), [post-review live test](docs/POST-REVIEW-LIVE-TEST.md), [native recovery](docs/NATIVE-RECOVERY-CHECK.md), [native permission denial](docs/NATIVE-PERMISSION-CHECK.md), [adoption check](docs/ADOPTION-CHECK.md), [Grok harness check](docs/GROK-HARNESS-CHECK.md), [published baseline and supervision](docs/BASELINE-REVIEW-AND-SUPERVISION.md), and [triple review](docs/TRIPLE-REVIEW.md): bounded checks of earlier versions.
- [Evidence archive](evidence/acpx-trial/README.md): original artifacts and dependency versions.

`make test` runs syntax checks and meaningful ledger/CLI integration tests. Fixtures test ACP and agy headless behavior without paid calls; dated native checks record live behavior separately. Grok is not included in the CLI defaults; see its harness check for the exact compatibility boundary. No dashboard or unattended crash-proof service is included.

Private runtime state and evidence archives remain local and are excluded from version control. The reports retain the bounded findings; do not publish native session stores as test artifacts.
