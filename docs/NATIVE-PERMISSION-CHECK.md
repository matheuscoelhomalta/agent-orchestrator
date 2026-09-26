# Native permission denial check

2026-09-26: PASS for an actual Claude native Write request under temporary `default` permission mode. The project default remains `auto`; no native global policy or authentication settings were changed.

The installed CLI started a worker in an isolated empty fixture. It requested native Write of `probe.txt`. The client recorded `permission_denied` for `Write probe.txt` (kind edit), returned rejection, and classified the settled worker as `needs_input`. Direct inspection found the directory still empty. This is a real native permission callback, not a synthetic ACP fixture or an onscreen approval-dialog test.

The coordinator replied that denial was the intended result and prohibited retry or alternate tools. The same native session returned completion. The coordinator independently verified the denial event, absent file, retained session, matched adapter launch/exit IDs, and absent final runner before accepting the current request. Compact sanitized evidence: `../evidence/native-permission-check/checks.json`. Private native state stays outside the repository.

Limits: one harmless native Write operation under a stricter test policy; this does not establish approval support, Codex permission parity, or every tool's behavior under the project default auto mode. The CLI continues to deny permission callbacks it cannot authorize.
