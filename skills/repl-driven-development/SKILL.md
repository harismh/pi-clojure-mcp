---
name: repl-driven-development
description: Guides Clojure development, debugging, and refactoring through small REPL experiments, live data inspection, and state-aware reloads. Use when exploring APIs, designing functions, investigating failures, or changing code in a persistent Clojure runtime.
license: MIT
compatibility: Pi with pi-clojure-mcp loaded and access to an authorized Clojure/nREPL runtime. Consult the live tools for supported runtime capabilities.
---

# Evidence-driven Clojure development

Let observations from the running program inform the next design decision. Do not write a whole speculative implementation and call it REPL-driven because its tests eventually ran in a REPL.

Think about the problem first: inputs, outputs, invariants, data flow, and the important uncertainties. Prefer plain immutable data and small pure transformations, with effects at explicit boundaries. Introduce protocols, macros, or frameworks when the problem warrants them—not merely because the language supports them.

Use this as a default approach, not an eval quota or fixed ceremony. Mechanical edits and documentation may need no runtime experiment. Step back for architectural decisions; fast local feedback does not establish that the overall design is right.

## First use: establish the operating context

This skill assumes the package is loaded; it does not install or restart it. If its tools are unavailable, report that before attempting runtime work.

In Pi, the following names belong to the `mcp__pi_clojure__` tool namespace. Do not accidentally use another ClojureMCP server with a different target.

| Tool | Use |
| --- | --- |
| `runtime_status` | Check actual readiness, ownership, application PID/cwd, and integration project |
| `list_nrepl_ports` | Discover candidate existing servers; discovery does not select one |
| `clojure_repl` | Explicitly attach, start, or stop/detach |
| `clojure_eval` | Evaluate forms and use runtime discovery helpers |
| `paren_repair` | Repair delimiter errors in a source file; review the resulting form |

When establishing a target, use `mcp__pi_clojure__runtime_status`. Recheck after a target change or uncertain context, not before every form. MCP connected does not mean an application REPL is ready. If none is ready, prefer the intended existing project REPL; attach using its verified port. Make a fresh JVM startup explicit when the task calls for one. Never replace a live target merely to fix a connection or namespace problem.

Confirm the integration project, application cwd, and intended runtime. Clojure versus ClojureScript/browser context matters. Status namespace is last evaluation-reported, not a fresh query; use `(ns-name *ns*)` when uncertain.

A ready default may belong to another project. Preserve it when valuable: use a separately started project REPL through the eval tool's explicit `port` for every related call. That does not change the management default or transfer ownership; `runtime_status` still describes the default target. Switching away from a managed default may discard its state and requires the tools' acknowledgment process.

Inspect project instructions, dependencies, dev setup, test commands, and test helpers/fixtures early. Determine which production code their backends exercise and what they simulate. Require a source namespace before switching into it; `in-ns` alone does not load its file. Use deliberate aliases or qualified names. Do not conceal missing dependencies with unrelated REPL definitions or unrecorded classpath changes.

For discovery, the eval tool provides helpers such as:

```clojure
(clj-mcp.repl-tools/help)
(clj-mcp.repl-tools/doc-symbol 'clojure.core/into)
```

Consult relevant docs, metadata, source, and values—not an inventory of the entire runtime. Exact tool schemas and safety contracts remain authoritative. Use Pi's file tools for source editing; do not assume additional upstream editing tools are installed.

## Work in small feedback loops

- **Ask a concrete question.** Identify the uncertain behavior, a representative input, and what would distinguish competing explanations.
- **Probe the smallest useful part.** Evaluate an expression, a candidate function, or a small source change in its real context. Existing code may be better explored through a scoped edit/reload than a separate prototype.
- **Read the complete relevant outcome.** Distinguish returned values from stdout, exceptions, and test failures. Do not infer success from the final printed value. Earlier definitions or effects may survive a later failure.
- **Choose the next change from that evidence.** If the result disagrees with your model, isolate the first failing subexpression or boundary before expanding the patch. Capture useful inputs/results under clear names when they will be reused.
- **Make progress durable.** Save working definitions and discovered regression cases to source promptly; repeat focused checks against the saved code.

