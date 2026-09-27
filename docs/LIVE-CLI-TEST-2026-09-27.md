# Live CLI test — 2026-09-27

The installed CLI passed the tested Codex and Claude workflows. Grok integration failed before task dispatch because its ACP interface lacks the permission-mode configuration control required by the supervisor. No unexpected defect was found in the supported paths exercised here. This is a bounded functional check, not a production-readiness or model-quality benchmark.

## Environment and method

- Source baseline: `86e4cf7b61b2d153dd1047f141fb405befbb821b`.
- Installed `agent-orchestrator` wrapper invoked the existing checkout from outside the project directory, using a temporary fixture as worker cwd.
- Node: 26.9.0. Pinned ACPX: 0.19.3; Codex ACP adapter: 1.13.1; Claude ACP adapter: 0.76.0.
- Native executables: Codex 0.157.1; Claude Code 2.1.283; Grok 1.0.41, build `4220f3b224a6`.
- Codex requested/acknowledged `gpt-5.6-sol`, high effort, agent mode. Claude requested `claude-opus-5-5`, acknowledged the explicitly allowed `opus` alias, medium effort, auto mode. This checks the adapter's acknowledged configuration, not independent provider-side model identity.
- Native starts/replies used the authorized outside-sandbox execution path and existing harness logins. No authentication or global permission configuration was changed.
- Four worker records were created: Codex, Claude, Grok, and a separate Claude permission-denial fixture. Twelve task turns were confirmed dispatched; Grok dispatched none.
- `make test` passed syntax checks, 37 Node tests, and 3 Python installer tests. These results supplement the native checks rather than establish native parity by themselves.

## Live results

| Behavior | Codex | Claude | Grok |
|---|---|---|---|
| Native admission and configuration readback | Passed | Passed, using allowed Opus alias | Failed: unsupported mode control |
| Concurrent task execution | Passed with Claude | Passed with Codex | No task dispatched |
| Native read of a real source fixture | Passed | Passed | Not reached |
| Correct source-review finding | Passed | Passed | Not reached |
| Same-session follow-up and context recall | Passed | Passed | Not reached |
| Explicit review and current-request acceptance | Passed | Passed | Not reached |
| Stale acceptance ID rejection | Passed | Passed | Not reached |
| Controlled needs-input question and answer | Not exercised natively here | Passed | Not reached |
| Deliberately malformed output and format correction | Passed | Not exercised natively here | Not reached |
| Cancellation with canonical settlement | Passed after streamed text | Passed after dispatch, before text | Not reached |
| Resume and context recall after cancellation | Passed | Passed | Not reached |
| Actual native Write denial | Not exercised natively here | Passed under temporary stricter default mode | Not reached |
| Paginated event sequence and adapter cleanup | Passed | Passed | Passed for failed startup |

## What is working

1. **Concurrent execution and substantive verification.** Both first prompts were dispatched before either first turn settled. Both agents used native read tools on `pricing.mjs`, correctly identifying that `discountPercent` was ignored. Independent Node execution returned 200 for `total(100,2,25)`; the intended discounted value was 150. The fixture's bytes remained unchanged.
2. **Session continuity and configuration preservation.** Separate CLI reply processes resumed each original native session. Both agents recalled their original marker without receiving it again in the post-cancellation prompt, retained the pricing context, and correctly calculated 17 + 26 = 43. Configuration readbacks remained consistent through follow-ups.
3. **Completion is separate from acceptance.** Completed responses stayed `needs_review` until independently verified. Acceptance attempts using each original, now-obsolete request ID returned `INVALID_STATE`. Current verified results were accepted explicitly; prior acceptance and turn results remained in history.
4. **Response recovery.** Codex's intentionally requested plain text `FORMAT_PROBE_9276` became `invalid_output`, with raw text retained. One explicit correction produced valid completion JSON and recalled the original marker. Claude's controlled rounding question became `needs_input`; an explicit nearest-cent answer continued the same session and returned 35 + 9 = 44. This was a synthetic task question, not a native interactive dialog.
5. **Cancellation and continuation.** Both interrupted turns canonically settled as `cancelled`. Codex had already streamed text; Claude had not. Fresh reply processes resumed both sessions successfully. Cancellation did not create a replacement session or fabricated completion.
6. **Native permission denial.** A separate Claude worker used temporary `default` mode instead of the project default `auto`. One harmless native Write request was denied, a `permission_denied` event was recorded, the task became `needs_input`, and direct inspection confirmed `permission-probe.txt` did not exist. A no-tools follow-up acknowledged the expected denial without retrying; the verified test result was accepted. This does not establish permission approval support or all tools' behavior in auto mode.
7. **Event accounting and cleanup.** Final audit read all events in pages of 30, checking contiguous unique sequence numbers. All 40 recorded adapter launches had matching exit events: Codex 17, Claude main worker 17, Claude denial worker 5, Grok 1. All recorded adapter and final runner PIDs were absent, and no process command referenced the test state directory. The fixture contained only its original source file.

## What is not working or remains unsupported

1. **Grok cannot run tasks through this CLI.** A trusted custom entry using `grok agent stdio`, `grok-4.7`, medium effort and default mode failed with `ACP_BACKEND_UNSUPPORTED_CONTROL`: the session advertises `model` and `reasoning_effort`, but no `mode` config option. There was no `prompt_dispatched` event, no tool execution, and no task response. The supervisor correctly refused admission; this does not establish that Grok's standalone native harness is broken. No exemption or permission bypass was introduced.
2. **Approval of a suspended native permission dialog is not provided.** The supported observed behavior is denial plus an actionable blocker. The CLI cannot approve that suspended dialog. The stricter denial fixture is not evidence that scope strings enforce an OS sandbox.
3. **Static doctor is not an authentication test.** It passed, but explicitly returned `authVerified: false`. Actual Codex/Claude execution established usable authentication for this run.

## Coverage limits

These paths were not tested natively in this run: startup inside the coordinator's sandbox, abrupt runner loss, damaged or missing native stores, cancellation during a side-effecting tool, Claude cancellation after text streaming, Codex permission denial, Claude malformed-response correction, or Grok model execution/X search. The automated suite passed failure-injection and recovery cases, but fixture passes are not native evidence. Earlier dated reports contain additional bounded checks; they are not represented as new live passes here.

The current implementation still has documented pilot limits: manual stale-lock inspection, event-log rewriting on append, initialization/cleanup extending beyond the model-turn timeout, and no power-loss fsync guarantee. No long-running load, unattended supervision, large coding task, or design-quality comparison was performed.

## Evidence and final accounting

Sanitized fixture prompts, CLI output, complete paginated supervisor events, rejection results, executable test drivers, and independently asserted checks are retained locally under ignored `evidence/live-cli-2026-09-27/`. The summary is `verified-checks.json`. Private native stores remain in temporary local state and were not copied into tracked artifacts.

Final records: Codex accepted; Claude accepted; Claude denial fixture accepted; Grok failed before dispatch. No active or unresolved worker remained. Production source files and dependencies were not modified.
