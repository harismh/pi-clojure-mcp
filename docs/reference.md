# Reference

## Configuration

For installation, discovery checks, and working on a second project without resetting a live default, see [first use](first-use.md).

The `pi-clojure-mcp` package registers the server as `pi_clojure` with pi’s built-in MCP integration. The package name does not change the MCP tool prefix, `/clj` command, configuration flags or Clojure namespaces. Do not add a second MCP configuration entry with that same name: file-configured servers can override extension registrations.

| Pi flag | Environment | Default |
| --- | --- | --- |
| `--clojure-command` | `PI_CLOJURE_COMMAND` | `clojure` |
| `--clojure-host` | `PI_CLOJURE_HOST` | `127.0.0.1` |
| `--clojure-port` | `PI_CLOJURE_PORT` | Discover the project’s `.nrepl-port` |

Flags take precedence. The command is one executable path, not a shell expression. Hosts are limited to `127.0.0.1`, `localhost`, and `::1`. Use an SSH tunnel for remote targets; unauthenticated nREPL is not safe to expose publicly.

The MCP server’s dependency resolution runs from this package’s directory using `-Srepro`. Its project is the Pi working directory passed explicitly at registration. The selected application JVM’s actual cwd is reported separately. Registration is skipped for untrusted Pi projects; trust the project before loading it.

The MCP integration server runs in its own JVM. Application REPL startup is a separate, explicit action: upstream project `:start-nrepl-cmd`/fallback configuration cannot trigger it implicitly. Other upstream ClojureMCP project configuration still applies. Trust project dependencies/configuration before executing code.

This package pins ClojureMCP v0.6.0, revision `2b0213f079ab59e3b204c539ead12b63db54e223`. It does not depend on the revision installed under your global `-Tmcp` alias.

## Tools

Full Pi names have the prefix `mcp__pi_clojure__`. The three upstream tools retain their schemas and original description text; inspect those rather than relying on copied documentation. All five descriptions append the same short REPL-first skill reminder. Schemas, safety contracts, executors and results are not changed by that reminder.

### `runtime_status`

Arguments: `{}`.

Returns JSON containing:

- `mcp`: availability of the server answering the tool call.
- `ready`, `reason`: whether the selected listener actually answers nREPL `describe` with evaluation support; TCP listening alone is insufficient.
- `project`, `host`, `port`: integration project and selected target.
- `ownership`: `none`, `external`, or `managed`; `managedPid` identifies the owned process.
- `pid`, `cwd`, `clojureVersion`, `javaVersion`: bounded, separately queried runtime metadata. Metadata failures are reported as `metadataError`; protocol readiness alone can still be true.
- `namespace`, `namespaceSource`: last evaluation-reported default-session namespace, possibly null or obsolete after an external server restart. This is not a fresh inspection of the evaluation session.
- `activeRequests`: active/queued upstream evaluation **requests**, not a count of live application threads.
- `changing`, `generation`, `observedAt`, `stale`: snapshot provenance. A concurrent target transition makes a snapshot explicitly stale.

Readiness and metadata checks use an independent connection and ephemeral session, preserving the default evaluation session’s namespace, `*1`, `*2`, `*3`, and `*e` without initializing application helpers. Readiness establishes nREPL protocol support; application-level behavior needs its own checks.

The Pi footer labels its cached snapshot **last checked**. Evaluation or a failed management result invalidates that snapshot. Call `runtime_status` to refresh it.

### `clojure_repl`

| Action | Arguments | Effect |
| --- | --- | --- |
| `start` | `{"action":"start"}` | Explicitly launch one local application JVM using the project’s dependencies and nREPL 1.7.0 on an ephemeral port. Refuses a live selected target or an already-owned JVM. |
| `attach` | `{"action":"attach","port":7888,"host":"127.0.0.1"}` | Probe and select an existing server. Host is optional. Does not own that process. |
| `stop` | `{"action":"stop"}` | Detach from an external server; or terminate the managed JVM after acknowledgment. |

To stop a managed JVM, or replace it with a different target, include `"confirm_state_loss":true`. This discards the owned application heap and interactive history, without replay. The replacement is probed before the owned JVM is stopped. Attaching to the same managed endpoint retains ownership.

Only `attach` accepts host/port. `stop` affects the **selected default target**, not an arbitrary port. Active or queued evaluation requests prevent target changes. Starting does not create or overwrite a project’s `.nrepl-port`. After explicit detach, that file is not silently rediscovered; attach/start or an explicitly ported upstream evaluation is required.