Prefer summaries, selected keys, types, and small samples. Printing or inspecting lazy/resource-backed values may do work or cause effects; print limits do not bound execution. Avoid secrets and indiscriminate state dumps. Preserve real values rather than trying to reconstruct them from truncated output.

Remove temporary instrumentation before finishing. Keep intentional exploration examples in a suitable dev namespace or `comment` block, not executable startup forms. A separate namespace reduces name collisions; it is not isolation or rollback.

## Preserve useful state; reload according to the change

Identify valuable objects, resources, and state before editing. Retain an immutable before-value or original object reference when comparison matters. Equality checks behavior/data; `identical?` checks whether an object was retained. Holding a mutable object is not itself a snapshot.

Use the project's existing reload/lifecycle approach. Plain `require` loads a dependency or establishes an alias; it does not necessarily reload edited source. Use explicit `:reload` for an intentional scoped reload, not merely to add aliases for already-loaded dependencies. Choose scope deliberately:

| Change | What to check |
| --- | --- |
| Ordinary function | Reload/evaluate the changed definition; verify the real caller reaches it |
| Captured callback, composed handler, derived value | Existing objects may retain old values; rebuild the affected composition if needed |
| Macro, constant, direct-linked call | Consumers may require recompilation/reload |
| Protocol, record, type, or class | Load definitions before dependent implementations; protocol redefinition can require rebuilding implementations and their instances |
| Namespace removal or broad refresh | Expect possible stale Vars, aliases, and lost state; follow project lifecycle controls |

Do not use `:reload-all`, whole-system refresh, or JVM restart as automatic cleanup. `defonce` is not a universal preservation guarantee: namespace-unloading tools have different semantics. Loading source can itself execute top-level effects. Obtain appropriate approval before destructive experiments, resource replacement, or state loss.

Know which source changes are loaded. A file or source-helper result does not by itself prove that a retained runtime object executes that revision. Verify through the relevant application path.

## Verify the changed contracts

Understand the project's testing architecture before choosing verification. Identify which production code its test helpers exercise, what their backends simulate, and which boundaries remain outside their coverage. Tests run from a REPL are still tests. Check whether helpers mutate retained fixtures before treating older results as independent snapshots.

Turn meaningful discoveries into regression cases. Prefer focused checks that answer the current question; broaden coverage according to affected behavior and project conventions, not as a fixed end-of-task sequence. Use relevant fixtures, broader tests, lint, or build checks where they provide evidence about the change.

Choose verification by the uncertainty:

- **Shared algorithms and data transformations:** exercise them directly, including through the project's existing test backends.
- **Host- or compiler-sensitive changes:** check the affected compilation targets.
- **Browser, platform, or external-system behavior:** test that boundary when the change depends on it; do not infer it from data-only tests.
- **Loading, dependencies, initialization, or suspected stale definitions:** use an appropriate clean-load or separate-process check.

A fresh process tests a particular property—such as reproducible startup—not general correctness. It is not an obligatory final step for every change. **Do not reset the user's working REPL merely to obtain a clean test environment.** Report what the checks establish and any relevant uncertainty left unresolved.

## Failures, lifetime, and handoff

On failure, inspect the cause, relevant exception data, and source context; narrow the reproduction. Fix the cause rather than hiding the exception or repeatedly resetting the environment.

An eval timeout or interrupt acknowledgment is not proof that computation stopped. Do not blindly retry effectful work. Check observable state and use explicit ownership/lifecycle controls when necessary.

Managed JVMs belong to their MCP server and can be lost on Pi/MCP reload, reconnect, session replacement, or exit. External REPLs are not owned by this package. Conversation navigation does not rewind application state. Follow the current tools' state-loss confirmation rules.

Finish with a concise account of what observations changed the design, what tests actually establish, what remains unverified, and any live objects or processes intentionally retained. Distinguish a planned demonstration from a discovered defect, and batch-first work from genuinely feedback-driven development. If no usable REPL was available, say so and explain the fallback.
