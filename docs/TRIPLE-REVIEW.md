# Triple review — 2026-09-26

## Result

Three independent reviewers completed the same correctness review under mc-triple-review, using gpt-5.6-sol/high and identical instructions. Root verified findings, fixed confirmed bugs, and added regression coverage. All three completed targeted rechecks; the final reviewer caught a doctor error-stream regression, which root corrected and that reviewer independently rechecked successfully. No confirmed finding remains unresolved in the reviewed scope.

## Target and scope

The user invoked the skill immediately after building this CLI. This project is not a Git repository, so its 57 project files were treated as new content rather than a Git diff. Installed node_modules and generated caches were excluded. The shared snapshot and content manifest were captured before spawning reviewers. Historical evidence was included as context, not treated as production code.

No branch change, staging, commit, push, PR, external comment, global skill link, or new native model task was performed. The installed wrapper already points at this project, so fixes are available through the existing command.

## Confirmed issues and fixes

1. **High: a launched worker could be reported as failed.** Parent PID bookkeeping raced the worker's record lock and entered SPAWN_FAILED handling after actual dispatch. Root and one reviewer reproduced the failure with a widened contention window. The runner now owns PID registration; start returns the known submitted request without a post-spawn record checkpoint/read. Pre-spawn failures update only the matching starting request.
2. **High: stale resolution could remove a later request's replay block.** Resolve now requires `--request CURRENT_REQUEST_ID` and compares it under the record lock. Reconciliation notes carry that request ID, appear in reads, preserve error/note history across replies, and are cleared from the new current turn.
3. **Medium: denied permission could mask a later timeout.** A dispatched transport failure remains unknown even if a permission request was denied earlier. Regression uses a real ACP fixture permission request followed by turn timeout and verifies that reply is blocked.
4. **Medium: unknown-but-live work could not be cancelled.** Cancel now permits request-scoped cancellation markers for a still-live, unfinished unknown runner. It does not signal saved PIDs, resolve uncertainty, or resubmit work.
5. **Medium: the correction limit was bypassable.** Ordinary reply from invalid_output now requires the correction flag, and the one-attempt limit applies. Repeated generic replies cannot create an unbounded formatting loop.
6. **Medium: actual unsafe Codex mode passed validation.** The pinned adapter's agent-full-access mode is now rejected, including its startup environment selection. Existing permission bypass exclusions remain.
7. **Medium: missing model metadata could count as verification.** Undefined currentModelId no longer equals an absent optional alias for acceptance. Missing or mismatched model IDs fail closed; the explicitly configured Claude alias remains supported.
8. **Medium/low: doctor certified unusable setups and violated its error contract.** Empty configs are rejected; command executables, script files, and native overrides are checked. Failed doctor uses top-level ok=false with detailed diagnostics, nonzero exit status, stdout under --json, and stderr otherwise.

The CLI contract and coordinator instructions were updated to match these corrections. The latest result response includes prior-turn history and request-bound resolution data for auditing.

## Validation

- Original snapshot: all three reviewers verified the same 57-file content versions and each ran the original 23 tests in isolation.
- Regression evidence: root reproduced missing executable/model handling, permission-plus-timeout misclassification, unknown cancellation refusal, and launch-checkpoint failure. Initial targeted regression tests failed on the original behavior before fixes.
- Integrated project: syntax checks and all **30 tests passed**, with zero failures or skips. The final stdout/stderr microfix was then verified by the focused installed-project test and direct reviewer reproductions; no additional native calls were needed.
- Targeted rechecks: reviewers inspected root-authored changes and reported no remaining confirmed correctness bug after the final stream fix. The first two passing rechecks preceded that final stream-only adjustment; the detecting reviewer independently checked it afterward.
- Installed command: doctor succeeded from outside the source directory. Updated skill YAML/invocation metadata and recovery instructions were verified.
- Snapshot checks before fixes and at completion found no unrelated drift or newly arrived work. Root-authored source/doc/test changes were explicitly accounted for.
- Final process checks found no remaining project/test workers or adapters in the inspected paths.

Evidence is preserved in [evidence/triple-review](../evidence/triple-review/): original content snapshot and manifest, root fix diff and hashes, full-suite output, and final targeted stream-check output.

## Remaining disclosed limits

Live native approval/dialog parity and Grok/X capability are still unverified. Stale-lock manual recovery, event-log rewrite scaling, initialization/load wall-time limits, and lack of power-loss fsync guarantees remain documented pilot constraints. Those were not represented as repaired or as new correctness findings. The coordinator still must monitor workers and substantively verify task results.
