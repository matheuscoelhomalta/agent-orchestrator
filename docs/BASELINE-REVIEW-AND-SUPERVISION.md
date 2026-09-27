# Published baseline review and supervision pilot

2026-09-26. Three independent reviewers examined published baseline `39d394a1df06c017c59644933917bf0c94eec606`, then rechecked root-authored fixes. All confirmed findings were fixed. The terminal-launch supervision pilot passed; nested startup inside a native Codex sandbox was blocked and is not a supported launch path proven by this test.

## Review and fixes

The reviewers used identical read-only instructions, gpt-5.6-sol/high, and one frozen 32-file baseline. Root verified findings before editing. Fixes and a new installer regression file were captured in a 33-file snapshot; a separately frozen adjustment covered real filesystem entrypoint paths and restoring dependency engine metadata. All three reviewers completed targeted rechecks without remaining confirmed bugs.

1. Runner ledger writes now wait up to two seconds for transient contention. A real fixture turn held the ledger lock across a heartbeat and cancellation request; cancellation then settled correctly with both request and settlement events. Locks are never deleted to acquire ownership. Stale locks and longer contention remain explicit failures.
2. Existing state directories with group/other permissions, or non-directory paths, are rejected without changing their permissions. Missing directories are created privately. A shared 0755 directory remains unchanged after rejection.
3. The installer verifies the selected Node executable and requires 22.13.0+, matching pinned ACPX. Doctor and root package metadata use the same minimum. Invalid executables, unsupported versions, and conflicting commands are covered by installer tests.
4. Doctor checks every supplied native executable override; a valid Codex override cannot conceal a missing Claude override.
5. Explicit empty or whitespace-only objectives fail before creating a worker. Omitting the objective still uses the prompt.
6. CLI and runner entrypoint checks use real filesystem paths converted with `pathToFileURL`. A complete fixture turn succeeds from a checkout whose path contains `#` and `?`, including macOS filesystem aliases.

An empty evidence array remains structurally valid under the established response schema. It still produces `needs_review`, never automatic acceptance. Stricter semantic requirements belong to the task criteria and independent verification; changing this schema was not a confirmed compatibility-preserving fix.

## Native response framing

A separate native Codex probe emitted progress and final completion as two identified messages. Concatenating both was invalid JSON; its final message was valid completion JSON. The worker now retains the full non-thought transcript while validating the final producer message for Codex when all message IDs are present and non-interleaved. Missing, blank, or interleaved IDs fall back to validating the whole stream. Same-message prose remains invalid. No arbitrary JSON extraction or permission-check exemption was introduced.

Fixture cases cover split final chunks, progress preservation, absent and interleaved IDs, malformed final text, and history after reply. The live coordinator below also produced progress plus a separately framed final answer, requiring no format correction. Producer IDs are framing hints, not authenticity or permission evidence.

## Two launch contexts tested

**Nested launch: blocked.** A native Codex coordinator started exactly two CLI workers in isolated state and monitored both. The nested Codex process failed before dispatch because it could not initialize its native SQLite state; Claude reported AUTH_REQUIRED after dispatch. The inherited sandbox is the likely cause, corroborated by the subsequent normal-terminal run, but no permission tracing established every authentication mechanism. The coordinator truthfully returned failure and accepted neither result. Root reviewed the uncertain Claude outcome: no observed text or tool calls, unchanged scoped project files, and exited owned processes. It recorded explicit resolution; no task success or automatic replay was claimed.

**Normal terminal launch followed by native supervision: passed.** Root launched two fresh, explicitly scoped workers from the normal terminal context. A native Codex coordinator then monitored and verified them:

- Codex reviewed only `src/worker.mjs` and `src/store.mjs`, explaining framing fallback and bounded lock acquisition with source evidence.
- Claude reviewed only `docs/CLI.md` and the coordinator skill, assessing repeated monitoring and substantive acceptance requirements.
- The coordinator read both results, directly inspected the assigned files, and accepted each original current request with specific verification notes. It used repeated bounded status/events checks and preserved event cursors through settlement.
- Both worker executions completed. No reply, formatting correction, cancellation, or retry was required. Root independently checked the ledger, substantive claims, unchanged scoped file hashes, and final coordinator JSON before accepting the coordinator.
- All six tasks across the two attempts were accounted for. No recorded runner or adapter remained alive at the final check. Private native histories remain outside tracked artifacts.

This proves monitoring and acceptance of terminal-launched native tasks in this environment. It does not prove nested startup inside a sandbox, unattended supervision, universal harness login access, automatic semantic verification, or enforcement of read-only scope by an OS sandbox. Native permissions and client-side denials remain unchanged.

## Verification and adoption boundary

`make test` passed syntax checks, 37 Node tests, and 3 Python installer tests. All three independent rechecks reported no remaining confirmed bug. The installed command's static doctor passed. Native checks supplement fixture tests; they do not replace source verification.

For a pilot, start workers from a terminal context that can access existing native harness logins, then have the main agent monitor their IDs using the CLI. A main agent may launch directly only when its execution context has the necessary access; do not respond to a blocked launch by broadening permissions or blindly replaying uncertain work. The CLI remains a lean supervisor with no daemon or external control bridge.

Grok's native model/session/X-search checks remain valid, but CLI admission is still unsupported. See [Grok harness check](GROK-HARNESS-CHECK.md) for the verified permission-contract blocker. No speculative Grok adapter was added.

Local snapshots, protocol checks, and pilot summaries are under ignored `evidence/supervision-improvement/` or private temporary state. Only derived reports, source, and regression tests are intended for publication.
