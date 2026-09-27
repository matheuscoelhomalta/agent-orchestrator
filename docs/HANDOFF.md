# Handoff — 2026-09-26

> **Historical.** Research-stage handoff from 2026-09-26. The CLI it describes as unbuilt now exists; see the README's current documents for present behavior. Later sections are dated updates.

## Current state

The user first asked for GitHub solutions for cross-harness agent orchestration, requested deeper investigation with orchestrate-agents, asked about ACP and Herdr, and then asked for an interview to clarify motivation. The established direction is a lean harness-agnostic solution used through native terminal agents, with better monitoring and response handling.

A bounded ACPX live trial was completed with existing authenticated Codex and Claude installations. Core checks passed after correcting reconnect configuration handling. The current recommendation is ACPX plus a thin supervisor, rather than custom harness adapters. No production implementation was created.

The user's latest request was to save all relevant discussion and create a project folder under /Users/matheuscoelho/Documents/Dev/CLIs/. The folder name agent-orchestrator is provisional. This save operation does not authorize implementation or installation.

## Observed live behavior

Both agents streamed output, corrected an intentionally malformed response, preserved a context token, returned a simulated needs-input task state, continued after a fixture answer, cancelled a turn, and continued after cancellation. Both resumed concurrently in a new supervisor process using their original native session IDs and context. Recorded adapter launches had corresponding exit observations.

See ACPX-TRIAL-REPORT.md and evidence/acpx-trial for exact results and failures.

## Evidence gaps

- No actual permission dialog or denied tool flow was exercised.
- Worker questions were structured simulated fixtures.
- Prompts prohibited tools, edits, shell, browsing, configuration changes, and delegation.
- No coding/design benchmark or autonomous LLM coordinator was tested.
- Grok's ACP entry point was observed, but no live Grok task or X search was verified.
- Exact root cause of the legacy Claude mode/status mismatch is unproven.
- Dependency versions and behavior may change; preserve the trial's dated evidence and recheck before adopting newer releases.

## Suggested next work, not yet executed

1. Agree on a bounded supervisor specification and decide whether ACPX plus a skill is enough.
2. If code is justified, implement only the minimal start/status/events/result/reply/cancel workflow and verify recovery and restart behavior directly.
3. Verify real permission handling and Grok/X capabilities before promising those integrations.

## Constraints to carry forward

Keep scope lean, preserve configured permissions, avoid silent fresh-session substitution, and distinguish task acceptance from process success. Ask before material scope/approach decisions; complete settled in-scope work autonomously. User prefers tools/APIs/CLIs to browser use, no worktrees unless requested, and minimal direct verification. The mc-agents repository's catalog-specific rules should not be assumed to govern this separate project.

## Archive cautions

The saved trial script uses hardcoded temporary and native executable paths. It is an original evidence snapshot, not a runnable project entry point. Rerunning can consume model quota and create native session history. Do not execute it without deliberately preparing a new bounded trial. No credentials, native user session stores, or node_modules are included in the archive.


## Implementation update

The user subsequently selected the minimal CLI plus coordinator skill. That implementation is now present and installed as `agent-orchestrator`. The preceding research-stage statements are historical. See [CLI contract](CLI.md) and [implementation verification](IMPLEMENTATION-VERIFICATION.md) for current behavior, tests, and remaining limits. The coordinator skill remains project-local; no global agent skill links were created.

## Current adoption update — 2026-09-26

The coordinator skill is now linked for Codex and Claude with explicit invocation preserved. See [daily workflow](DAILY-WORKFLOW.md), [coordinator adoption check](ADOPTION-CHECK.md), [native permission denial](NATIVE-PERMISSION-CHECK.md), [native recovery](NATIVE-RECOVERY-CHECK.md), and [Grok harness check](GROK-HARNESS-CHECK.md). Earlier evidence gaps remain historical; current reports state the verified scope and remaining limits. Source and documentation are maintained in this local checkout; private evidence and native runtime stores are excluded from version control.


## Published-baseline follow-up — 2026-09-26

Completed independent baseline review, confirmed fixes, and targeted rechecks. Syntax checks, 37 Node tests, and 3 installer tests pass. Native Codex progress/final message framing is handled without losing the audit transcript. A coordinator independently verified and accepted Codex and Claude workers launched from the normal terminal context; nested launch inside Codex's sandbox was blocked and truthfully accounted for. Grok remains standalone until an effective native permission acknowledgement and ACPX passthrough can be verified. See [baseline review and supervision](BASELINE-REVIEW-AND-SUPERVISION.md) and the [Grok contract investigation](GROK-HARNESS-CHECK.md#permission-contract-investigation).
