# pi-clojure-mcp

Persistent Clojure development in [pi](https://github.com/earendil-works/pi), using upstream [ClojureMCP](https://github.com/bhauman/clojure-mcp).

This is a thin integration, not a replacement nREPL client or a ClojureMCP fork. It keeps upstream evaluation, discovery and delimiter repair, and adds **actual runtime readiness, explicit process ownership and opt-in JVM startup**.

## Install and first use

Requires pi with native MCP support (tested on 1.3.0), its Node ≥22.19 host, Clojure CLI, Git and JDK 17 or later (the upstream minimum). Initial Git/Maven dependency resolution needs network access. Bun ≥1.4.2 manages development dependencies, tests and packaging; normal extension use needs no Bun installation, TypeScript build or global `-Tmcp` alias.

```sh
# Install a released version from npm.
pi install npm:pi-clojure-mcp@0.1.0

# Launch Pi from the application project.
cd /path/to/your/clojure-project
pi
```

Or try a released version without installing: `pi -e npm:pi-clojure-mcp@0.1.0` from your application directory. npm commands require the version to have been published; for unreleased source, use a [local checkout](docs/development.md#local-checkout). Trust the project when appropriate; untrusted projects do not trigger MCP registration.

Use one package source at a time. When switching from a checkout to npm, remove the old entry with `pi remove <old-source>` rather than loading both copies. Do this at a safe session boundary; reloading can end managed state.

Inside Pi, `/clj` shows package help, `/mcp` should show `pi_clojure` with five tools once connected, and `/skill:repl-driven-development` loads the guide. Shell-level `pi mcp list` does not load extension registrations. See [first-use troubleshooting](docs/first-use.md) if discovery fails.

For an already-running Pi session, `/reload` rediscovers installed/updated resources—but can terminate a managed application JVM. Preserve valuable state before choosing to reload. Nothing here restarts your runtime automatically.

Then ask:

> Check pi_clojure's runtime status. Attach to my existing local nREPL on port 7888; don't start another JVM.

Or:

> Explicitly start a fresh managed Clojure REPL for this project, then inspect its runtime and available discovery helpers.

**Connecting MCP does not start a REPL.** Without an explicit target, the project’s `.nrepl-port` is discovered. Use `--clojure-port 7888` or `PI_CLOJURE_PORT=7888` to set a target at startup. `/clj` shows help; the agent uses the tools for live checks and management.

## Discover, evaluate, verify

The `pi_clojure` MCP server exposes five tools:

| Tool | Owner / purpose |
| --- | --- |
| `clojure_eval` | Upstream: persistent evaluation and REPL discovery helpers |
| `list_nrepl_ports` | Upstream: find existing servers |
| `paren_repair` | Upstream: repair Clojure delimiters |
| `runtime_status` | Check nREPL protocol readiness, PID/cwd/versions and ownership |
| `clojure_repl` | Explicit `start`, `attach`, or `stop`/detach |

Use the tools’ live descriptions and schemas. Let the agent inspect namespaces, Vars, metadata and source, make a small edit, reload the affected code, and verify it in the same runtime. No fixed reload framework is imposed.

The bundled [repl-driven-development skill](skills/repl-driven-development/SKILL.md) is self-contained for normal use: reason about data, explore uncertain behavior before broad edits, retain useful state, discover project test helpers, and verify the changed contracts. REPL-run tests are real tests; a fresh process is a conditional check of loading or initialization, not an obligatory finish. [Research and trial feedback](docs/skill-design.md) explain the choices.

Every tool description carries a short reminder to consult the skill; the full guide loads on demand rather than being repeated in every call or result. To explicitly load it for a task:

```text
/skill:repl-driven-development investigate this behavior in the running application
```

Install or load the **package directory** to discover both extension and skill. Loading only `src/extension.ts` does not discover its sibling skill. Skills can also be disabled in Pi settings; the reminder is guidance, not enforced loading.

The footer is **last-checked information**, not continuous health monitoring. Namespace is also explicitly last reported by upstream evaluation. Call `runtime_status` for a fresh health check; it does not change evaluation-session history.

## Lifetime matters

- **External REPL:** independently started; detach, MCP reconnect and Pi shutdown never terminate it. Prefer this for state that must outlive Pi.
- **Managed REPL:** ClojureMCP launches it on a fresh loopback port. Stopping/replacing it through `clojure_repl` requires `confirm_state_loss=true`. There is no replay.
- **Managed state ends when MCP closes:** Pi reload/exit, session replacement/fork, or MCP reconnect. Known managed state is confirmed before Pi’s session switch/fork hooks; reload and exit cannot universally be intercepted. Cleanup is best effort on crashes/forced termination or during startup; see [limitations](docs/reference.md#state-and-safety-boundaries).
- Conversation navigation does not restore an earlier application heap. Evaluation is not a sandbox, and a timeout/interrupt acknowledgment is not proof that code stopped.

Existing MCP configuration is not changed. If you already expose another ClojureMCP server, you may disable that duplicate yourself; this package uses the separate name `pi_clojure`.

Working on another project while keeping a live default? Use a separately started project REPL and an explicit eval port rather than silently replacing the default. The [multi-project guide](docs/first-use.md#work-on-another-project-without-losing-a-live-default) explains the ownership and targeting distinction.

## More

- [First install, discovery and project targeting](docs/first-use.md)
- [Skill design, research and evaluation](docs/skill-design.md)
- [Tools, configuration and limitations](docs/reference.md)
- [Ownership and implementation](docs/architecture.md)
- [Development](docs/development.md)
- [Changelog](CHANGELOG.md) and [release procedure](docs/releasing.md)
- [Agent orientation](AGENTS.md)

[MIT license](LICENSE); upstream dependency licenses are described in [NOTICE](NOTICE).
