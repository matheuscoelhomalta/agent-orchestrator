# Agent Orchestrator

A lean local CLI for delegating work to native Codex and Claude harnesses, monitoring workers, preserving session context, and recording verified task acceptance. ACPX handles native execution; a small per-turn runner and private task ledger handle supervision. Ghostty remains your terminal interface.

## Use

```sh
npm ci --ignore-scripts --no-audit --no-fund
make install-local
agent-orchestrator --json doctor
agent-orchestrator --help
```

Node 22+ and existing native harness logins are required. The installer refuses to replace a conflicting command. The CLI installer creates no skill links. The coordinator skill is separately linked into this machine’s Codex shared root (`~/.agents/skills/agent-orchestrator`) and Claude root (`~/.claude/skills/agent-orchestrator`), with both pointing to [skills/agent-orchestrator](skills/agent-orchestrator/SKILL.md). It remains explicitly invoked. See the [daily workflow](docs/DAILY-WORKFLOW.md).

```sh
agent-orchestrator --json start --harness codex --cwd /path/to/repo --prompt-file /path/to/task.txt --criteria 'Evidence proving the requested behavior' --scope 'Read-only src/auth inspection'
agent-orchestrator --json status
agent-orchestrator --json result WORKER_ID
agent-orchestrator --json accept WORKER_ID --request CURRENT_REQUEST_ID --note 'Specific independently verified checks'
```

Completion JSON becomes `needs_review`; only explicit verified acceptance marks a task accepted. Replies retain native sessions. Unknown outcomes block blind resubmission. See the [CLI contract](docs/CLI.md) for commands, configuration, permissions, persistence, and limitations.

## Project record

- [Project brief](docs/PROJECT-BRIEF.md): motivations and requirements.
- [Research](docs/RESEARCH.md): ACP, ACPX, Herdr, and alternatives.
- [Original architecture candidate](docs/ARCHITECTURE.md): pre-implementation proposal and open choices.
- [ACPX coverage audit](docs/ACPX-GAP-AUDIT.md): execution coverage and task-accounting gaps.
- [Verification criteria](docs/VERIFICATION-PLAN.md): required behavior checks.
- [Handoff](docs/HANDOFF.md): research-stage context; implementation update appended below it.
- [Original live trial report](docs/ACPX-TRIAL-REPORT.md): earlier embedded-runtime trial results and limitations.
- [Implementation verification](docs/IMPLEMENTATION-VERIFICATION.md): completed CLI and live pilot evidence.
- [Post-review live test](docs/POST-REVIEW-LIVE-TEST.md): concurrent runs, questions, cancellation and acceptance.
- [Native recovery](docs/NATIVE-RECOVERY-CHECK.md): streamed cancellation and explicit runner-loss recovery.
- [Native permission denial](docs/NATIVE-PERMISSION-CHECK.md): actual Claude Write denial and blocker handling.
- [Adoption check](docs/ADOPTION-CHECK.md): skill installation and a real coordinator-led review.
- [Grok harness check](docs/GROK-HARNESS-CHECK.md): native protocol, model and X-search findings; CLI compatibility limits.
- [Triple review](docs/TRIPLE-REVIEW.md): independent findings, confirmed fixes, and regression checks.
- [Evidence archive](evidence/acpx-trial/README.md): original artifacts and dependency versions.

`make test` runs syntax checks and meaningful ledger/CLI integration tests. Fixtures test ACP behavior; bounded native checks separately verify one Claude permission denial and Codex recovery. Grok is not included in the CLI defaults; see its harness check for the exact compatibility boundary. No dashboard or unattended crash-proof service is included.

Private runtime state and evidence archives remain local and are excluded from version control. The reports retain the bounded findings; do not publish native session stores as test artifacts.
