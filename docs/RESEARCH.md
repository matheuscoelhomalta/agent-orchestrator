# Research snapshot

These notes preserve conclusions from the earlier investigation. They are dated observations, not claims about every current release. The live trial has detailed local evidence; alternative-project notes have less complete preserved provenance and should be rechecked before an adoption decision.

## ACP: Agent Client Protocol

ACP standardizes communication between a client and an agent harness. In this discussion ACP means Agent Client Protocol, not another protocol with the same abbreviation. Local integrations commonly use JSON-RPC over stdio. A client can negotiate capabilities, establish sessions, submit prompts, receive structured updates, cancel work, and handle supported configuration or permission interactions.

ACP supplies communication mechanics. It does not automatically decide who should perform a task, monitor all workers to completion, judge result correctness, or enforce the main agent's recovery policy. Those are supervisor responsibilities. Capability support varies by adapter and harness.

## ACPX

Source: https://github.com/openclaw/acpx

ACPX is the strongest execution foundation found for the stated lean, cross-harness direction. Its embedded persistent runtime provides session handles, turn events/results, cancellation, configuration, and process lifecycle observation without building native adapters from scratch.

Important distinction observed during research: the generic CLI can allow a fresh-session fallback after resume failure. The embedded runtime used in the trial enforced same-session-only behavior and reported an explicit failure instead. Use the latter behavior where continuity is required; never silently replace a missing conversation.

ACPX is not the whole desired solution. The main missing layer is explicit worker state, task acceptance, response validation, follow-up, and escalation policy.

Adapters used: https://github.com/agentclientprotocol/codex-acp and https://github.com/agentclientprotocol/claude-agent-acp

## Herdr

Source supplied by the user: https://github.com/herdrdev/herdr

Earlier inspection found that Herdr owns interactive PTY terminals and exposes its own control API. ACP was not the agent-control mechanism observed in that inspection. It combines hooks where available with screen-based rules for harnesses including Claude, Codex, and Cursor. Its observed wait behavior concerns terminal state rather than a universally structured individual turn result.

Herdr is relevant if visible native interactive sessions are central to the workflow. For this user's emphasis on lean, structured orchestration and monitoring, ACPX offered a clearer foundation. Do not assume all Herdr integrations share identical hook coverage or completion semantics.

## Other candidates considered

| Candidate | Preserved finding | Implication |
|---|---|---|
| backnotprop/orchestrator | Observed auto-acceptance of Codex app-server approvals and a Copilot path using yolo behavior. | Not suitable as inspected for the user's authorization policy without addressing those behaviors. |
| agent-deck | tmux/SQLite approach; monitoring combines hooks, SSE, and pane fallback. Earlier source inspection found an unset Claude dangerous_mode defaulting true despite documentation expectations. | Worth revisiting for interactive terminal management, but defaults and permission handling must be verified. |
| mco-org/mco | Small Python implementation with no dependencies; observed session continuity replays history into fresh native calls. | Lean, but replay is different from continuing the original native session. |
| haowjy/orchestrate | Investigated as an additional orchestration candidate. | No sufficiently preserved decisive finding to recommend it here. |
| Existing local delegation skills | Harness-specific invocation/defaults were inspected before the trial. | Useful integration conventions; they do not by themselves prove reliable cross-harness supervision. |

Research location at the time: /private/tmp/mc-root-investigation. Upstream clones and installed dependencies were temporary and are not copied into this project. Alternative findings above are retained research conclusions, not independently rerun as part of saving this folder.

## Recommendation and boundary

Reuse ACPX; evaluate a small supervisor plus portable skill. Avoid rebuilding harness integrations without evidence of a gap. A deterministic live pilot passed core mechanics for Codex and Claude, but did not prove that an LLM coordinator will consistently follow the monitoring loop or that a complete production supervisor exists.
