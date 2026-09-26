# Post-review native CLI live test

Date: 2026-09-26. Result: PASS for the bounded behaviors below.

Used the installed `agent-orchestrator` command with isolated temporary state and existing native authentication. No Computer Use was needed. No production code or global configuration was changed.

## Verified behaviors

1. Codex and Claude first turns overlapped: both prompts were dispatched before either first turn settled. Codex used gpt-5.6-sol/high/agent; Claude advertised the configured Opus alias with medium/auto. Native quota metadata also includes auxiliary Claude Haiku usage.
2. Codex inspected the read-only pricing fixture and reported the unused discount parameter. Independent execution returned 200 for two 100-priced units with a 25% discount, where the intended result is 150. The fixture remained byte-for-byte unchanged.
3. Claude returned the deliberately requested `needs_input` question. A fresh runner resumed the same native session with the selected answer, computed 35 + 9 = 44, and recalled violet-8427 from the previous prompt.
4. A dispatched Codex follow-up received cancellation and canonically settled with execution/task status `cancelled`. Cancellation occurred before text output was archived; this does not verify interruption midway through streamed output. A fresh runner then resumed the same native session and recalled amber-7316 from the original task.
5. Completed responses waited in `needs_review`. Independent verification preceded explicit acceptance. A stale request ID was rejected without changing the current result.
6. Events were read through pages of 30 with increasing, unique sequence numbers. Every recorded adapter launch had a corresponding exit event (Codex 9, Claude 5). Final runners were absent; both tasks ended accepted.

## Evidence

See `../evidence/cli-post-review-live-test/`: per-harness final status, result/history, paginated event exports, prompts, fixture, stale-acceptance rejection, and `checks.json`. The copied state also preserves ledger records. The question was a controlled fixture, not a naturally encountered ambiguity or native permission dialog.

## Limits and test-harness note

No Grok/X, native permission approval, crash recovery, OS sandboxing, or arbitrary adapter compatibility was tested. This paid live run supplements the previously passing fixture suite; it does not establish production readiness. No formatting correction was needed in this run.

The first cancellation assertion in the ad hoc test script expected the American spelling `canceled`; the CLI correctly returned `cancelled`. The assertion was corrected and the settled execution inspected before resuming. No implementation change was required.
