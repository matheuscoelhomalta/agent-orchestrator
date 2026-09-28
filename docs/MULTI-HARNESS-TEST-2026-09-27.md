# Live test report — 2026-09-26 to 2026-09-28

Codex and Claude passed every exercised workflow. Antigravity (`agy`), run through its documented headless CLI, passed the same workflows. OpenCode works through a custom config. Grok and the legacy Gemini CLI cannot run through the CLI. Coordinator pilots on this repository and on three real repositories produced verified review findings that inform the coordinator skill's routing guidance.

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
| Timeout | Passed | — | Passed | — |
| Refused action → needs_input | — | — | Passed (request-review) | — |

Usage metadata confirmed `gpt-5.6-sol` and `claude-opus-5-5` (plus Claude Code's Haiku auxiliary calls). agy does not report its model, so it is recorded as requested. Guards held for stale acceptance, reply while active, reply to invalid_output without `--correction`, a second correction, and reply before resolving an unknown request.

## Findings

1. **Scope is advisory under default native modes.** Asked to write outside the working directory, Codex (Auto-review), Claude (auto), and OpenCode (build) all did so without a permission callback reaching the CLI. Codex's own Guardian Review approved a write to the home directory. The prompts requested these writes, so this shows the supervisor is not in the loop, not that workers break scope unprompted. Test files were removed.
2. **agy permissions follow the native setting.** agy has no ACP mode or per-run permission override; `--mode accept-edits` did not change `toolPermission`. By explicit user choice the CLI records but does not enforce the reported mode. Under `request-review`, agy often tried shell commands (verification or scripted output), and three turns stopped at needs_input because such a command was refused. The user's setting was restored to `always-proceed` afterwards (it had been removed by an unknown actor during the session).
3. **agy hides its own timeout.** On `--print-timeout` it exits 0 with `status: "SUCCESS"`, a partial response, and only a stderr notice; the CLI classifies this as TIMEOUT.
4. **Clear failures need no manual resolution.** A dispatched turn that fails with no tool call or permission request settles as failed. Live Codex and agy timeouts confirmed this; any tool activity keeps the outcome unknown.
5. **OpenCode** works via a custom config with `opencode-go/deepseek-v4.1-flash`; its advertised default `opencode/deepseek-v4.1-flash` was unavailable. A suspected harness-naming problem did not reproduce through the CLI.
6. **Grok 1.0.41** advertises no `mode` config option, so start fails before dispatch. **Gemini CLI 0.32.1** is rejected at login (`IneligibleTierError`); the Google harness is agy.

## Antigravity integration decision

Google's `agy_acp_server` connector (published by Google LLC in the ACP registry) was not used. Antigravity's terms (§6) prohibit third-party tools accessing the service; an unofficial forum reply describes spawning the unmodified CLI with documented structured flags for single-user workflows as permitted. The adapter therefore spawns `agy --print ... --output-format stream-json` without a shell and never touches Antigravity OAuth tokens. This is a risk reduction, not legal certainty.

## Coordinator pilot

Following the coordinator skill, a Claude Code main agent delegated read-only reviews of the uncommitted agy work, monitored them to settlement, and verified each finding in source and against recorded live agy output.

- **Codex (correctness):** six concrete findings, all confirmed and fixed: cancellation lost while agy was spawning; agy process untracked so `resolve` could settle while it still ran; an orphaned child if event persistence failed after spawn; dispatch recorded later than argv delivery; the timeout notice lost past a 4,000-character stderr tail; no conversation ID when `init` was unreadable. Accepted.
- **Claude (documentation):** four accurate corrections (agy is conditional on PATH, the cancel race, post-dispatch timeout state, alias wording). Accepted.
- **agy (fixture fidelity):** three of five claims were contradicted by recorded real output and withdrawn after a scoped reply; one SIGINT-robustness point led to SIGKILL escalation; the remaining claim concerned code since replaced and was unverified. Not accepted.

Pilot friction: monitoring required repeated polling loops, which the `wait` command replaces.

## Second round: pre-merge review, scope research, routing

- **Pre-merge review** (same diff to Codex and Claude): Codex reported four bugs, all confirmed (conversation identity checked only once, started tools ignored, tool activity recorded after persistence, agy left running when the observer failed). Claude reported three of the same plus a new one (`wait` treated a still-running stale-heartbeat worker as settled), but wrongly called the identity handling correct. All were fixed with tests.
- **Framing:** both unprompted Claude `invalid_output` results were progress notes sent as separate messages before clean final JSON. Final-message validation applies to every ACP harness; a live Claude review then settled as needs_review with progress retained in `output`.
- **Refused permission reported as cancelled:** Codex ended a turn as cancelled after the CLI refused its escalation. Only a coordinator-requested cancel counts as cancelled; otherwise the task is needs_input.
- **Scope research** (each harness on its own controls): Claude's was accurate and separated verified from inferred claims; Codex's facts held but targeted `codex exec` flags that codex-acp cannot pass; agy's key `--sandbox` claim held live, but it labeled inferences as verified.
- **Strict configs verified live:** Codex `read-only` mode, Claude `acceptEdits`, and agy `--sandbox` each completed an in-directory edit while a shell write to the home directory failed. See the CLI contract's permission section.

These results are the basis for the provisional routing guidance in the coordinator skill; the sample is small.

## Third round (2026-09-28): strict mode and a real-repository pilot

- **`start --strict`** verified live: Codex, Claude, and agy each completed an in-directory edit while a shell write to the home directory was blocked. A project `.claude/settings.json` Bash sandbox was also verified to reach Claude workers in default auto mode (shell only, no stops).
- **Pilot:** Codex and Claude independently reviewed three of the user's own repositories (Go CLI, Next.js app, trading bot) in local clones, with agy as a third reviewer on one. Every finding was checked in source by the coordinator; two were reproduced by building and running the clone.
  - Go CLI: 6 + 6 findings, all confirmed; 3 shared, 9 distinct.
  - Next.js app: 5 + 5 findings; all Claude's confirmed; Codex's confirmed in code, with one documented as intentional by the repository's tests and one a modeling choice.
  - Trading bot: Codex's one high-severity finding confirmed; Claude's one finding (units of a trade-size field) conflicts with the REST reference example though a WebSocket example supports it, so it stays unconfirmed pending a real API response.
- Details of the reviewed repositories are not recorded here; they were reported to the user directly.
- **Strict refusal and early cancellation:** under `--strict`, Codex requested escalation, the CLI refused it, Codex ended the turn as cancelled, and the task settled as needs_input with nothing written. agy cancelled right after process start settled as cancelled within two seconds with no output or leftover process; cancels before start settled without dispatch.
- **claude-agent-acp 0.81.2:** fixture suite plus live Claude review, mid-turn cancel, strict refusal, and same-session reply all passed; configuration readback and usage (`claude-opus-5-5`) unchanged. Tool calls carry names (for example `Edit`, `Terminal`) in the event log.

## Verification

`make test`: syntax checks, 48 Node tests, and 3 installer tests pass. Tests cover agy completion and resume, denied actions, invalid output, cancellation, timeout, failure with and without tool activity, a missing conversation, `resolve` refusal while an orphaned agy process runs, unknown-harness errors, and `wait`. Live post-fix checks: an agy edit under `always-proceed` completed and was verified; agy and Codex 15-second timeouts settled as failed; `wait` returned when all three settled.

## Recovery, denial, and launch checks (2026-09-26)

- **Codex cancellation and runner loss:** cancellation after streamed text settled as cancelled, and a fresh runner resumed the same session with context. A runner killed after dispatch reconciled to `unknown`; `reply` was refused until `resolve` settled it as failed, after which the same native session resumed and recalled its marker. Cleanup of the killed process tree was manual; the CLI never kills saved PIDs.
- **Claude native Write denial** (temporary `default` mode): a real permission callback was recorded as `permission_denied`, the task became needs_input, and the file was never created.
- **Launch context:** a native Codex coordinator successfully monitored and accepted workers started from a normal terminal, but workers it launched itself inside its sandbox failed (Codex could not open its SQLite state; Claude reported AUTH_REQUIRED).
- **Grok native harness:** `grok-4.7` completed turns, resumed its session, and returned one independently verified X post; CLI admission fails as described in the [CLI contract](CLI.md#other-harnesses).

## Limits

Not tested live: OpenCode needs_input, recall, and cancel; cancellation during a side-effecting tool; recovery with damaged native stores; approval of a suspended native dialog (unsupported: denial is the only path); unattended or long-running supervision. Launching workers from inside a Codex main agent's sandbox is blocked. The no-tool-activity rule depends on each harness reporting its tool calls.
