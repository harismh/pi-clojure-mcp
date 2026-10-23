# First install and first use

This guide installs the package into Pi and establishes the right application target. The [skill](../skills/repl-driven-development/SKILL.md) is self-contained for normal development once loaded; installation must not depend on a skill that is not discoverable yet.

## Install the package, not just the extension

Prerequisites: pi with native MCP support (tested on 1.3.0), its Node ≥22.19 host, Clojure CLI, Git, and JDK 17 or later (the upstream minimum). Initial dependency resolution needs access to Git/Maven repositories. No TypeScript build, Bun installation, or separate global `-Tmcp` alias is required for normal use. Package development uses Bun ≥1.4.2.

For a released version:

```sh
pi install npm:pi-clojure-mcp@0.1.0

cd /path/to/your/clojure-project
pi
```

Or try it without installing:

```sh
cd /path/to/your/clojure-project
pi -e npm:pi-clojure-mcp@0.1.0
```

These npm commands work after that version is published. For unreleased source, follow the [local checkout instructions](development.md#local-checkout).

Load the **whole package**: it declares both the extension and `repl-driven-development` skill. For a checkout, use its directory rather than just `src/extension.ts`. There is no need to run `bun install` for normal extension use; that is a development setup step.

Use only one installed source for this package. Before switching between a checkout, Git source or npm release, remove the old entry with `pi remove <old-source>`; otherwise both copies may register the same commands/server. Choose a safe session boundary before reloading.

If installing or updating inside an already-running Pi session, resources are rediscovered on `/reload` or a new Pi invocation. **Do not reload casually while a managed REPL contains valuable state:** closing MCP can terminate it. This guide does not restart anything automatically.

## Verify discovery before starting an application

In the running Pi session:

- `/clj` should show package help.
- `/mcp` should show `pi_clojure` and its five tools once the server connects.
- `/skill:repl-driven-development` explicitly loads the development guide; Pi also advertises it for automatic selection.

The full tool names start with `mcp__pi_clojure__`. An existing server named `clojure` is a different registration and may have a different target. This package does not remove or change it.

Use `/mcp` **inside Pi** for extension-registered servers. Shell-level `pi mcp list` does not load extensions and may not list `pi_clojure` even when the session integration is working.

If discovery fails:

| Symptom | Check |
| --- | --- |
| No `/clj` | Package installation/path and enabled extension resources |
| `/clj` works, no skill | Load the package directory; check skill filters/collisions and startup diagnostics |
| No `pi_clojure` tools | Project trust, enabled built-in MCP support, `/mcp` startup errors |
| Slow first startup | Clojure executable/JDK/network and MCP startup errors; the first launch resolves pinned Git/Maven dependencies |
| File-configured `pi_clojure` takes precedence | Inspect the same-name MCP override; do not configure a duplicate unintentionally |

Do not bypass project trust or silently replace a running server to fix discovery.

## Establish a target

Ask the agent:

> Use pi_clojure's runtime_status. Report the selected target, application cwd, ownership and last-reported namespace. Do not start or stop a JVM yet.

`ready=false` with “No selected nREPL” is normal when no target exists. MCP connection is not application readiness. Port discovery lists candidates; it does not select one.

If the intended project already has a REPL, ask the agent to verify and attach to its port. Otherwise explicitly request a fresh managed REPL. Managed startup uses the Pi project's cwd and ordinary project dependencies; it cannot guess custom dev/test aliases or middleware. Prefer the project's documented independent startup command when those are required.

Before loading application code, confirm:

- The integration `project` is the Pi working directory selected at registration.
- Application `cwd`/PID identify the JVM you intend to use; they can differ from the integration project.
- The namespace in status is last evaluation-reported. Query `(ns-name *ns*)` when current context matters.
- The runtime family is appropriate: JVM Clojure tests do not automatically cover a ClojureScript/browser-specific change.

A first meaningful evaluation can inspect the relevant namespace or reproduce a small behavior. There is no requirement to run a ceremonial expression before every task. Follow the live tool schemas and [reference](reference.md) for exact arguments and ownership rules.

## Work on another project without losing a live default

A ready default is not necessarily the right application. Suppose you want a second project while keeping the default JVM and its objects:

1. Leave the default attached. Record its identity/ownership if needed.
2. In another terminal, start the second project's documented dev/nREPL command from that project's directory, with its required aliases/middleware. Use loopback and an available port; do not overwrite an unrelated listener.
3. Use `clojure_eval` with that verified **explicit `port` on every related call**. Do not call `clojure_repl attach` merely to evaluate the second server: replacing a managed default can destroy it.
4. In that explicit-port session, inspect the application context, for example:

   ```clojure
   {:cwd (System/getProperty "user.dir")
    :namespace (str (ns-name *ns*))
    :clojure-version (clojure-version)}
   ```

5. Keep source/dependencies reproducible for that project. Explicit eval ports do not transfer ownership or retarget management: `runtime_status` and `clojure_repl stop` still concern the selected default, not the second server.

If you actually want to replace the default, use the explicit attach/stop workflow and acknowledge any managed state loss. An independently started server is externally owned relative to this package; it survives MCP shutdown and must be supervised separately.

These are setup options, not a development ritual. Once the context is established, use the project's test helpers and small observations to guide the task. See [skill design](skill-design.md) for why verification is chosen by the changed contract rather than by a fixed REPL-to-batch sequence.
