# Development

Requires Bun ≥1.4.2, Clojure CLI, Git and JDK 17 or later, the pinned upstream's minimum. Pi's CLI still uses its supported Node ≥22.19 host; Bun runs this package's TypeScript tooling and tests, not the installed extension.

Validation has been run on macOS with Bun 1.4.2, Node 26.10.0, pi 1.3.0 and Java 25.0.2. JDK 17 and other operating systems have not yet been exercised here. The minimum JDK comes from upstream requirements, not a completed compatibility matrix. No self-attach/JVMTI configuration or stronger interrupt guarantee is assumed.

## Local checkout

```sh
git clone https://github.com/harismh/pi-clojure-mcp.git
cd pi-clojure-mcp
```

Clone instructions require the source to have been pushed. For an existing checkout, start in its package root.

The commands below cover different contracts; select checks for the change. Use the complete set for release validation or changes spanning those contracts, not as a ritual for every edit.

```sh
bun install --frozen-lockfile
clojure -Srepro -P
bun run check
bun test
bun run test:clojure
bun run pack:check
```

To try the checkout from an application directory, use `pi -e /absolute/path/to/pi-clojure-mcp`. Install it persistently with `pi install /absolute/path/to/pi-clojure-mcp`. Load the whole directory to discover the skill as well as the extension, and do not enable a second npm/Git copy at the same time.

No compilation step is required for the extension. Tests use `bun:test` and Bun's native TypeScript support; type checking also runs under Bun. `bun.lock` is the development lockfile. Use `bun install` when intentionally updating dependencies, and keep the host-provided pi/TypeBox APIs as peer dependencies; do not bundle a second pi runtime.

## Development approach

Use the bundled [repl-driven-development skill](../skills/repl-driven-development/SKILL.md) when changing Clojure behavior. Prefer small observations and scoped edits before broad patches; discover existing test helpers, record useful regressions, and verify the affected contracts. A REPL test using the real implementation is not preliminary evidence just because its backend records effects. Separate-process checks are useful for startup/dependency/stale-definition questions, not obligatory finishing steps. Discover APIs rather than hard-coding a workflow, and report honestly when work was batch-first.

| Change | Relevant checks |
| --- | --- |
| Docs, skill structure/routing, links | `bun test ./test/docs.test.ts ./test/skills.test.ts`; package dry run |
| Skill advertising or MCP tool exposure | `bun test ./test/pi-integration.test.ts` exercises real Pi SDK registration and prompt advertising |
| TypeScript/API edits | `bun run check` plus affected Bun tests |
| Clojure evaluation, readiness, ownership/lifecycle | Focused runtime tests and relevant real MCP/process integration tests; use both suites when the changed contracts span them |

The repository's lifecycle tests deliberately own disposable processes because they test startup/shutdown and ownership behavior. That is the boundary under test—not a reason to restart an existing user REPL for unrelated validation.

## Tests

`bun test` includes a real in-process Pi SDK session with Pi’s built-in MCP extension. Offline assistant turns are supplied through the public session store; a test-only parent tool calls `ctx.executeTool`, exercising validation, hooks and actual MCP transport without an LLM or credentials.

That test loads the package manifest, verifies clean skill discovery and on-demand prompt advertising, checks the reminder on all five real MCP tool descriptions while retaining upstream/safety text, and checks exact tool exposure, no implicit startup (even with upstream project auto-start configuration), real status, unchanged evaluation history, metadata/source discovery, scoped function reload preserving the same atom, managed loss acknowledgment, external-process survival, live-target replacement refusal, and managed shutdown. It uses separate ephemeral ports and disposable projects; it never attaches to the developer’s default port 7888.

Pure guidance tests verify that decoration is idempotent and preserves schemas, annotations and executor identity. Runtime tests exercise the real nREPL protocol, verify default-session history/error/namespace preservation, reject a TCP-only listener as not ready, check serialization/request-gate failures and stale snapshots, and validate external detach plus managed lifecycle/alias handling. Test-only access to nREPL’s binding store measures history without another eval changing that history. Production uses upstream/public client APIs.

Tests own their launched processes and clean up only those handles/PIDs. There are no bundled standalone sample applications.

## Changing the upstream pin

Update the Git coordinates in `deps.edn` and the reported revision in `runtime.clj` together. Re-run both test suites, including actual Pi MCP startup and owned-process shutdown. Review the upstream public factories, callback conventions, configuration loading and launcher cleanup; passing type checks cannot validate those Clojure APIs.

Do not silently add fallback startup, a second process owner, an alternative transport, arbitrary project reload policy or thread-stop claims. Upstream schemas are authoritative for upstream tools. Add a dedicated regression before extending lifecycle or isolation guarantees.

See [architecture](architecture.md), [reference](reference.md), and the [release procedure](releasing.md).
