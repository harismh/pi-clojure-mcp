# pi-clojure-mcp

Thin integration around pinned upstream ClojureMCP for persistent Clojure development.

- Start at `README.md`; contracts are in `docs/reference.md`, ownership in `docs/architecture.md`.
- Pi owns MCP transport/registration. Upstream ClojureMCP owns evaluation/discovery and is the sole managed-JVM launcher/supervisor.
- Preserve upstream tool schemas/results. No implicit JVM launch, hidden target replacement, or external-process termination.
- Managed heap loss through management tools requires explicit acknowledgment. Managed state also ends with its MCP server; do not claim persistence across Pi reload/session replacement.
- Health probes must not alter evaluation-session namespace/history/errors. Namespace displayed by status is last evaluation-reported, not freshly queried.
- Evaluations share application state and have full filesystem/process access. Failures do not undo earlier effects; timeouts or interrupt acknowledgments do not prove execution stopped.
- For Clojure coding/debugging, read `skills/repl-driven-development/SKILL.md`. Let useful observations guide design; discover project test helpers, capture regressions, and verify the changed contracts. REPL-run tests are real tests; separate-process validation is conditional, not a mandatory finish.
- Discover program details through the live runtime and authoritative tool schemas. Keep the full philosophy in the on-demand skill and only a short shared cue in tool descriptions; do not add per-call/result boilerplate or duplicate the guide.
- Select checks by the affected contract; see `docs/development.md`. Use Bun for dependency management and TypeScript tests (`bun install --frozen-lockfile`, `bun run check`, `bun test`). Other checks include `bun run test:clojure` and `bun run pack:check`. Docs/skill changes have focused link/discovery tests; release or cross-contract changes warrant broader validation.
- Tests use their own ephemeral ports and process handles. Never restart or stop an existing user REPL for development convenience.
