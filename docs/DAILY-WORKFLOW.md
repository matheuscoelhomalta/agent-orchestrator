# Daily workflow in Ghostty

The installed CLI needs no daemon or UI. Open a new native agent session after installing skill links so its skill catalog can refresh. The skill is explicitly invoked: ask the main agent to use `$agent-orchestrator` with an objective, authorized paths, and concrete completion criteria. In Claude Code, the skill is also available as `/agent-orchestrator`. It does not select itself automatically.

Example request: “Use agent-orchestrator to delegate a read-only correctness review to Codex and an accessibility review to Claude. Monitor both, resolve routine blockers, inspect each finding, and report only independently verified results. Do not modify files.”

For direct CLI use, create a task prompt file and keep the IDs returned by start:

```sh
agent-orchestrator --json doctor
agent-orchestrator --json start --harness codex --cwd /path/to/project --prompt-file /path/to/task.txt --criteria 'Concrete evidence proving the task is complete' --scope 'Read-only src/pricing.js'
agent-orchestrator --json status
agent-orchestrator --json events WORKER_ID --after 0 --limit 100
agent-orchestrator --json result WORKER_ID
```

Repeat status and bounded event reads while work is outstanding. Carry `nextCursor` into the next `--after`; an empty page is not completion. Heartbeats indicate a live observer, not model progress. Account for every worker before ending the overall task.

- `needs_input`: inspect the question or permission event. Answer only within existing authorization. Write a reply file and use `reply WORKER_ID --prompt-file FILE`; save the new request ID and resume monitoring. A denied permission is not approval to retry through a different tool.
- `invalid_output`: inspect the raw output. Use one `reply WORKER_ID --prompt-file FILE --correction` asking only for corrected formatting, without tools or repeated task work. Further invalid output requires a reported blocker or a newly agreed approach.
- `needs_review`: check actual files, checks, or primary sources. Then use `accept WORKER_ID --request CURRENT_REQUEST_ID --note 'Specific independently verified checks'`. Completion claims and JSON validity are insufficient.
- Cancellation: use `cancel WORKER_ID`, then poll until canonical settlement. A cancellation request alone is not a stopped task.
- `unknown`: inspect possible effects and native history; do not resubmit blindly. A live runner may receive cancellation. Resolve only after the runner is absent and effects are reconciled: `resolve WORKER_ID --request CURRENT_REQUEST_ID --note 'What was inspected and found'`. This settles as failed, not successful. A scoped reply may then continue the same native session where its store is usable.

State normally lives under `~/.local/state/agent-orchestrator`. For experiments, put `--state-dir /private/tmp/your-isolated-test-state` on every command. Prompts, outputs and native histories can contain private data; keep them local.

Both installed skill links point into this checkout. Moving or deleting it breaks those links and the installed CLI wrapper. Installation never replaces conflicting client entries. To install the same existing package on another local machine, verify the two client roots are real directories and target names are absent before linking the package; preserve any conflict.

Codex and Claude are the current CLI defaults. Grok's native harness has a separate verification report; do not work around the CLI's permission-configuration check to enable it. The system is a bounded local supervisor with coordinator verification, not an unattended crash-proof service or an OS sandbox.
