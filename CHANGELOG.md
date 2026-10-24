# Changelog

## 0.2.0

- Native Pi feedback cards for evaluation, runtime status and REPL management, without changing tool schemas, executors or model/codemode results.
- Syntax-highlighted requested code, recorded request timing, bounded successful-output previews and native expansion for received output.
- Runtime-identity snapshots with explicit readiness, ownership, stale/last-checked provenance and last-reported namespace labels.
- Failed requests retain all received error text, including errors between successful forms. Unknown result shapes stay readable; images retain Pi's normal renderer.
- History and HTML-export rendering without reconnecting or probing application REPLs; rendering issues no extra evaluations or file reads.
- Renderer coverage for narrow terminals, Unicode, terminal-control escaping, theme changes, payload preservation, saved sessions and real MCP results in JSON mode.

Streaming stdout/stderr, live object inspection and an always-on panel are outside this release. Existing runtime ownership and state-loss rules are unchanged.

## 0.1.0

Initial release.

- Thin Pi integration around pinned ClojureMCP v0.6.0, retaining upstream evaluation, discovery and delimiter repair.
- Runtime readiness checks with PID/cwd/version metadata and last-reported namespace provenance, without changing evaluation history.
- Explicit managed JVM startup, external nREPL attachment, ownership-aware stop/detach, and state-loss acknowledgment.
- Last-checked status display and session-navigation/lifetime warnings.
- Bundled `repl-driven-development` skill with question-driven experiments, state-aware reload guidance and verification by changed contract.
- Bun-based development checks and real Pi/MCP integration tests using disposable processes.

### Important boundaries

- Application startup is opt-in. Managed JVMs belong to their MCP server and may end on Pi reload/exit, session replacement or reconnect; no heap replay is provided.
- External REPLs are not terminated by this package. Evaluation is not sandboxed, and a timeout or interrupt acknowledgment does not prove execution stopped.
- See [runtime contracts](docs/reference.md) for details and [NOTICE](NOTICE) for dependency licensing.