The selected default target and an upstream `clojure_eval` call’s optional explicit port are distinct: evaluating another port does not transfer ownership or change the default target. `runtime_status` reports the default target. Use the same verified explicit port on every related call when preserving the default while working in another project; inspect that explicit-port session's actual cwd/namespace. See the [multi-project workflow](first-use.md#work-on-another-project-without-losing-a-live-default).

### `/clj`

Human-oriented help plus last-checked status. It does not run an evaluation or launch a process. Ask the agent to use the MCP tools for those actions.

## REPL feedback

Pi's native tool renderers provide cards for `clojure_eval`, `runtime_status` and `clojure_repl` in the interactive transcript and HTML exports. They change presentation only: the five tools, execution, model-facing content and codemode results retain their original contracts. Discovery and delimiter-repair tools keep Pi's standard presentation.

- **Evaluation:** requested code is highlighted as Clojure, with an explicit-port routing label or `default target`. Input and successful-output previews are bounded by display lines. Expansion reveals the complete requested code, remaining arguments and received text.
- **Runtime snapshots:** recognized status JSON becomes a card with readiness, ownership, endpoint, application PID/cwd, integration project, last evaluation-reported namespace and last-checked time. Stale snapshots and unavailable metadata are labeled. Expansion includes the original JSON. Unrecognized or additional output stays as received text.
- **Errors:** failed requests show all received text even while collapsed, preserving intermediate errors and subsequent values. Request completion means the tool returned, not that project tests passed or a timed-out computation stopped.
- **Timing:** elapsed request time comes from Pi's recorded duration, including transport/queue overhead. It is omitted when unavailable, including in some exports/older sessions.

Use Pi's native expansion action (Ctrl+E by default, or click where supported). Pi's existing output limits still apply; saved full-output paths remain visible and the renderer never opens those files automatically. Terminal controls are escaped in the view while original payloads stay unchanged. Exception output can therefore remain lengthy.

Cards use the stored request/result, not today's target cache. `default target` is a routing description, not a claim about the current JVM. Viewing history or exporting it performs no runtime checks or extra evaluations. Direct MCP transcript calls get these cards; nested calls through codemode or another tool retain their parent's presentation.

Upstream evaluation returns formatted text: these cards preserve its ordering and expression dividers rather than trying to reconstruct stdout/stderr channels. They are not a live object inspector or a source of continuous streaming output. See [architecture](architecture.md#feedback-presentation) for the implementation boundary.

## Development guidance

The optional [repl-driven-development skill](../skills/repl-driven-development/SKILL.md) is the agent's development guide. Pi advertises it for on-demand use; `/skill:repl-driven-development` loads it explicitly. Tool descriptions and schemas retain their safety contracts whether or not the skill is loaded. See [first use](first-use.md) for resource discovery, [architecture](architecture.md#development-guidance) for delivery mechanics, and [design notes](skill-design.md) for rationale.

## State and safety boundaries

- ClojureMCP is the only application-JVM launcher/supervisor. The TypeScript extension does not spawn another runtime.
- Managed JVMs belong to their MCP server. Pi reload/exit, new/resumed/forked sessions, MCP reconnect and crashes can end them. Use an independently started nREPL for durability across those boundaries.
- Cleanup uses upstream shutdown hooks after startup, not OS-level parent/child lifetime enforcement. Force-killing/crashing MCP, or closing it during the launcher’s startup window, can leave an orphaned process. Check the exact launched PID before any manual cleanup; never kill an arbitrary discovered server.
- For known managed state, session-switch/fork hooks request confirmation. With no confirmation UI, those hooks cancel the transition; explicitly stop the managed JVM first. Reload/exit/crash do not have a universal cancellable preflight hook.
- Pi owns MCP transport/registration/permissions. A tool’s acknowledgment field is not an OS security boundary against arbitrary shell or Clojure code.
- Evaluation has full process/filesystem access. Namespaces and nREPL sessions do not isolate the JVM heap; failed evaluations do not undo earlier definitions or external effects.
- An eval timeout may leave code running and mutating state. Zero active requests does not prove quiescence. Target changes can be retried after requests finish; if a managed JVM is irrecoverably busy, explicitly closing its MCP server destroys that entire JVM.
- Reload semantics belong to Clojure and the chosen project tooling. Function reloads may preserve state; protocol/record/class replacement can leave stale objects and references. No general reload-safety guarantee is made.
- Upstream result text, intermediate errors and discovery helpers remain visible. There is no second formatter hiding errors.

See [architecture](architecture.md) for the implementation boundaries and [development](development.md) for executable coverage.
