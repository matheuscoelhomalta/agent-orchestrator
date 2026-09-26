# Project brief

## Motivation

The user wants reliable orchestration between agents from different harnesses. The central problem is that the main agent does not monitor subagents well: it loses track of progress, mishandles blockers, fails to follow through, or receives badly formatted or otherwise unsuitable responses.

Different agents offer different perceived strengths. The user cited Claude for design, Grok for X access, and GPT for strong models. These are routing motivations, not benchmark findings. In particular, actual X search access through the installed Grok harness has not been demonstrated.

## Established direction

- Harness-agnostic orchestration where practical.
- Native terminal workflow; the user mainly uses agents through Ghostty.
- Lean scope focused on orchestration and monitoring.
- A main agent coordinates specialists and handles routine recovery, while material decisions and authorization boundaries reach the user.
- Prefer an existing suitable option; the user is willing to build a dedicated tool if necessary.
- Investigate deeply before committing to an implementation.

Ghostty is the terminal interface. It does not need to become the orchestration backend. A common protocol can hide many harness differences, but individual capabilities, permissions, configuration, and resume semantics still need verification.

Earlier interview replies included numbered choices such as “3A.” Their original option texts are not available in the retained context, so they are not expanded into additional requirements here.

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

These criteria synthesize the discussion. Exact defaults, recovery limits, and the first implementation interface still need agreement.
