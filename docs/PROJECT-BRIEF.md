# Project brief

## Motivation

The user wants reliable orchestration between agents from different harnesses. The central problem is that the main agent does not monitor subagents well: it loses track of progress, mishandles blockers, fails to follow through, or receives badly formatted or otherwise unsuitable responses.

Different agents offer different perceived strengths. The user cited Claude for design, Grok for X access, and GPT for strong models. These are routing motivations, not benchmark findings. Grok's X search works in its native harness but cannot run through this CLI (see the [CLI contract](CLI.md#other-harnesses)); the [coordinator skill](../skills/agent-orchestrator/SKILL.md) holds the evidence-based routing guidance.

## Established direction

- Harness-agnostic orchestration where practical.
- Native terminal workflow; the user mainly uses agents through Ghostty.
- Lean scope focused on orchestration and monitoring.
- A main agent coordinates specialists and handles routine recovery, while material decisions and authorization boundaries reach the user.
- Prefer an existing suitable option; the user is willing to build a dedicated tool if necessary.
- Investigate deeply before committing to an implementation.

Ghostty is the terminal interface. It does not need to become the orchestration backend. A common protocol can hide many harness differences, but individual capabilities, permissions, configuration, and resume semantics still need verification.

## Desired outcome

The main agent can start independent workers, see which workers are active or blocked, collect trustworthy results, correct response problems, continue the same conversation, and account for every worker before reporting completion.

Formatting validation is only one acceptance check. An execution that finishes successfully may still return an incomplete task, a question, or an incorrect result.

## Adoption criteria

1. Track worker, native session, and request identities explicitly.
2. Expose actionable progress and blockers without requiring manual pane inspection.
3. Preserve session context through follow-ups and supervisor restarts where supported.
4. Detect malformed or incomplete results and permit bounded corrective follow-up.
5. Separate execution completion from task acceptance.
6. Preserve configured permissions and model choices; verify them after reconnecting.
7. Remain small enough to use from existing agent harnesses and terminals.

The [CLI contract](CLI.md) documents how each criterion is met and where limits remain.

## Why ACPX

ACP (Agent Client Protocol) standardizes client-to-harness communication: sessions, prompts, streamed updates, cancellation, configuration, and permission callbacks. It does not decide who does a task, monitor workers to completion, or judge results; those are the supervisor's job.

[ACPX](https://github.com/openclaw/acpx) supplies the execution layer through its embedded persistent runtime, with the [codex-acp](https://github.com/agentclientprotocol/codex-acp) and [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp) adapters. The embedded runtime enforces same-session-only resume, and it lets the CLI set and verify model, effort, and permission mode before any task prompt is dispatched. ACPX's shared runtime was not used because its controls require an already-running owner, normally started by prompt submission. This CLI adds only what ACPX lacks: durable task accounting, response validation, bounded correction, acceptance, and unknown-outcome handling.

Alternatives inspected in September 2026 did not fit this direction:

| Candidate | Finding |
|---|---|
| [Herdr](https://github.com/herdrdev/herdr) | Owns interactive PTY terminals and detects state from hooks and screen rules rather than structured turn results |
| agent-deck | tmux/SQLite monitoring; an unset Claude `dangerous_mode` defaulted to true |
| backnotprop/orchestrator | Auto-accepted Codex approvals and used yolo behavior for Copilot |
| mco-org/mco | Replays history into fresh native calls instead of continuing the original session |
