# First install and first use

Use this guide to install the package, choose an application REPL and resolve discovery problems. For a brief overview, start with the [quick start](../README.md#quick-start).

## Install the package, not just the extension

Using the package requires Pi with native MCP support (tested with 1.3.0), Pi's supported Node runtime, Clojure CLI, Git, and JDK 17 or later, the upstream minimum. Initial dependency resolution needs Git/Maven network access. Bun and a TypeScript build are only development concerns; see [development](development.md) for the tested environment.

For a released version:

```sh
pi install npm:pi-clojure-mcp@0.1.0

cd /path/to/your/clojure-project
pi
```

To try a release without installing it, run `pi -e npm:pi-clojure-mcp@0.1.0` from the application directory. npm commands require that version to have been published; use the [local checkout instructions](development.md#local-checkout) for unreleased source.

The whole package supplies both extension and `repl-driven-development` skill. For a checkout, load its directory rather than just `src/extension.ts`. Keep one installed source at a time: when switching between checkout, Git and npm, remove the previous entry with `pi remove <old-source>` so two copies do not register the same commands/server.

Resources are rediscovered on a new Pi invocation or `/reload`. **Choose a safe session boundary before reloading:** closing MCP can terminate a managed application JVM. For state that should outlive Pi, choose an independently started REPL; see [lifetime choices](../README.md#choose-your-repl-lifetime).

## Verify discovery before starting an application

Inside Pi:

- `/clj` shows package help.
- `/mcp` shows `pi_clojure` and its five tools once the server connects.
- `/skill:repl-driven-development` explicitly loads the development guide; Pi also advertises it for automatic selection.

Tools begin with `mcp__pi_clojure__`. Another server named `clojure` is a separate registration and may address a different runtime. Use `/mcp` inside Pi: shell-level `pi mcp list` does not load extension registrations.

Ask the agent:

> Use pi_clojure's runtime_status. Report readiness, application PID/cwd, ownership and last-reported namespace. Don't start or stop an application REPL yet.

`ready=false` with “No selected nREPL” is normal before choosing a target. The project’s `.nrepl-port` is discovered when available; explicit startup flags can select a target instead. See [configuration](reference.md#configuration).

Read the reported context:

- **Integration project:** the Pi working directory selected at registration.
- **Application PID/cwd:** the actual JVM; it can belong to a different project.
- **Namespace:** last evaluation-reported, not freshly queried by status. Evaluate `(ns-name *ns*)` when current namespace matters.
- **Runtime family:** select the environment the task needs; JVM Clojure checks alone do not establish ClojureScript/browser-specific behavior.

## Attach an existing REPL

Use this path when the project already has a running REPL, or when state should survive Pi sessions. Start it using the project's documented dev/nREPL command, including its required aliases and middleware.

If the port is uncertain, ask the agent to discover local servers and identify the intended project. Discovery lists candidates; attaching selects one.

With the intended port verified, ask:

> Attach to my project's existing nREPL on port 7888. Check the target's identity and any current managed ownership before replacing a connection.

Replace `7888` with your project's port. If another managed target would be discarded, obtain state-loss approval before proceeding. If you want to keep both, use the [multi-project workflow](#work-on-another-project-without-losing-a-live-default) instead.

After attaching, have the agent check the application cwd and ownership, then inspect relevant project code or run a focused project test. Pi detaches from an external process without terminating it; its lifetime remains your project's responsibility.

## Start a managed REPL

Use this path for a fresh application REPL whose lifetime can be tied to Pi/MCP:

> Explicitly start a fresh managed Clojure REPL for this project, then report its readiness, PID/cwd and ownership.

Startup uses the integration project's cwd and ordinary dependencies, adds nREPL, and selects an ephemeral loopback port. An existing live target is preserved rather than silently replaced.

For custom dev/test aliases or middleware, prefer the project's independent startup command and [attach](#attach-an-existing-repl). Managed startup does not infer that setup.

The managed JVM ends with its MCP server, including on Pi reload/exit or session replacement. Explicit managed stop/replacement requires acknowledgment; other shutdown paths lack a universal confirmation step. See the [exact lifecycle contracts](reference.md#state-and-safety-boundaries) before relying on retained state.

## Work on another project without losing a live default

Keep the current target when its state is valuable:

1. Leave it attached; record its identity/ownership if needed.
2. In another terminal, start the second project's documented dev/nREPL command from its directory with the required aliases/middleware. Use loopback and an available port.
3. Use `clojure_eval` with that verified **explicit `port` on every related call**. Attaching a new management target is unnecessary for this and could discard a managed JVM.
4. Inspect the second application's context in that explicit-port session, for example:

   ```clojure
   {:cwd (System/getProperty "user.dir")
    :namespace (str (ns-name *ns*))
    :clojure-version (clojure-version)}
   ```

5. Keep setup/dependencies reproducible. Explicit-port evaluation leaves management pointing at the original target: `runtime_status` and `clojure_repl stop` still concern that target, not the second server.

The independently started server remains externally owned and must be supervised separately. To replace the management target intentionally, follow the attach workflow and acknowledge any managed state loss.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No `/clj` | Package installation/path and enabled extension resources |
| `/clj` works, no skill | Whole-package loading, skill filters/collisions and startup diagnostics |
| No `pi_clojure` tools | Project trust, enabled built-in MCP support and `/mcp` startup errors |
| Server connected, application not ready | Choose the intended existing REPL or explicitly start one; inspect the status reason |
| Slow first startup | Clojure executable/JDK/network and MCP startup errors; the first launch resolves pinned Git/Maven dependencies |
| Wrong application cwd | Identify the intended REPL; preserve a valuable current target using explicit-port evaluation |
| File-configured `pi_clojure` takes precedence | Inspect the same-name MCP override before configuring another copy |

Trust the project when appropriate. Resolve setup errors without bypassing trust or silently replacing a running application. For exact flags, ownership rules and tool arguments, use the [reference](reference.md) and live tool schemas.
