# Architecture candidate

This is the proposed minimum direction, not an approved implementation specification.

## Components

1. Existing main agent: decomposes work, selects specialists, handles routine questions, evaluates outputs, and escalates material decisions.
2. Thin supervisor CLI: maintains explicit worker state and exposes execution, monitoring, follow-up, and cancellation.
3. ACPX embedded runtime: communicates with ACP adapters and preserves native session identity.
4. Native harnesses: retain their models, authentication, tools, and permission systems.
5. Portable coordinator skill: teaches the main agent the supervision loop and acceptance rules.

Ghostty remains the normal terminal interface. A dedicated dashboard, web application, custom harness, or broad workflow platform is not currently required.

## Candidate command surface

`start`, `status`, `events`, `result`, `reply`, and `cancel`.

Stable machine-readable output would let different main-agent harnesses use the same interface. Exact flags, output schema, and whether CLI alone is sufficient remain undecided. An MCP interface has not been selected.

## Minimum contract

Store worker identity, harness, native session identity, current request identity, configured model/effort/mode, timestamps, progress, output location, and task acceptance state. Keep task state separate from transport state.

A worker response should communicate completion, a need for input, or a failure explicitly. The supervisor must also handle missing output, invalid formatting, cancellation, and unknown outcomes. The exact schema remains open; formatting alone must not establish correctness.

Track every active worker until its output is accepted or a blocker is surfaced. Use bounded waits and explicit recovery limits. Output silence may indicate a long-running operation; it is not sufficient evidence of failure. Do not automatically retry work with an unknown outcome if doing so could duplicate side effects.

## Configuration and safety requirements informed by the trial

- Preserve native session IDs and require explicit handling of resume failure.
- Apply and verify model, effort, and permission mode on reconnect.
- Use the tested modern config-option path for mode changes, verifying accepted values and status.
- Respect native permission systems and the main agent's authorization boundaries.
- Do not auto-accept denied requests or enable permission bypass flags as a convenience.
- Clarify material choices; routine formatting corrections and already authorized follow-ups can be automated.

## Open decisions

- Final project/command name and implementation language.
- Whether a skill with ACPX configuration meets the need before custom code is justified.
- First supported harness pair; Codex and Claude have trial evidence, Grok does not yet.
- Persistence/restart semantics, response schema, recovery limits, and result retention.
- How the main agent receives completion notifications versus polling.
- What user-visible monitoring is necessary beyond structured CLI status.
- How real native permission requests are represented across adapters.

Resolve these through a bounded implementation proposal, preserving the lean scope. Do not interpret this document as authorization to build all proposed components.
