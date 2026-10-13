IMPORTANT: When making significant changes to the codebase (such as new patterns, infrastructure updates, routing changes, critical rules, or tech stack additions), update this file to reflect them so future work remains consistent. Keep instructions concise and eliminate redundancy.

## Scope and architecture

Agent Orchestrator is a local Node.js ES-module CLI (Node 22.13.0+) supervising native coding agents through pinned ACPX/adapters, with a separate Antigravity headless integration.

- `src/cli.mjs` records tasks and launches detached `src/worker.mjs` runners. ACPX's embedded persistent runtime owns ACP sessions; do not substitute a shared runtime that dispatches before configuration verification.
- `src/core.mjs` owns configuration verification and outcome classification; `src/store.mjs` owns the private ledger and per-worker locks. `src/agy.mjs` handles the distinct native stream protocol, not ACP.
- Preserve the CLI/output contract in `docs/CLI.md`; update it when behavior changes. Contributor changes to permissions, persistence, harness support, or that contract require prior discussion per `CONTRIBUTING.md`.

## Verification and installation

- Install pinned dependencies with `npm ci --ignore-scripts --no-audit --no-fund`.
- `make test` runs source syntax checks, Node tests, and Python installer tests. `npm test` alone omits syntax and installer checks.
- Target one Node test with `node --test --test-name-pattern='execution and task acceptance remain separate' test/core.test.mjs`; substitute the actual test name and file.
- Fixture integration tests use `test/fixture-agent.mjs` and `test/fixture-agy.mjs`; they require no native credentials or paid model calls. Native checks are separate, opt-in work using the tester's account/quota. Passing fixtures does not establish native compatibility; do not rewrite historical reports to imply new live verification.
- CI covers Linux/macOS on Node 22.13.0 and 24. Native Windows behavior is unverified; see `docs/GETTING-STARTED.md` for support boundaries.
- `make install-local` writes a command under `~/.local/bin` containing this checkout's path and the current Node executable. Moving either breaks it; the installer refuses conflicting commands and installs no coordinator skill links.
- `doctor` checks installation/configuration only, not authentication or model availability. It checks every configured harness, including unused defaults.

## Runtime invariants

- Valid completion JSON becomes `needs_review`, never automatic acceptance. `accept` requires the current request ID and a settled result; verification of evidence belongs to the coordinator.
- Replies retain the native session and configuration, create a new request ID, archive the previous turn, and clear its acceptance. Missing or changed native sessions must fail without silently starting replacements.
- `invalid_output` permits one explicit formatting correction per task. Ordinary replies must not bypass that budget; correction must not repeat task execution.
- Lost runners, stale heartbeats, and uncertain side effects can produce `unknown`. Never automatically resubmit that work. `resolve` is request-scoped and must refuse while a recorded runner or adapter is alive.
- Cancellation is request-scoped and asynchronous. A native turn ending as cancelled after permission denial is `needs_input` unless the coordinator requested cancellation. A live unknown runner can still change state and must not count as settled in `wait`.
- ACP model, effort, and permission mode must be acknowledged/read back before every prompt, including resumes. Keep permission callbacks denied and ACP filesystem/terminal callbacks disabled; do not exempt unsupported harnesses from configuration checks.
- `--scope` and read-only prompts are advisory. Use `--strict` for editing workers, but do not describe it as a universal sandbox: Codex temporary directories remain writable and Claude shell commands can require denied approval. See `docs/CLI.md#permission-boundary`.
- Antigravity reports its native permission mode but does not read back model/effort; record those as requested, not verified. Its native permissions and provider-terms caveats are separate from ACP; see `THIRD-PARTY.md`.

## Persistence and local data

- Default state is `~/.local/state/agent-orchestrator`; use a private temporary directory with `--state-dir` for experiments. State, native histories, and ignored `evidence/` archives can contain private task data and must not become public test artifacts.
- Reject existing nonprivate or symlink state directories instead of repairing permissions. Preserve private file modes, atomic replacement, and per-worker locking; atomic writes do not promise power-loss durability.
- Workers wait briefly for lock contention; ordinary CLI writes fail immediately. Never automatically remove stale locks or kill processes from saved PIDs. Manual lock recovery requires confirming writers are stopped.
- Event storage omits thought chunks and raw tool payloads. Record tool activity before persistence can fail, so observer errors cannot hide possible side effects.

## Documentation and distribution

- `docs/` is the Jekyll site source; `_site/` is generated. Keep Markdown front matter/permalinks and links valid both on GitHub and the site; links outside the site source need repository URLs.
- The Documentation CI job builds with GitHub Pages' Jekyll action, then runs `python3 scripts/check-site.py _site`. This check is separate from `make test` and requires rendered output. It enforces an explicit page count as well as links, anchors, metadata, and sitemap consistency; update its expectation when adding/removing pages.
- The package intentionally remains `private: true`: distribution is through GitHub, not npm. Project MIT licensing does not relicense dependencies, native binaries, or services; preserve the distinctions in `THIRD-PARTY.md`.
