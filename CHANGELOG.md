# Changelog

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
