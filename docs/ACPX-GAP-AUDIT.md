# ACPX coverage audit — 2026-09-26

> **Historical.** Pre-implementation audit. The pending scope choice below was resolved as option A (minimal CLI plus coordinator skill), which is now implemented.

## Conclusion

ACPX covers native execution/session management. A thin supervisor is justified primarily by durable task accounting and acceptance, not missing process orchestration. A coordinator skill can direct manual accounting, but a skill alone does not automatically maintain a durable task ledger.

This follow-up audit was delegated as a bounded read-only source inspection. Root inspected the returned evidence, confirmed the installed public types and same-session behavior, and revalidated the saved live trial hashes and phase records. No new model calls were made. No production implementation was started.

## Coverage

| Requirement | Existing ACPX capability | Remaining task-level work |
|---|---|---|
| Start independent workers | Named sessions, persistent session creation, prompt admission | Stable worker/task IDs and agreed objective |
| Monitor work | Passive journal watch, opaque cursors, turn events, status | Account for every worker; distinguish idle owner from active work |
| Collect results | Canonical settled turn result: completed/cancelled/failed | Parse response, classify needs_input/invalid output, record acceptance |
| Correct or answer | Follow-up prompt to native session | Record correction attempts and authorization boundaries |
| Cancel | Cooperative cancellation | Await settlement; retain evidence and distinguish unknown outcome |
| Restart | Persistent sessions and same-session-only runtime resume | Reconcile uncertain submissions and retain accepted task results |
| Permissions | Policy; embedded callbacks; structured CLI escalation | Verify actual adapter behavior; do not confuse escalation with suspended approval |

## Important boundaries

- `promptStarted` indicates transport admission; `turn_started` and queue acceptance may precede it.
- `turn.result` is the settlement signal; raw ACP stopReason can arrive before finalization.
- Transport completion is not task acceptance. Completed work still requires substantive verification by the coordinator.
- An owner disappearing before settlement can produce WATCH_OUTCOME_UNKNOWN. The prompt might have executed. Do not automatically resubmit it.
- Event journals rotate. Expired cursors and missing retained history must surface explicitly; a journal is not a permanent task ledger.
- Permission escalation can deny the current request and report metadata. It is not necessarily a pending request awaiting later approval.
- Certain native questions fail with PERMISSION_PROMPT_UNAVAILABLE before host callbacks can answer them.
- Shared runtime permission options are narrower than embedded runtime callbacks. Native permission/dialog handling has not been live-tested.
- ACP fs/terminal callback settings are not an OS sandbox for native agent access.

## Lean candidate

Prefer assessing the shared runtime with ACPX's existing session owner before writing a custom owner. Add a small task ledger and command mappings only where the acceptance/accounting gap demands them. Avoid duplicating adapters, process ownership, event journals, or adding a dashboard.

The previous live trial used the embedded runtime. Shared-runtime behavior, settings replay, permissions, state location, and same-session continuity must be directly verified before selecting it for implementation. Shared runtime is an architectural candidate, not a trial-proven replacement.

## Evidence provenance

Both the partial source snapshot and installed package declare ACPX 0.19.3; matching versions do not establish identical commits. Snapshot paths below are temporary inspection references, not project dependencies.

- `/private/tmp/mc-root-investigation/openclaw-acpx/docs/sessions.md`: session naming and persistence.
- `docs/prompting.md`: prompt queuing and follow-up behavior.
- `docs/session-control.md`: owner status versus active prompt.
- `docs/session-watch.md`: settlement, unknown outcomes, and rotating history.
- `docs/permissions.md`: escalation, callback behavior, and native question limitations.
- `src/session/watch.ts`: unknown-outcome handling.
- `src/runtime/engine/reconnect.ts`: same-session-only resume behavior.
- Installed `/private/tmp/mc-root-investigation/acpx-smoke/node_modules/acpx/dist/runtime.d.ts`: result contract, promptStarted, shared/embedded option types.
- Installed `dist/runtime.js`: persistent resume policy and shared runtime's same-session-only path.

## Pending scope choice

The user was asked whether this round should deliver A: minimal usable CLI plus coordinator skill, or B: ACPX plus coordinator skill only. No answer has been recorded at the time this audit was saved. Neither implementation direction has been started.
