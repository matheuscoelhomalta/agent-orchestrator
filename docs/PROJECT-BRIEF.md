# Project brief

## Motivation

Coordinating coding agents across native harnesses requires more than launching processes. A coordinator needs to track progress, handle blockers, preserve session context, and verify whether a result actually satisfies the task.

Different agents can contribute different findings. The [coordinator skill](../skills/agent-orchestrator/SKILL.md) records provisional routing guidance from bounded local pilots, not a general benchmark. Supported integrations and their limits are documented in the [CLI contract](CLI.md#other-harnesses).

## Established direction

- Harness-agnostic orchestration where practical.
- Native terminal workflow, including Ghostty or another terminal.
- Lean scope focused on orchestration and monitoring.
- A main agent coordinates specialists and handles routine recovery, while material decisions and authorization boundaries reach the user.
- Reuse existing execution infrastructure and keep supervision small.
- Verify native behavior before advertising compatibility.

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

This project focuses on structured turn results and native session continuation. It does not provide an interactive terminal manager, a dashboard, or unattended long-running scheduling. Broader tool comparisons require a fresh review of the specific versions and configurations being compared.
