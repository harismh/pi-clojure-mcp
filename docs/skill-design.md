# Skill design

The [development skill](../skills/repl-driven-development/SKILL.md) is the canonical operational guide. This document explains its design; normal use does not require reading it or following its references.

## Delivery and scope

Pi advertises the skill's routing metadata and loads the full body on demand. All five tool descriptions carry the same short reminder, while their original schemas, executors, results and safety contracts remain intact. The skill guides development decisions; it does not add runtime capabilities or enforce a workflow.

Installation and project targeting belong in [first use](first-use.md). Detailed development instructions live in the skill rather than being repeated in every tool call or result.

## Design principles

- **Useful feedback, not ceremony.** Ask a discriminating question and inspect the smallest relevant behavior before expanding a patch. Eval counts do not measure progress, and documentation or mechanical edits may need no runtime experiment.
- **Reason about the design.** Data, invariants, algorithms and effect boundaries come first. Fast local observations help refine a model; they do not establish that the overall architecture is right.
- **Make context explicit.** MCP connectivity, application readiness, project cwd and namespace are different facts. An explicit eval port can address a different application without changing the management default.
- **Preserve valuable state deliberately.** Ordinary function replacement, captured callbacks, macros, protocols and namespace removal have different reload consequences. Equality, object identity and immutable snapshots answer different questions; retained mutable references are not snapshots.
- **Verify the affected contract.** Learn which production paths the project's helpers exercise and what their backends simulate. A recording backend can test real algorithms. Compiler, browser, external-system and clean-loading checks are useful when those boundaries are affected—not because they occupy a higher rung than REPL-run tests.
- **Keep observations bounded.** Inspect useful projections and retain real values rather than relying on truncated output. Printing lazy or resource-backed values can execute work; output limits do not bound execution.
- **Make discoveries durable and claims precise.** Save definitions and regressions, track what source is loaded, and distinguish observations from assumptions. A passing test or planned demonstration does not establish unrelated lifetime, isolation or reload guarantees.

Project-specific workarounds belong in project source, tests and documentation. The general guide should not accumulate a catalogue of every framework or compiler encountered.

## Evaluating revisions

Assess outcomes on representative tasks:

| Situation | Desired behavior |
| --- | --- |
| Missing or wrong project runtime | Identify the intended target without silently replacing valuable state |
| Unfamiliar library boundary | Use a relevant probe before a speculative broad patch; preserve useful regression evidence |
| Retained objects or callbacks | Choose reload scope deliberately and make accurate identity/migration claims |
| Project-specific test backend | Recognize the production code exercised and the boundaries left untested |
| Suspected stale definitions or missing dependencies | Justify a clean-load check without resetting the useful working process |
| Documentation-only change | Inspect and check the changed material without ceremonial evals |

Evaluate correctness, useful feedback, reproducibility, state preservation, accuracy of claims and tool/output cost. Discovery and reminder tests verify delivery, not agent adherence or productivity. Comparative effectiveness claims need comparable tasks and baseline evaluations across the models actually used.

## References

- [Clojure REPL guidelines](https://clojure.org/guides/repl/guidelines_for_repl_aided_development): deliberate planning, incremental exploration, durable discoveries and complementary testing tools.
- [Namespace navigation](https://clojure.org/guides/repl/navigating_namespaces) and [REPL workflow](https://clojure.org/guides/repl/enhancing_your_repl_workflow): loading, captured values and lifecycle-aware programs.
- [Stuart Halloway: REPL Debugging—No Stacktrace Required](https://cognitect.com/blog/2017/6/5/repl-debugging-no-stacktrace-required): combine reasoning with small experiments that isolate uncertainty.
- [tools.namespace](https://github.com/clojure/tools.namespace#reloading-code-motivation) and [clj-reload](https://github.com/tonsky/clj-reload): dependency order, stale references and differing retention semantics.
- [nREPL/JVMTI documentation](https://nrepl.org/nrepl/installation.html#jvmti): interruption depends on runtime configuration, not merely a client acknowledgment.
- [Agent Skills specification](https://agentskills.io/specification), [authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) and [context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents): clear routing, progressive disclosure and behavior-based evaluation.
- [Dmitri Sotnikov: Clojure in the Age of Language Models](https://yogthos.net/posts/2026-10-07-clojure-llms.html): data-oriented design and short feedback loops, not a general safe-reload guarantee.

The pinned upstream implementation and this package's [runtime contracts](reference.md) define the available capabilities; broader upstream toolkit instructions are not assumed to apply.
