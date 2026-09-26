# Implementation verification — 2026-09-26

## Delivered

Installed `agent-orchestrator` on PATH with a conflict-safe wrapper. Project contains the source CLI, pinned dependency lockfile, meaningful tests, CLI contract, and a project-local explicitly invoked coordinator skill. No global skill links were installed. The user selected the minimal CLI plus skill scope.

The implementation uses four small source modules. It uses native Node facilities and ACPX's tested embedded persistent runtime. A small detached runner exists per active turn; there is no installed daemon, service port, custom adapter, or dashboard. Source and tests were built in /private/tmp and integrated into the requested project.

The shared runtime was evaluated but not selected: its controls require a running owner, normally started by prompt submission. Using the tested embedded runtime lets the CLI configure and verify model/effort/mode before dispatching actual task work. Shared runtime remains a future simplification candidate, not a requirement for this pilot.

## Verification

- Installation and `--help` / `--json doctor` were exercised from /private/tmp, outside the source directory.
- Ledger tests cover private atomic writes, contention, exclusive creation, traversal rejection, corruption, and concurrent event sequencing.
- Core tests cover task acceptance versus transport completion, explicit configuration verification, heartbeat reconciliation, and exclusion of persisted credential keys/bypass flags.
- CLI integration tests exercise actual subprocess commands and raw ACP fixture sessions: parallel workers, same-session reply, needs-input, format-correction budget, cancellation, permission rejection, failed resume, abrupt runner loss, and dispatched transport loss.
- Final `make test`: 23 passed, zero failed or skipped. [Test output](../evidence/final-test-output.txt) is archived. Final read-only process inspection found zero remaining project/staging workers or adapters.
- Skill YAML was parsed with Ruby's standard YAML parser; invocation metadata, names, lengths, and code fences were checked. Routing review: explicit cross-harness worker monitoring is a match; ordinary single-agent code review and unrelated bookmarking are nonmatches. Global discovery installation was not selected.

## Live pilot through the installed CLI

Existing Codex and Claude authentication was used; no login or credential configuration changes were made. Tasks were read-only and restricted to temporary fixture files.

| Worker | Native session | Observed result |
|---|---|---|
| Codex | 01a0dedd-4af1-7f32-b8b9-7ec639e79576 | Correctly found ignored discountPercent; progress prose made the first response invalid JSON. One same-session format correction yielded needs_review. |
| Claude | 82c3c63c-1faf-4b7b-abe8-bf5a3c0bf080 | Found missing persistent labels and vague/unassociated error markup. Coordinator rejected an unsupported colour-only claim; same-session revision removed it. |

Both tasks were dispatched concurrently. Native tool events were observed, both configurations were verified before each task prompt, original session IDs persisted across independent runner processes, and every recorded adapter launch had an exit observation.

Root independently executed the pricing fixture: a 200 subtotal with 25% discount still returned 200; expected discounted value is 150. Root inspected the form and confirmed missing explicit labels, live-region attributes, and field/error association. Exact fixture markers were checked. Only then were both revised results marked accepted with the current request IDs and specific verification notes. The fixture files were not edited by workers.

Claude quota metadata includes auxiliary Haiku usage as well as Opus 5.5 worker usage; exclusively Opus execution is not claimed. Native histories and model quota usage are normal side effects of the pilot.

## Evidence

[evidence/cli-live-pilot](../evidence/cli-live-pilot/) contains fixture files, prompts, initial/final results, accepted records, event archives, and integrity hashes. Runtime session stores and native user histories are not copied. The original research trial remains separately preserved.

## Practical limits

This is a bounded local pilot, not an unattended crash-proof service. The coordinator must perform substantive verification and follow the skill's monitoring loop; the CLI cannot force an LLM to use it correctly. Acceptance notes are audit records, not proof by themselves.

Actual native approval dialogs and denial flows remain unverified; real protocol callback rejection was tested with the ACP fixture. Denials are surfaced rather than automatically approved. ACP callback settings are not an OS sandbox for native harness tools. Grok/X support is unverified and not promised.

The model-turn timeout does not strictly bound all native initialization/load/cleanup. Stale lock files require manual inspection. Event archives are retained and rewritten on append; there is no fsync/power-loss durability guarantee. Unknown outcomes block resubmission and require explicit side-effect reconciliation. The CLI does not kill saved PIDs or approve suspended dialogs.


## Post-implementation triple review

The earlier 23-test result is the original build verification. A subsequent three-reviewer correctness pass fixed confirmed launch, recovery, permission/configuration, and CLI-contract bugs. The expanded suite passed 30 tests; the final doctor stream correction also passed its targeted check. See [triple-review report](TRIPLE-REVIEW.md) for the shared snapshot, fixes, independent rechecks, and preserved evidence.

## Subsequent adoption verification — 2026-09-26

The skill is now linked for Codex and Claude. Later native checks verified [one Claude permission denial](NATIVE-PERMISSION-CHECK.md) under temporary default mode and [Codex streamed cancellation/runner-loss recovery](NATIVE-RECOVERY-CHECK.md). The [coordinator adoption check](ADOPTION-CHECK.md) records an accepted inner review plus an outer timeout requiring explicit reconciliation. [Grok native model, session and historical X retrieval](GROK-HARNESS-CHECK.md) passed bounded checks, while its CLI mode-configuration compatibility remains unsupported. The suite still passes 30 tests after adding rejection of Grok’s always-approve bypass flag. Earlier gaps above describe the original pilot and should be read with these later scoped results.
