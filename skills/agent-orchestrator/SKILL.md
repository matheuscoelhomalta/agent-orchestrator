---
name: agent-orchestrator
description: "Coordinates delegated native harness tasks through the agent-orchestrator CLI. Use to start workers, monitor progress, answer blockers, correct malformed responses, and verify task results across harnesses."
disable-model-invocation: true
---

# Agent Orchestrator

Use the installed `agent-orchestrator` command. Start with `command -v agent-orchestrator` and `agent-orchestrator --json doctor`. Doctor checks installation, not authentication; workers use existing native harness logins. Read `--help` when flags are unclear.

## Delegate

Workers must be launched from an execution context that can access existing native harness state and logins. A nested launch inside a main agent's sandbox can fail even when terminal authentication works. In that case, report the launch blocker and monitor workers explicitly started from the normal terminal context; do not broaden permissions or automatically replay uncertain work.

Define each worker's objective, authorized scope, and concrete acceptance criteria. Start only independent tasks that materially benefit from delegation. Write the prompt to a file and run:

```sh
agent-orchestrator --json start --harness codex --cwd /path/to/repo --prompt-file /path/to/task.txt --criteria 'Describe evidence that proves completion' --scope 'Read-only inspection of src/auth'
agent-orchestrator --json start --strict --harness claude --cwd /path/to/repo --prompt-file /path/to/fix.txt --criteria 'Named check passes' --scope 'Edit src/auth only'
```

Set worker timeouts that fit the overall task budget, leaving time for native startup, review, and settlement. Keep worker verification within the assigned files and acceptance criteria; unrelated concurrent artifacts are not a reason to broaden the task.

Route by strength, then verify everything. Provisional guidance from the 2026-09-27/28 pilots (five repositories; still a small sample):

- Code correctness review: run Codex and Claude in parallel on anything important. In two of three pilot repositories each found confirmed bugs the other missed (overlap under half); in the third only Codex's finding was confirmed. Claude finished first every time; Codex traced longer cross-module paths.
- Claims that depend on external API formats or live behavior: verify against the real system before acting, whoever reported them.
- Documentation accuracy and sourced research: Claude. It separated verified from inferred claims most reliably.
- Antigravity (`agy`): an independent extra opinion or Google-specific work. Do not accept its claims about tool or CLI behavior without evidence; in the pilot most such claims were contradicted.
- Simple scoped edits: any harness.
- X/Twitter search: unavailable through this CLI (Grok is not supported).

`--scope` alone is advisory. Start every worker whose task edits files with `--strict`, which blocks writes outside `--cwd` using verified native settings (Claude will stop more often for shell approval). Read-only reviews may use the defaults. If `--strict` is rejected for a harness, use Codex or Claude for that editing task.

Save every returned worker ID and request ID. Prevent concurrent writers from owning the same files. Codex and Claude are included, plus Antigravity (`agy`) when installed; agy runs under its native permission setting, which may auto-approve every tool, so verify its scope yourself; custom harness entries require trusted argv configuration and verified capability support. Do not promise Grok/X support through this CLI.

## Monitor all workers

Run `agent-orchestrator --json status` after dispatch and whenever returning from independent work. To block until workers settle, use `agent-orchestrator --json wait ID... --timeout 600`; `settled: false` means some are still running. Repeat bounded wait, status, and event checks while any worker remains `starting`, `running`, or `cancelling`; do not end supervision after a single check. Inspect every active worker with bounded event pages, preserving `nextCursor` for the next read:

```sh
agent-orchestrator --json events WORKER_ID --after 0 --limit 100
agent-orchestrator --json result WORKER_ID
```

`starting` or `running` means outstanding work. Silence is not proof of failure. `needs_input` is a blocker even when execution says completed. Answer routine questions within settled authorization; bring material decisions or missing authorization to the user. For a reply, write the answer to a prompt file and use `reply WORKER_ID --prompt-file FILE`.

`invalid_output` retains the raw result. One format correction can be requested with `reply WORKER_ID --prompt-file FILE --correction`; request only corrected output, not repeated task execution. Ordinary reply cannot bypass the correction flag or budget from invalid_output. Do not continue an unbounded correction loop. Subsequent problems must be reported or addressed through an explicit change in approach.

Cancellation is a request, not settlement: use `cancel WORKER_ID`, then poll until it settles. A worker stopped mid-turn or with an expired heartbeat becomes `unknown`. A still-live unknown runner can receive cancellation through `cancel`. Never retry uncertain work automatically. Inspect native history and possible side effects; `resolve WORKER_ID --request CURRENT_REQUEST_ID --note TEXT` records reconciliation only after the runner is gone. It does not prove the original task succeeded.

## Accept only verified results

`needs_review` means the worker returned structurally valid completion JSON. Check the actual artifacts or substantive evidence against the acceptance criteria. Do not accept based on formatting, worker claims, or a passing build that does not exercise the requested behavior.

After direct verification, run `accept WORKER_ID --request CURRENT_REQUEST_ID --note 'Specific checks and their result'`. Rejected results require a scoped corrective follow-up or a reported blocker. A reply starts a new request and invalidates prior acceptance. Save the new request ID returned by every reply or format correction, resume monitoring, and verify and accept only that current request.

Before reporting the overall task complete, account for every dispatched worker: accepted, cancelled, failed, blocked, or unresolved. Report material gaps explicitly. Workers retain native Auto/Auto-review settings; the client denies permission requests it cannot authorize. Never broaden permissions, silently replace a missing native session, or bypass a denial to finish a task.
