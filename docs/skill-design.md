# Skill design and evidence

The [development skill](../skills/repl-driven-development/SKILL.md) is the canonical operational guide. Normal use does not require following a link or reading this background document. The full body loads on demand; all five tool descriptions carry only a short shared cue. Tool safety contracts remain authoritative independently of the skill.

## Design choices

- **Questions before broad patches.** Identify an uncertainty and a useful observation, not a quota of eval calls. Reason about data, invariants, algorithms, and architectural boundaries; rapid local feedback is not a substitute for design.
- **Concrete first-use orientation.** Name the available tools, distinguish MCP availability from application readiness, and distinguish the management default from explicitly ported evaluations. Detailed installation and multi-project routing belong in [first use](first-use.md).
- **Inspect the project's testing model.** A recording backend may exercise real production reconciliation. Tests run from a REPL are not second-class tests, and a browser/new process is not automatically a stronger check of the same contract.
- **Verification by uncertainty.** Shared algorithms, compiler-specific behavior, browser/external boundaries, and source-loading reproducibility call for different evidence. Fresh-process checks are conditional, not a compulsory finish. Never reset a valuable working REPL just to make tests clean.
- **State-aware reload.** Ordinary function changes, captured callbacks, macros, protocols, types, and namespace unloading have different consequences. Follow project lifecycle conventions rather than prescribing one reload command for everything.
- **Bounded observation.** Retain useful values and inspect relevant projections. Mutable references are not snapshots; test helpers can mutate retained fixtures; printing lazy/resource-backed values can execute work.
- **Durability and honest reporting.** Persist code and regressions, track what is loaded, and say which observations actually changed the design. Passing tests and planned demonstrations are not evidence for unrelated runtime guarantees.

The guide deliberately contains no Cherry-specific workaround, mandatory framework, fixed eval count, prescribed reporting template, or growing catalogue of every encountered edge case. Project-specific lessons belong in source, tests, and project documentation.

## Sources informing the guide

- [Clojure REPL introduction](https://clojure.org/guides/repl/introduction) and [guidelines for REPL-aided development](https://clojure.org/guides/repl/guidelines_for_repl_aided_development): incremental exploration, deliberate planning, preserving discoveries, and complementary testing tools.
- [Navigating namespaces](https://clojure.org/guides/repl/navigating_namespaces) and [enhancing the REPL workflow](https://clojure.org/guides/repl/enhancing_your_repl_workflow): loading versus namespace creation, captured function values, derived Vars, and lifecycle-aware programs.
- [Stuart Halloway: REPL Debugging—No Stacktrace Required](https://cognitect.com/blog/2017/6/5/repl-debugging-no-stacktrace-required): combine reasoning with small experiments that isolate uncertainty.
- [tools.namespace](https://github.com/clojure/tools.namespace#reloading-code-motivation) and [clj-reload](https://github.com/tonsky/clj-reload): dependency order, stale references, macro consumers, protocol instances, removed definitions, and differing retention semantics.
- [nREPL installation/JVMTI documentation](https://nrepl.org/nrepl/installation.html#jvmti): interruption depends on runtime configuration; no general stopped-execution guarantee follows from a client timeout.
- [Agent Skills specification](https://agentskills.io/specification) and [skill authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): clear routing metadata, concise instructions, appropriate degrees of freedom, and behavior-based evaluation.
- [Effective context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents): avoid both brittle scripts disguised as prompts and vague advice; retain high-signal context and discover detail as needed.
- [Dmitri Sotnikov: Clojure in the Age of Language Models](https://yogthos.net/posts/2026-10-07-clojure-llms.html): data-oriented design, short verification loops, and avoiding costly state reconstruction. This is motivation, not proof of arbitrary serialization or universally safe hot replacement.

The pinned ClojureMCP implementation and pi-clojure-mcp's [runtime contracts](reference.md) were also checked. Upstream full-toolkit instructions are not copied blindly into this deliberately small Pi integration.

## What the trials establish

Tic-tac-toe exposed a batch-first approach despite later successful live reload. The combobox exploration used actual serialization and retained-state probes, and encountered a real protocol/record reload boundary. These were useful observations, not controlled measurements of skill effectiveness.

A subsequent local Replicant/Garden trial discovered the library's recording renderer and used it to inspect real reconciliation before modifying source. A conversion prototype preserved an element and avoided redundant mutations. Regression tests reused the project's incremental-versus-fresh invariant for 100 style transitions. Separate compilation targets exposed portability issues the JVM REPL could not establish.

That trial supported verification by changed contract—not a mandatory progression toward broader or colder testing. It did not establish browser behavior, performance improvement, or universal agent adherence. No controlled with/without-skill comparison or cross-model evaluation was run.

## Evaluating future revisions

Use fresh agents on comparable tasks, with and without the skill, across the models actually used:

| Scenario | Look for |
| --- | --- |
| Missing/wrong project runtime | Correct target identification without silently replacing a live JVM |
| Unfamiliar library boundary | A relevant probe before a speculative broad patch; durable regression evidence |
| Existing protocol-backed objects | Deliberate reload scope and truthful migration/identity claims |
| Project-specific recording/test backend | Recognition of the real production path and the backend's limits |
| Retained definitions concealing a loading problem | A justified clean-load check without resetting the useful working process |
| Documentation-only/mechanical task | Inspection and appropriate checks without ceremonial evals or runtime changes |

Assess task correctness, useful feedback, source reproducibility, unauthorized state loss, accuracy of claims, and tool/output cost. Count neither REPL calls nor process restarts as success metrics. Format, discovery, packaging, and reminder tests are separate checks; they do not prove behavioral effectiveness.
