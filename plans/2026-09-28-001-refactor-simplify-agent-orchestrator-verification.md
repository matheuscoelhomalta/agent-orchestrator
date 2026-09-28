# Simplification plan verification — 2026-09-28

The proposed internal refactors match the project's stated intent: a small local supervisor that preserves native sessions, authorization boundaries, uncertain-outcome handling, and independent acceptance. No adapter rewrite, dependency change, automatic retry, or permission-policy change is needed.

## Findings

1. The source baseline matches `2bf1fc7`: five modules, 665 lines, three used dependencies, and no internal import cycle. Repository searches confirm the unused exports, duplicated error factories, cancel-marker construction, live-state rules, derived arguments, stream condition, and overwritten settlement fallback. The original 48-test count is correct. Remote freshness was not rechecked; the refactor depends on the inspected local checkout.
2. S3 overstates four independent state definitions: the CLI expression already derives from `activeStates`. The actual consolidation removes the worker and test literals and shares the wait/cancel predicate. The existing wait integration test does not specifically cover a live `unknown` runner, although the live-unknown cancellation test does.
3. S5's store tests do not cover every guarded error path. The conversion therefore also checks all 19 call sites mechanically, preserving their arguments and surrounding logic. One error factory removes the conflicting conventions; it cannot make a future bare `fail(...)` throw automatically.
4. S7 reduces default-config executable lookups from **three–six**, depending on installed executables, to exactly three. `doctor` still performs its separate installation checks. Its complete JSON output is byte-identical before and after the refactor on this machine.
5. Some suggested grep checks are too broad: searching for `'cancel'` necessarily also finds CLI command names and test invocations. The path-construction search is the relevant check. Likewise, whitespace-sensitive grep is insufficient for persisted-state validation, so the legacy check parses JSON instead.
6. The README broken-link observation is stale in the current working tree: concurrent documentation edits removed that link. Other deferred code observations remain outside this refactor. Existing staged documentation deletions and concurrent documentation edits are preserved.

## Conditional units resolved

- **S4 — completed after further investigation.** No `cancelling` state was found in 16 default-state records or two records under the repository's archived test state. All 18 parsed successfully; the repository-local `.state/` directory does not exist. A further check of all five source revisions in reachable local Git history found no code that ever writes this state, resolving the earlier concern about records from versions represented in that history. Using the user's delegation of routine decisions, removed the unused state from the core set and public guidance. The evidence covers known directories and local repository history, not unlisted directories or unpublished implementations.
- **S9 — completed using delegated judgment.** Replaced duplicated monitoring and per-state guidance with links to the skill's two supervision sections. Kept the workflow examples, installation/maintenance guidance, isolated-state instructions, and direct strict-mode reminder. The skill remains self-contained; all workflow links and section anchors resolve.

## Implementation and verification

Completed all nine units, S1–S9. Refactor hunks are staged without commits; unrelated documentation edits and deletions retain their existing staging. Error codes/messages, cancellation permissions, public output fields, and behavior for states produced by the application are preserved.

- Characterization assertions for thought filtering and the agy `300s` timeout passed against the original implementation before the relevant refactors.
- Syntax checks and the full 48-test Node suite passed after each source refactor unit. S8's core checks passed directly, and its full cleanup passed in subsequent suite runs. The count remains 28 CLI, nine core, and 11 store tests.
- Final `make test`, rerun after S4 and S9, passed all 48 Node tests and three installer tests. A separate `node --check src/store.mjs` covers the source file omitted by the existing check script. `git diff --check` passed.
- A temporary comparison harness extracted the actual old and new ACP consumption loops and compared their public output, response framing, event order, and write-failure accumulation across 3,280 cases. Cases included missing, blank, nonstring, repeated, and interleaved IDs; thought chunks; status/tool events; and injected event-write failures. All matched.
- Static `doctor` output matched byte for byte. Reference searches confirmed one cancel-path formula, no remaining unused exports from S1, and no unthrown/unassigned coded-error calls.

These are fixture and local-code checks; no paid native model calls or new live harness verification were performed. No deferred feature or bug fix was implemented.
