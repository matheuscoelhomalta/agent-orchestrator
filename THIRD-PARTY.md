# Third-party software and services

Agent Orchestrator is an independent project. Provider and project names identify interoperability; they do not imply sponsorship or endorsement. A license for this repository does not relicense its dependencies, native binaries, models, or hosted services.

## Direct runtime dependencies

The pinned versions and their package license declarations were inspected on 2026-09-28:

| Package | Version | License | Upstream |
|---|---|---|---|
| `acpx` | 0.19.3 | MIT | [openclaw/acpx](https://github.com/openclaw/acpx) |
| `@agentclientprotocol/codex-acp` | 1.13.1 | Apache-2.0 | [agentclientprotocol/codex-acp](https://github.com/agentclientprotocol/codex-acp) |
| `@agentclientprotocol/claude-agent-acp` | 0.81.2 | Apache-2.0 | [agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp) |

`package-lock.json` records the transitive dependency graph. Preserve the license and notice files shipped with each package if redistributing dependencies. This table is not a claim that all transitive packages share these licenses.

## Claude SDK and native software

The dependency graph includes `@anthropic-ai/claude-agent-sdk` 0.3.280 and platform-specific native packages. Their metadata refers to license terms in the package README/license files. The installed native license states that use is governed by Anthropic's agreements; these packages are not covered by this project's license.

Review [Anthropic's legal and compliance guidance](https://code.claude.com/docs/en/legal-and-compliance) for your account and deployment. It distinguishes using an unmodified native binary with an end user's own authentication from intermediating other users' subscription credentials. This project does not collect, distribute, or replace native account credentials.

The source repository does not include `node_modules` or native session stores. Installing dependencies downloads separate third-party software. Native harnesses and hosted models remain subject to their providers' terms, data policies, availability, and charges.

## Antigravity integration

The optional integration invokes the installed, unmodified `agy` executable through its headless CLI; it does not extract OAuth tokens or use a separate ACP connector. This implementation detail is not a determination that the integration is permitted for every account or use case.

[Google Antigravity's additional terms](https://antigravity.google/terms), checked on 2026-09-28, contain restrictions on third-party tools accessing the service, with separate agreements applying to some enterprise access. No authoritative exemption for this supervisor has been established. Confirm that your applicable agreement permits your use before running this optional integration. The historical live tests establish observed behavior, not provider authorization.
