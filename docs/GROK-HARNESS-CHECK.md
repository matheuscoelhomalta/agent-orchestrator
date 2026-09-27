# Grok harness and X-search check

2026-09-26. Bounded native harness result: PASS for model execution, session continuity and one independently verified historical X-search retrieval. CLI integration result: NOT SUPPORTED by the current verified permission-configuration contract.

## Native results

Installed Grok is `1.0.41 (4220f3b224a6) [stable]`. The executable provides the ACP entry point `grok agent stdio`. Initially `grok models` printed not authenticated despite exiting zero and showing fallback models. Its cached-token ACP authentication and session creation also acknowledged successfully before login; those acknowledgements alone were not treated as proof of usable authentication. Root completed normal OAuth login using the personal account explicitly selected by the user; no recovery flow, API key, billing setup, or permission bypass was used.

Through the pinned ACPX embedded runtime, model `grok-4.7` and effort `medium` were selected and read back before a prompt. The text-only calculation 17 + 26 returned 43. A subsequent fresh runtime process resumed the same native session and recalled marker `jade-6842`.

Initial X requests emitted native search start/completion events. The runtime's stored tool completions contained call metadata rather than post results. The model reported empty results, but this was not independently established. Two same-session follow-ups claimed searches or a post without corresponding new tool events; those claims were not accepted as retrieval evidence.

A final fresh native session searched for the historical Grok 4 Fast announcement. It emitted an actual X-search call and returned post `1969183334208045090`, dated 2025-09-19. Root independently inspected the [primary post](https://x.com/SpaceXAI/status/1969183334208045090) in the logged-in browser. Its announcement of Grok 4 Fast access for all users, including free users, matched the model's paraphrase and date. The historical @xai URL now resolves under @SpaceXAI. This proves one bounded native X retrieval, not exhaustive search coverage, current-news quality, or universal account access.

Five paid native model turns were used in total. Recorded runtime adapters all had matching exit events and were absent in the final process check. Native stores remain local and were not copied to repository evidence.

## Why Grok was not added to CLI defaults

Grok advertises `model` and `reasoning_effort` config options, but rejects config option `mode` with invalid params. A separate `session/set_mode` call with default returns an empty acknowledgement; the session does not advertise the mode echo/status that the wrapper currently requires. A custom Grok CLI test therefore settled failed with `ACP_BACKEND_UNSUPPORTED_CONTROL`, admission not confirmed, and no task prompt dispatched.

Adding a mode-check exemption would weaken the existing contract without proving equivalent native permission behavior. No such exemption or speculative integration was applied. The native fresh-search response also used an evidence object rather than the supervisor's evidence array; it is not represented as an accepted CLI worker result. Grok works through its native ACP harness, but is not a supported `agent-orchestrator` default yet.

One high-confidence guard was applied: trusted argv configurations now reject Grok's documented `--always-approve` bypass flag, consistent with the existing exclusion of recognized bypass arguments. Its regression assertion passed in the 30-test suite.

## Protocol interpretation

The initialize `toolOverrides` booleans describe which X tools honor date constraints, not whether those tools are enabled. [ACP implementation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs). Search overrides constrain a hosted query and do not enable execution. [Override contract](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-sampling-types/src/tool_overrides.rs). X calls execute on the backend; clients must not execute emitted call metadata as a fallback. [Sampler implementation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-sampler/src/stream/responses.rs).

Keep the registered argv `grok agent stdio` when using ACPX, whose Grok authentication recognition depends on that argument prefix. Configure model and effort through advertised ACP options. ACP session modes and CLI permission modes should not be treated as interchangeable. No API-based X-search replacement was built.

## Evidence and remaining boundary

Sanitized local artifacts are under `../evidence/grok-harness-check/`: initialization/config probes, wrapper failure, deterministic/session checks, rejected same-session claims, fresh search events/results, and independently verified check summary. Test helpers preserve the command construction; private native sessions stay in temporary local state.

A Grok adapter for the supervisor still needs a verified native permission configuration/acknowledgement path and contract-level integration tests before support can be claimed. Grok cancellation, crash recovery and native permission denial were not tested. The successful X query does not remove the need to check sources or catch unsupported worker claims.


## Permission-contract investigation

A further read-only scout found no effective native permission acknowledgement exposed through the installed Grok/ACPX path. `grok agent stdio --help` exposes no permission policy flag; `grok agent --help` exposes the forbidden always-approve bypass. ACP `default`, `plan`, and `ask` affect prompt/plan behavior, not verified permission policy. [Pinned session-mode implementation](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-shell/src/session/acp_session_impl/session_mode.rs).

Upstream accepts `yoloMode: false` and `autoMode: false` in session creation and cold-load metadata. That is a configuration input, not proof of the effective policy. [Session setup](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-shell/src/agent/mvp_agent/session_setup.rs#L450), [auto-mode resolution](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-grok-shell/src/session/auto_mode.rs). Current response configuration exposes model/effort but no effective acknowledgement for both permission safeguards; a yolo-mode notification is not an acknowledged setter. ACPX's current session options also lack generic native metadata passthrough. Installed `grok inspect --json`, parsed only for permission-related keys, did not supply effective policy readback.

The public source inspected is pinned to `f0e3be1100ef5252488e3be8bb0e91cf68d8c305`; the exact installed build commit `4220f3b224a6` could not be fetched. Source findings corroborate the installed help/runtime probes and do not establish binary equivalence. No additional model prompts, logins, or configuration changes were made for this investigation.

The integration prerequisite is an acknowledged effective native policy plus ACPX metadata support. Before admitting a Grok worker, the supervisor must verify both effective safeguards and reject missing or mismatched acknowledgement. Fresh and resumed sessions then need an actual denied harmless write check, absent sentinel verification, and no-dispatch tests for failed acknowledgement. A denied write alone would not prove the full contract. Until that prerequisite is met, keep Grok standalone and do not exempt it from the admission guard.
