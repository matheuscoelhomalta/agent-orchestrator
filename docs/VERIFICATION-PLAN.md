# Verification criteria

These criteria apply to whichever implementation scope is selected. They do not select a programming language, persistence mechanism, or custom CLI architecture.

## Task contract

Every delegated task must have an objective, acceptance criteria, authorized work scope, harness identity, native session identity, and per-turn request identity. Treat a worker's claim of completion as a candidate result awaiting coordinator verification.

Separate execution state from task state. Needs-input, malformed output, rejected result, accepted result, cancelled work, failed execution, and unknown outcome must be distinguishable. Correction limits and the exact schema remain implementation decisions to document before coding.

## Direct behavior checks

1. Concurrent workers: independently monitor Codex and Claude; account for both outputs before declaring the overall task finished.
2. Malformed response: retain raw output, detect the format error, request bounded correction, preserve native context, and avoid accepting mere valid JSON as proof of correctness.
3. Missing input: transport completion with needs_input remains blocked; an authorized answer continues the same native session.
4. Cancellation: cancel an active turn and await canonical settlement; do not label work completed because an observer disconnected.
5. Restart: reconnect with the same native session ID; verify accepted model, effort, and permission settings before dispatching another prompt.
6. Failed resume: report the missing/unsupported session explicitly, with no silent fresh-session replacement.
7. Interrupted submission: an unknown outcome stays explicit until reconciled; no automatic replay that could duplicate side effects.
8. Permission request: exercise an actual adapter request/denial path, preserve native policy, and distinguish denied/escalated work from accepted task completion.
9. Observer history: handle expired cursors or missing retained records explicitly; preserve acceptance results independently if durable task accounting is in scope.
10. End-to-end terminal use: run a bounded real task through the actual command interface from outside the project directory, verifying results and reporting remaining limitations.

Use deterministic fixtures for state transitions, crashes, and failure injection, plus bounded live checks for adapter behaviors that fixtures cannot establish. A fixture test is not evidence that native permission handling works. Reuse prior live evidence only where the execution path and dependency versions are unchanged.

## Scope boundaries

Grok/X capability requires separate live verification before support is promised. No dashboard is required. Do not change credential setup, bypass native permissions, or replay uncertain tool work as a convenience. Production deployment and expanded integrations are outside the current lean pilot unless explicitly selected.
