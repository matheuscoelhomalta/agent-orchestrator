# Multi-harness test and coordinator pilot — 2026-09-27

Codex and Claude passed every exercised workflow. Antigravity (`agy`) was added as a harness through its documented headless CLI and passed the same workflows after fixes. OpenCode works through a custom config. Grok and the legacy Gemini CLI cannot run through the CLI. A coordinator pilot on this repository produced verified review findings that were fixed before commit.

All runs used isolated state and throwaway fixture repositories unless noted. Every result was checked directly (diffs, rerun checks, file contents), not taken from worker claims.

## Harness results

| Scenario | Codex (gpt-5.6-sol) | Claude (opus-5.5) | agy (gemini-3.8-flash-medium) | OpenCode (custom config) |
|---|---|---|---|---|
| Read-only review → accept | Passed | Passed | Passed | — |
| File edit, independently verified | Passed | Passed | Passed | Passed |
| needs_input → reply → completion | Passed | Passed | Passed | — |
| Context recall on reply | Passed | Passed | Passed | — |
| Cancel mid-turn | Passed (~1 s) | Passed (~2 s) | Passed (<1 s) | — |
| invalid_output → one correction | Passed | Passed | Passed | Passed |
| Timeout | Passed | — | Passed after fix | — |
| Refused action → needs_input | — | — | Passed (request-review) | — |

Usage metadata confirmed `gpt-5.6-sol` and `claude-opus-5-5` (plus Claude Code's Haiku auxiliary calls). agy does not report its model, so it is recorded as requested. Guards held for stale acceptance, reply while active, reply to invalid_output without `--correction`, a second correction, and reply before resolving an unknown request.

## Findings

1. **Scope is advisory under default native modes.** Asked to write outside the working directory, Codex (Auto-review), Claude (auto), and OpenCode (build) all did so without a permission callback reaching the CLI. Codex's own Guardian Review approved a write to the home directory. The prompts requested these writes, so this shows the supervisor is not in the loop, not that workers break scope unprompted. Test files were removed.
2. **agy permissions follow the native setting.** agy has no ACP mode or per-run permission override; `--mode accept-edits` did not change `toolPermission`. By explicit user choice the CLI records but does not enforce the reported mode. Under `request-review`, agy often tried shell commands (verification or scripted output), and three turns stopped at needs_input because such a command was refused. The user's setting was restored to `always-proceed` afterwards (it had been removed by an unknown actor during the session).
3. **agy hides its own timeout.** On `--print-timeout` it exits 0 with `status: "SUCCESS"`, a partial response, and only a stderr notice; the CLI now classifies this as TIMEOUT.
4. **Clear failures no longer need manual resolution.** By user decision, a dispatched turn that fails with no tool call or permission request settles as failed. Live Codex and agy timeouts confirmed this; any tool activity keeps the outcome unknown.
5. **OpenCode** works via a custom config with `opencode-go/deepseek-v4.1-flash`; its advertised default `opencode/deepseek-v4.1-flash` was unavailable. A suspected harness-naming problem did not reproduce through the CLI.
6. **Grok 1.0.41** advertises no `mode` config option, so start fails before dispatch. **Gemini CLI 0.32.1** is rejected at login (`IneligibleTierError`); the Google harness is now agy.

## Antigravity integration decision

Google's `agy_acp_server` connector (published by Google LLC in the ACP registry) was not used. Antigravity's terms (§6) prohibit third-party tools accessing the service; an unofficial forum reply describes spawning the unmodified CLI with documented structured flags for single-user workflows as permitted. The adapter therefore spawns `agy --print ... --output-format stream-json` without a shell and never touches Antigravity OAuth tokens. This is a risk reduction, not legal certainty.

## Coordinator pilot

Following the coordinator skill, a Claude Code main agent delegated read-only reviews of the uncommitted agy work, monitored them to settlement, and verified each finding in source and against recorded live agy output.

- **Codex (correctness):** six concrete findings, all confirmed and fixed: cancellation lost while agy was spawning; agy process untracked so `resolve` could settle while it still ran; an orphaned child if event persistence failed after spawn; dispatch recorded later than argv delivery; the timeout notice lost past a 4,000-character stderr tail; no conversation ID when `init` was unreadable. Accepted.
- **Claude (documentation):** four accurate corrections (agy is conditional on PATH, the cancel race, post-dispatch timeout state, alias wording). Accepted.
- **agy (fixture fidelity):** three of five claims were contradicted by recorded real output and withdrawn after a scoped reply; one SIGINT-robustness point led to SIGKILL escalation; the remaining claim concerned code since replaced and was unverified. Not accepted.

Pilot friction: monitoring required repeated polling loops, which led to the new `wait` command.

## Second round: pre-merge review, scope research, routing

- **Pre-merge review** (same diff to Codex and Claude): Codex reported four bugs, all confirmed (conversation identity checked only once, started tools ignored, tool activity recorded after persistence, agy left running when the observer failed). Claude reported three of the same plus a new one (`wait` treated a still-running stale-heartbeat worker as settled), but wrongly called the identity handling correct. All were fixed with tests.
- **Framing:** both unprompted Claude `invalid_output` results were progress notes sent as separate messages before clean final JSON. Final-message validation now applies to every ACP harness; a live Claude review then settled as needs_review with progress retained in `output`.
- **Refused permission reported as cancelled:** Codex ended a turn as cancelled after the CLI refused its escalation. Only a coordinator-requested cancel now counts as cancelled; otherwise the task is needs_input.
- **Scope research** (each harness on its own controls): Claude's was accurate and separated verified from inferred claims; Codex's facts held but targeted `codex exec` flags that codex-acp cannot pass; agy's key `--sandbox` claim held live, but it labeled inferences as verified.
- **Strict configs verified live:** Codex `read-only` mode, Claude `acceptEdits`, and agy `--sandbox` each completed an in-directory edit while a shell write to the home directory failed. See the CLI contract's permission section.

These results are the basis for the provisional routing guidance in the coordinator skill; the sample is small.

## Verification

`make test`: syntax checks, 46 Node tests, and 3 installer tests pass. New tests cover agy completion and resume, denied actions, invalid output, cancellation, timeout, failure with and without tool activity, a missing conversation, `resolve` refusal while an orphaned agy process runs, unknown-harness errors, and `wait`. Live post-fix checks: an agy edit under `always-proceed` completed and was verified; agy and Codex 15-second timeouts settled as failed; `wait` returned when all three settled.

## Limits

Not tested live: OpenCode needs_input, recall, and cancel; agy cancellation during process startup; unattended or long-running supervision; nested launch from a Codex main agent. The no-tool-activity rule depends on each harness reporting its tool calls.
