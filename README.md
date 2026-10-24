# pi-clojure-mcp

**Persistent, project-aware Clojure development inside [Pi](https://github.com/earendil-works/pi).**

Connect Pi to an existing nREPL or explicitly start a managed one. Let your coding agent inspect live namespaces, run project tests, make focused edits, and verify behavior in the same running application.

```text
                                                .+++######+++.
    ##################                        +################+.
    ##################                      +++++++##++++########+
    ##################                       .+++    +++++..+######.
    ######      ######                    .+###+ .++. +++++++ +#####.
    ######      ######                   .####+ +++++..+++++++ +####+
    ######      ######            <->    +####..++++++ +++++++..#####
    ############      ######             +####..+++++.. ++++++. #####
    ############      ######             +####+ ++++ ++..+++++ +####+
    ############      ######              +####+ .+..+++. +++ +###++
    ######            ######              .+####++. .++++     ..
    ######            ######                +######+++++++++++++++
    ######            ######                 .++###############+.
                                                .++++####++++.

             pi.dev                                Clojure
```

Uses upstream [ClojureMCP](https://github.com/bhauman/clojure-mcp) for evaluation, adding:

- **nREPL management** — attach to existing REPLs or explicitly start one, with clear readiness, ownership and lifecycle controls.
- **Agent steering** — the `repl-driven-development` skill encourages discovery and exploration over batch-then-test workflows.
- **REPL feedback** — highlighted forms, recorded request timing, expandable output and readable runtime-identity cards.

> [!NOTE]
> **AI disclosure:** Scope was set by me. Development was done by OpenAI’s `gpt-6.1-sol`. Upstream libraries are all credited in [NOTICE](NOTICE).

## Why this exists

Pi provides MCP tools; ClojureMCP provides Clojure evaluation. Using them together raises practical questions: **What is connected? Is it ready? Who owns it? What happens if I reload?**

This package makes those answers visible and gives the agent explicit lifecycle controls. Connecting starts the MCP integration server, which runs on the JVM; starting an **application REPL** is a separate, opt-in action.

### Choose your path

- **New here:** [Quick start](#quick-start)
- **Already run nREPL:** [Attach an existing REPL](docs/first-use.md#attach-an-existing-repl)
- **Want Pi to start Clojure:** [Start a managed REPL](docs/first-use.md#start-a-managed-repl)
- **Working across projects:** [Multi-project workflow](docs/first-use.md#work-on-another-project-without-losing-a-live-default)
- **Discovery failing:** [Troubleshooting](docs/first-use.md#troubleshooting)
- **Contributing:** [Development](docs/development.md)

## Quick start

With the [prerequisites](#prerequisites) ready:

1. Install a released version:
   ```sh
   pi install npm:pi-clojure-mcp@0.2.0
   ```
   For unpublished source, use a [local checkout](docs/development.md#local-checkout).
2. Start Pi in your Clojure project:
   ```sh
   cd /path/to/your/clojure-project
   pi
   ```
3. Check `/clj` for help and `/mcp` for the `pi_clojure` server and its five tools. Trust the project when appropriate.
4. Ask the agent to attach to your existing nREPL using its verified port, **or** explicitly start a fresh managed REPL for this project. Have it report readiness, application cwd and ownership.
5. Give it a concrete question about your application. Inspect a relevant value or function, make a focused change, and verify the affected behavior.

**Keep valuable state across Pi reloads by using an external REPL.** See [lifetime choices](#choose-your-repl-lifetime) before choosing managed startup or reloading an existing session.

## Choose your REPL lifetime

| Choose | When | Survives Pi/MCP reload or exit? | Who stops it? |
| --- | --- | --- | --- |
| External nREPL | You run the project's REPL independently; state should outlive Pi | Yes, independently of Pi | You / project tooling; Pi only detaches |
| Managed REPL | You want ClojureMCP to start a fresh application REPL | No | ClojureMCP |

Explicit managed stop/replacement requires state-loss acknowledgment. Pi/MCP shutdown can also end that JVM: reload, exit and crashes have no universal confirmation step, and the heap is not replayed. See [state and safety contracts](docs/reference.md#state-and-safety-boundaries).

## Common actions

| Goal | Action |
| --- | --- |
| Check what is connected and ready | `runtime_status` |
| Use an existing project REPL | `clojure_repl` → `attach` with its verified port |
| Start a fresh application REPL | `clojure_repl` → `start`; it refuses to replace a live target |
| Work in another REPL while keeping the current one | `clojure_eval` with an explicit `port` on every related call |
| Switch from a managed REPL to another server | After approving state loss, `clojure_repl` → `attach` with `confirm_state_loss: true` |

An eval's explicit port addresses that server without changing which target the management tools control. Follow the [multi-project workflow](docs/first-use.md#work-on-another-project-without-losing-a-live-default) when keeping more than one runtime.

## The Pi workflow

Illustrative session, with an external project REPL already selected; the identity values below are examples:

```text
You: Check pi_clojure's runtime status. Don't start or stop an application REPL.

Agent: External nREPL is ready at 127.0.0.1:7888.
       PID: 12345
       cwd: /work/my-app
       namespace (last reported): my-app.core

You: Inspect the function handling checkout totals, reproduce the problem,
     make the smallest fix, and run its project test in the same runtime.
```

Eval calls show requested Clojure code alongside received output; runtime calls show identity and ownership snapshots. Use Pi's native expansion (Ctrl+E by default, or click where supported) for all received text and the original status JSON. Failed requests keep their received error output visible. These [feedback cards](docs/reference.md#repl-feedback) also work in HTML exports; model-facing results stay unchanged.

The [repl-driven-development skill](skills/repl-driven-development/SKILL.md) guides focused experiments, state-aware reloads and durable regression checks. Pi advertises it for on-demand use; `/skill:repl-driven-development` loads it explicitly.

| Tool | Use it to |
| --- | --- |
| `runtime_status` | Confirm readiness, application identity, ownership and last-reported namespace |
| `clojure_repl` | Explicitly start, attach to, detach from or stop a REPL |
| `clojure_eval` | Inspect live values, namespaces and source; evaluate code and project tests |
| `list_nrepl_ports` | Find existing local nREPL servers |
| `paren_repair` | Repair unbalanced Clojure delimiters |

Full tool names start with `mcp__pi_clojure__`. Evaluation, discovery and delimiter repair come from upstream ClojureMCP; use the live tool schemas for arguments. Call `runtime_status` for an updated readiness check: the footer is last-checked information, and the namespace field is last evaluation-reported.

## Prerequisites

**To use the package:**

- Pi with native MCP and tool-renderer support, plus its supported Node runtime; tested with Pi 1.3.0.
- Clojure CLI.
- JDK 17 or later, the pinned upstream's minimum.
- Git and network access for initial dependency resolution.

## Documentation

- [First use and troubleshooting](docs/first-use.md): installation, discovery and project targeting.
- [Reference](docs/reference.md): flags, tool contracts and state-loss boundaries.
- [Architecture](docs/architecture.md): integration and implementation ownership.
- [Development](docs/development.md): contributor setup and checks.
- [Skill design](docs/skill-design.md): rationale and references.
- [Changelog](CHANGELOG.md) and [agent orientation](AGENTS.md).

[MIT license](LICENSE); upstream dependency licenses are described in [NOTICE](NOTICE).
