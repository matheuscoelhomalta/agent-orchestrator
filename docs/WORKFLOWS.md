# Run Codex and Claude Code together

Agent Orchestrator can run independent coding-agent tasks in parallel while keeping each worker's state and native session separate. Use disjoint scopes for editing tasks. For reviews, compare findings and check the evidence yourself.

## Start two independent reviews

From a repository you are authorized to inspect, create a temporary task file:

```sh
REVIEW_PROMPT=$(mktemp)
cat > "$REVIEW_PROMPT" <<'PROMPT'
Review README.md against the implementation in src/.
Do not modify files. Report concrete discrepancies with file references.
PROMPT
agent-orchestrator --json start --strict --harness codex --cwd "$PWD" \
  --prompt-file "$REVIEW_PROMPT" --criteria 'Concrete findings backed by file references' \
  --scope 'Read-only README.md and src/'
agent-orchestrator --json start --strict --harness claude --cwd "$PWD" \
  --prompt-file "$REVIEW_PROMPT" --criteria 'Concrete findings backed by file references' \
  --scope 'Read-only README.md and src/'
rm "$REVIEW_PROMPT"
```

These are two native model calls and consume your own provider quota. `--strict` limits native writes with [documented exceptions](CLI.md#permission-boundary); it does not turn the workspace read-only. Record both returned `data.id` values and their separate `data.requestId` values. Substitute the worker IDs below.

## Monitor parallel coding agents

```sh
agent-orchestrator --json status
agent-orchestrator --json wait CODEX_WORKER_ID CLAUDE_WORKER_ID --timeout 600
agent-orchestrator --json events CODEX_WORKER_ID --after 0 --limit 100
agent-orchestrator --json result CODEX_WORKER_ID
agent-orchestrator --json result CLAUDE_WORKER_ID
```

Keep waiting when `settled` is false. For subsequent event pages, pass the returned `data.nextCursor` as `--after`. Check both results even if one fails. A completed turn may still need input, contain invalid output, or require review.

When a result is `needs_review`, inspect the cited source, reproduce relevant checks, and record acceptance using that worker's current request ID:

```sh
agent-orchestrator --json accept CODEX_WORKER_ID --request CODEX_REQUEST_ID \
  --note 'Describe the specific findings and evidence you checked'
```

Do the same independently for the other worker when justified. Agreement between models does not replace verification.

## Resume an agent session

For a settled worker with a native session and an outcome that permits reply, write a scoped follow-up:

```sh
FOLLOWUP_PROMPT=$(mktemp)
cat > "$FOLLOWUP_PROMPT" <<'PROMPT'
Recheck your first finding against the relevant test.
Do not modify files. Explain whether the test supports or contradicts it.
PROMPT
agent-orchestrator --json reply WORKER_ID --prompt-file "$FOLLOWUP_PROMPT"
rm "$FOLLOWUP_PROMPT"
agent-orchestrator --json wait WORKER_ID --timeout 600
agent-orchestrator --json result WORKER_ID
```

Reply continues the original native session and returns a new request ID. Save it: earlier acceptance does not apply to the new turn. A failed native resume does not silently create a replacement session. `unknown` requires reconciliation first; `invalid_output` requires the bounded `--correction` path described in the [CLI contract](CLI.md#response-and-acceptance).

## Cancel work and account for every worker

```sh
agent-orchestrator --json cancel WORKER_ID
agent-orchestrator --json wait WORKER_ID --timeout 60
agent-orchestrator --json result WORKER_ID
```

Cancellation is a request, not proof that work stopped or side effects were undone. Keep monitoring unsettled work. Follow the [coordinator workflow](DAILY-WORKFLOW.md) for blockers, unknown outcomes, and verified acceptance.
