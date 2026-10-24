# Architecture

```text
Pi / built-in MCP
  └─ src/extension.ts: registration, cached UI, session warnings/confirmation
       └─ pinned ClojureMCP server (clojure/src/pi_clojure/main.clj)
            ├─ upstream tools: evaluation, discovery, delimiter repair
            └─ runtime.clj: health and explicit ownership policy
                 ├─ attach → existing external nREPL (never terminated)
                 └─ explicit start → upstream launcher → owned local JVM
```

## What is reused

`pi-clojure-mcp` is a thin integration around upstream ClojureMCP, not a fork or a replacement nREPL client.

Pi supplies MCP stdio transport, server/tool registration, permissions, exposure and cleanup. ClojureMCP supplies the nREPL client/session machinery, evaluation/discovery helper initialization, tool definitions, output formatting, port discovery, delimiter repair and process launcher/shutdown hook. This package contains neither a new bencode implementation nor a replacement MCP/nREPL transport.

`main.clj` assembles upstream’s tool factories and adds two tool maps. It deliberately bypasses the convenience startup wrapper that can automatically launch processes from project configuration. The `:repl` profile is narrow: Pi remains the editor/search/shell harness. The upstream version is pinned because these integration APIs are not assumed stable across revisions.

`runtime.clj` keeps only control-plane state: selected target, process handle, request count and transition generation. ClojureMCP retains namespace/session data and the application JVM retains application values. Exactly one component launches and supervises a managed application JVM: the upstream launcher, including its shutdown hook. There is no second TypeScript supervisor.

## Development guidance

The package manifest declares `skills/repl-driven-development/SKILL.md` alongside the extension. Pi advertises its routing metadata and loads the guide on demand. Installation/resource discovery is covered in [first use](first-use.md); the guide's rationale is in [skill design](skill-design.md).

`guidance.clj` appends one short shared reminder to all five tool descriptions and the server instructions. Original description text and safety contracts remain intact; tool schemas, executors, annotations and result formatting are unchanged by this decoration. There is no per-call prompt rewrite, result footer, compulsory skill loader or added tool. Direct tools therefore carry the cue even when a client does not surface server instructions. Detailed advice lives only in the skill.

## Feedback presentation

`src/renderers.ts` attaches `renderCall`/`renderResult` through Pi's `registerToolRenderer` resolver for the three feedback-heavy tools. It does not re-register tools, wrap executors, change results or maintain another connection. Remaining tools and non-text results delegate to Pi's standard renderers. `@earendil-works/pi-tui` is host-provided and declared as a `"*"` peer dependency.

Native components use Pi's themes, Clojure highlighter, wrapping/column utilities, default tool shell and expansion controls. Layout caches retain one width and are cleared by invalidation. Large input skips expensive highlighting; successful previews are bounded by visual lines, while failed requests retain the received text. Terminal controls are escaped only for display.

Cards depend on stored arguments/results and supplied execution metadata, not mutable global target state. Completion/timing are rendered with the result because HTML call rendering can run before final context exists. Unsupported status schemas stay raw. No rendering path evaluates Clojure, polls health, reads full-output files or fetches live objects. TUI rendering, JSON/RPC/print output and model-facing tool results remain separate concerns.

See [feedback contracts](reference.md#repl-feedback) for visible behavior and limits.

## Evaluation and transitions

The upstream evaluation tool is wrapped without replacing its input schema, evaluator, discovery helpers or result formatting. A request gate prevents target changes while eval requests are active/queued; a lock also serializes first-use helper initialization. Callback completion and failures release the request count. Health requests use their own connections and remain available while an application request is busy.

Readiness first requires an actual completed nREPL `describe`, then optionally collects bounded PID/cwd/version metadata through an ephemeral session. This avoids contaminating the default session’s history/error/namespace and avoids initializing application helper namespaces merely to inspect health.

The gate tracks client requests, not all effects of submitted application code. A timed-out computation may still run. This design intentionally does not invent stronger cancellation or isolation guarantees than the underlying runtime supplies.

`attach` validates the replacement before stopping an owned process. Confirmation is required before any managed-heap loss through the management tool. `stop` never kills an external process. Managed launches use port zero and print the actual port for the upstream launcher; they do not rewrite `.nrepl-port` or silently replace a selected live server.

## Pi lifetime

Server registration is lazy at `session_start`, requires project trust, and does not launch an application JVM. Duplicate session-start events do not replace a live server. A changed project is warned about rather than silently retargeted; explicit reload reconfigures it.

The built-in MCP extension closes connections on `session_shutdown`, including session replacement. Consequently a managed JVM is **not** independently durable. Known managed state triggers confirmation in the cancellable switch/fork hooks; reload/exit/crash still end it without a universal preflight hook. External nREPLs survive all of those events.

Footer state is explicitly last checked and is invalidated by eval/failure. Neither cached UI nor successful MCP registration is used as proof of target readiness. Application state is not serialized into the Pi transcript or restored by conversation navigation.

## Files

| File | Responsibility |
| --- | --- |
| `src/config.ts` | Flags/environment, MCP registration arguments, status validation/presentation |
| `src/extension.ts` | Pi registration, renderer hook, status and lifecycle UI |
| `src/renderers.ts` | UI-only eval/runtime feedback, native expansion and snapshot provenance |
| `clojure/src/pi_clojure/main.clj` | Pinned upstream server composition, opt-in application startup |
| `clojure/src/pi_clojure/runtime.clj` | Readiness, ownership policy and request gate |
| `clojure/src/pi_clojure/guidance.clj` | Shared, description-only skill reminder |
| `skills/repl-driven-development/SKILL.md` | Evidence-driven REPL development philosophy |
| `test/pi-integration.test.ts` | Real Pi SDK + MCP lifecycle/results and feedback in JSON mode; no model calls |
| `test/renderers.test.ts` | Native component layout, provenance, payload/error preservation and fallbacks |
| `test/feedback-integration.test.ts` | Offline saved-session rendering and HTML export through the public SDK |
| `clojure/test/pi_clojure/runtime_test.clj` | Direct runtime/session-history/concurrency/lifecycle regression tests |

See [reference](reference.md) for contracts and [development](development.md) for validation.
