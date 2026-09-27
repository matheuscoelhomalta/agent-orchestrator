# CLI contract

Version 0.1.0 is a local, terminal-first supervisor. Node 22.13.0+ and existing native Codex/Claude logins are required. Dependencies are pinned to the trial versions. No Grok/X capability is claimed.

## Setup

```sh
npm ci --ignore-scripts --no-audit --no-fund
make install-local
agent-orchestrator --json doctor
```

The installer creates a wrapper at `~/.local/bin/agent-orchestrator`, refuses conflicting commands, and requires this checkout and Node to remain available. Ensure `~/.local/bin` is on PATH. The coordinator package lives at `skills/agent-orchestrator/`; no global skill links are created.

## Commands

| Command | Behavior |
|---|---|
| `doctor` | Static dependency/configuration/native-command checks; no model call and no authentication verification |
| `start --harness NAME --prompt-file FILE --criteria TEXT --scope TEXT` | Record a task and start an asynchronous runner; returns worker/request IDs before task completion |
| `status [ID]` | Compact worker summaries with identity, task state, heartbeat/progress, and blockers; reconcile missing/stale runner into unknown |
| `events ID --after N --limit N` | Sequenced page with nextCursor; limit 1–1000, default 100 |
| `result ID` | Current full text transcript, validated response text, response, execution settlement, task state, acceptance, reconciliation, and prior-turn history |
| `reply ID --prompt-file FILE` | New request in the same native session; prior result saved in record history |
| `reply ID --prompt-file FILE --correction` | One explicitly requested formatting correction per task, only from invalid_output; ordinary reply cannot bypass it |
| `cancel ID` | Write request-scoped cancellation marker, including for a live unknown runner; poll for settlement |
| `accept ID --request REQUEST --note TEXT` | Record coordinator verification of the current settled needs_review result |
| `resolve ID --request REQUEST --note TEXT` | Record side-effect reconciliation of the specified unknown request and settle it as failed; runner must no longer exist |

Common flags: `--state-dir DIR`, `--json`, `--help`. Start also takes `--cwd`, `--config`, `--objective`, and `--timeout` (1–3600 seconds, default 300). The timeout applies to the model turn; native initialization/load and owned cleanup can extend wall time. `--config` selects a trusted harness map at start; its snapshot is retained for subsequent replies.

Machine-readable command output uses `{ "ok": true, "data": ... }`; failures under `--json` use `{ "ok": false, "error": { "code": "...", "message": "..." } }` on stdout and nonzero exit status. Without `--json`, data remains readable JSON and errors go to stderr. A failed doctor also returns top-level ok=false with error code DOCTOR_FAILED and its detailed check data. Empty configurations and nonexecutable commands are rejected or reported unhealthy. Help is plain text. A successful read can report a failed worker: command success and task success are distinct.

```json
{"ok":true,"data":{"id":"worker-id","requestId":"request-id","state":"starting"}}
```

```json
{"ok":true,"data":{"events":[{"seq":1,"type":"runner_started"}],"nextCursor":1}}
```

```json
{"ok":false,"error":{"code":"INVALID_STATE","message":"Worker is active or has an unresolved outcome."}}
```

## Response and acceptance

Workers are prompted to return one strict JSON object:

```json
{"status":"completed","summary":"What changed or was found","evidence":["Check or artifact reference"]}
```

```json
{"status":"needs_input","question":"Material decision needed"}
```

```json
{"status":"failed","reason":"Why the objective was not completed"}
```

Completed JSON becomes needs_review. Only an explicit accept command with the current request ID marks it accepted. The caller must actually inspect evidence: a note is an audit record, not an automated semantic verifier. Invalid JSON or valid JSON that fails the response schema becomes invalid_output. No automatic task retry or semantic correction is performed.

## Native configuration

Defaults preserve the previous delegation conventions: Codex gpt-5.6-sol/high in agent Auto-review mode; Claude claude-opus-5-5/medium in auto mode. Configuration is applied via ACPX before the task prompt and verified from accepted mode/status responses. Claude's advertised `opus` alias is accepted only as the explicitly configured canonical alias. Changing versions or providers may require configuration changes and fresh verification.

A custom config file is a harness-name-to-spec map:

```json
{"codex":{"command":["/absolute/path/to/node","/absolute/path/to/codex-acp/dist/index.js"],"model":"gpt-5.6-sol","effort":"high","effortKey":"reasoning_effort","mode":"agent","env":{"CODEX_PATH":"/absolute/path/to/codex","INITIAL_AGENT_MODE":"agent","NO_BROWSER":"1"}}}
```

Config is trusted code execution through argv, not a sandbox. Do not put credentials in argv or config. Persisted environment keys are limited to native executable paths and the tested nonsecret startup settings. Use native authentication stores; no API key setup is performed. Arbitrary custom adapter support is a configuration mechanism, not a compatibility guarantee.

## Persistence and recovery

State defaults to `~/.local/state/agent-orchestrator`; use `--state-dir` for isolated runs. Existing state directories must be real private directories (no group/other permissions); insecure directories are rejected without changing their permissions. Records and event files have private permissions and atomic replacement with per-worker locks. Every worker has a small detached runner; ACPX owns its adapter and native session. No service, port, or dashboard is installed.

Replies require the original native record and session ID. Failed resume does not silently substitute a new session. Cancel markers are request-scoped and the runner polls them. Closing a terminal or reading results does not cancel work. Native histories may be created and model quota consumed by starts/replies.

Missing runners or heartbeat expiry (45 seconds) produce unknown outcome. Disconnection/backend-uncertainty errors and any failed execution after confirmed prompt dispatch also produce unknown. The heartbeat is not evidence that model work is progressing. Unknown work cannot be replied to until explicitly reconciled with its current request ID; a still-live unknown runner can receive a cancellation request; no PID is killed from a saved record. There is no arbitrary process-kill command. Runner writes wait up to two seconds for transient lock contention; ordinary CLI writes still report contention immediately. Stale lock files require manual inspection; do not remove a lock while a writer is active.

Atomic writes protect process-level consistency, not power-loss durability: no fsync guarantee is made. Event files are retained and rewritten on append; this is suitable for the bounded pilot, not unbounded streams. State, prompts, results, and native histories can contain task data. Reconciliation notes are bound to request IDs and archived on follow-up. The supervisor omits thought chunks and raw tool payloads from its event archive, but cannot guarantee model text is secret-free.

## Permission boundary

Native Auto/Auto-review remains enabled; the ACP client denies permission callbacks it cannot authorize and surfaces them as needs_input. ACP filesystem/terminal callbacks are disabled. These settings are not an OS sandbox for native tools. Recognized native questions may fail before the permission callback and require a native client capable of handling them. The CLI does not approve a suspended native dialog or automatically broaden policy.

## Verification

`make test` runs syntax checks, ledger tests, and subprocess/ACP integration checks. Fixtures verify protocol behavior without paid calls; they do not establish native adapter parity. The live verification report separately records the bounded Codex/Claude checks and remaining gaps.


### Response framing

`result.output` retains the full non-thought text transcript. `responseOutput` is the text subjected to strict JSON validation; `responseMessageId` identifies its producer message when available. For Codex only, distinct non-interleaved message IDs allow progress messages to remain auditable while validating the last message. Missing, blank, or interleaved IDs fall back to validating the whole stream. Prose within the final message is still invalid; JSON is never extracted from arbitrary text. Message IDs are framing hints, not permission or authenticity evidence. Replies archive these fields with the prior request.
