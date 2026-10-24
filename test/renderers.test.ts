import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { test } from "bun:test";
import { initTheme, ToolExecutionComponent, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { feedbackRenderer } from "../src/renderers.ts";

initTheme("dark", false);
const prefix = "mcp__pi_clojure__";
type Result = Parameters<ToolExecutionComponent["updateResult"]>[0];
const result = (text: string, isError = false) => ({ content: [{ type: "text", text }], isError, durationMs: 24 } satisfies Result);
const plain = (view: Component, width = 120) => view.render(width).map(stripVTControlCharacters).join("\n");
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};
function card(tool: string, args: unknown, output?: Result, fallback?: ToolRenderers) {
  const renderers = feedbackRenderer(prefix + tool, () => fallback)!;
  let callPart: Component;
  let resultPart: Component;
  let resultContext: Parameters<NonNullable<ToolRenderers["renderResult"]>>[3];
  const wrapped: ToolRenderers = {
    ...renderers,
    renderCall(...params) { callPart = renderers.renderCall!(...params); return callPart; },
    renderResult(...params) { resultContext = params[3]; resultPart = renderers.renderResult!(...params); return resultPart; },
  };
  const view = new ToolExecutionComponent(prefix + tool, "fixture", args, { outputPad: 1, showImages: false }, wrapped,
    { requestRender() {} } as TUI, "/pi-project");
  view.markExecutionStarted();
  view.setArgsComplete();
  if (output) view.updateResult(output);
  return { view, call: () => callPart!, output: () => resultPart!, context: () => resultContext! };
}
const status = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, mcp: "connected", ready: true, ownership: "external", project: "/pi-project",
  host: "127.0.0.1", port: 7888, pid: "4567", cwd: "/my-app", namespace: "shop.core",
  namespaceSource: "last-evaluation", observedAt: Date.UTC(2026, 9, 23), stale: false,
  clojureVersion: "1.12.6", javaVersion: "25.0.2", ...overrides,
});

test("renderer selection changes only the three feedback views, including before tools connect", () => {
  const base: ToolRenderers = { renderCall: () => new Text("base") };
  for (const name of ["read", "mcp__clojure__clojure_eval", prefix + "paren_repair", prefix + "list_nrepl_ports", prefix + "clojure_eval_other"]) {
    assert.strictEqual(feedbackRenderer(name, () => base), base);
  }
  for (const name of ["clojure_eval", "runtime_status", "clojure_repl"]) {
    const selected = feedbackRenderer(prefix + name, () => undefined)!;
    assert.equal(selected.renderShell, "default");
    assert.equal(typeof selected.renderCall, "function");
    assert.equal(typeof selected.renderResult, "function");
  }
});

test("eval cards highlight requested code and preserve received multi-form output without payload mutation", () => {
  const args = freeze({ code: '(defn total [x] (+ x 2))\n(total 40)', port: 7888, timeout_ms: 10_000 });
  const received = freeze({ ...result("=> #'shop/total\n*======== shop | clj ========*\n=> 42\n*======== shop | clj ========*"),
    details: { server: "pi_clojure", tool: "clojure_eval" }, structuredContent: { content: [{ type: "text", text: "original MCP result" }] } });
  const before = JSON.stringify({ args, received });
  const value = card("clojure_eval", args, received);
  const text = plain(value.view);
  assert.match(text, /Clojure eval/);
  assert.match(text, /:7888 \(explicit\)/);
  assert.match(text, /Request completed · elapsed 24 ms/);
  assert.match(text, /timeout_ms.*10000/);
  assert.match(text, /\(defn total/);
  assert.match(text, /=> #'shop\/total/);
  assert.match(text, /=> 42/);
  assert.match(text, /\*======== shop \| clj ========\*/);
  assert.ok(value.call().render(120).some(line => line.includes("defn") && line.includes("\x1b[")), "input is syntax-colored");
  value.view.setExpanded(true);
  assert.match(plain(value.view), /"port":7888/);
  assert.equal(JSON.stringify({ args, received }), before);
});

test("eval routing is derived from the stored request, never relabeled from a later runtime card", () => {
  const previous = card("clojure_eval", { code: "(+ 1 2)", port: 7888 }, result("=> 3"));
  const defaultTarget = card("clojure_eval", { code: "(+ 2 2)" }, result("=> 4"));
  const before = plain(previous.view);
  card("runtime_status", {}, result(JSON.stringify(status({ port: 9999, cwd: "/other", ownership: "managed" })))).view.render(120);
  assert.equal(plain(previous.view), before);
  assert.match(plain(defaultTarget.view), /default target/);
  assert.doesNotMatch(plain(defaultTarget.view), /9999|\/other|managed|shop.core/);
});

test("views snapshot execution metadata instead of retaining mutable SDK contexts", () => {
  const value = card("clojure_eval", { code: "42" }, result("=> 42"));
  const before = plain(value.output());
  const context = value.context();
  context.durationMs = 9999;
  context.isError = true;
  context.isPartial = true;
  context.expanded = true;
  value.output().invalidate();
  assert.equal(plain(value.output()), before);
});

test("successful output previews are bounded by wrapped lines and expand to all received text", () => {
  const text = Array.from({ length: 100 }, (_, i) => `received-${i}`).join("\n");
  const value = card("clojure_eval", { code: "(range 100)" }, result(text));
  const compact = plain(value.view);
  assert.match(compact, /received-0/);
  assert.match(compact, /received-99/);
  assert.match(compact, /display lines hidden/);
  assert.doesNotMatch(compact, /received-50/);
  value.view.setExpanded(true);
  const expanded = plain(value.view);
  assert.match(expanded, /received-50/);
  assert.ok(expanded.split("\n").length > compact.split("\n").length + 70);
  const wideLine = card("clojure_eval", { code: "(repeat 1000 :x)" }, result("x".repeat(10_000)));
  assert.ok(wideLine.view.render(40).length < 35, "one huge logical line is also visually bounded");
});

test("failed requests expose intermediate errors and later values even while collapsed", () => {
  const text = [...Array.from({ length: 30 }, (_, i) => `before-${i}`), "Execution error: fixture", "=> 42",
    ...Array.from({ length: 30 }, (_, i) => `after-${i}`)].join("\n");
  const value = card("clojure_eval", { code: "(fail) 42" }, result(text, true));
  const rendered = plain(value.view);
  for (const part of ["Request failed", "before-0", "Execution error: fixture", "=> 42", "after-29"]) assert.ok(rendered.includes(part));
  assert.doesNotMatch(rendered, /display lines hidden|tests passed|execution stopped/i);
});

test("request completion is not presented as passing project tests", () => {
  const value = card("clojure_eval", { code: "(clojure.test/run-tests)" }, result("FAIL in checkout-test\n{:fail 1 :error 0}"));
  assert.match(plain(value.view), /Request completed/);
  assert.match(plain(value.view), /FAIL in checkout-test/);
  assert.doesNotMatch(plain(value.view), /tests passed|all tests pass/i);
});

test("partial output stays partial and unavailable timing is not invented", () => {
  const value = card("clojure_eval", { code: "(slow-operation)" });
  value.view.updateResult(result("upstream progress message"), true);
  const text = plain(value.view);
  assert.match(text, /Request in progress/);
  assert.match(text, /Partial received output/);
  assert.doesNotMatch(text, /Request completed|elapsed/);
  value.view.updateResult({ content: [], isError: false });
  assert.match(plain(value.view), /no text returned/);
  assert.doesNotMatch(plain(value.view), /elapsed|=> nil/);
});

test("runtime cards show snapshot provenance and retain original JSON on expansion", () => {
  const json = JSON.stringify(status({ futureMetadata: { preserved: true } }));
  const received = freeze(result(json));
  const value = card("runtime_status", {}, received);
  const text = plain(value.view);
  for (const part of ["Snapshot · ready · external", "127.0.0.1:7888", "Application PID: 4567", "Application cwd: /my-app",
    "Integration project: /pi-project", "Namespace (last evaluation-reported): shop.core", "Last checked: 2026-10-23T00:00:00.000Z"]) {
    assert.ok(text.includes(part), part);
  }
  assert.doesNotMatch(text, /futureMetadata/);
  value.view.setExpanded(true);
  assert.ok(plain(value.output(), 1000).includes(json));
  assert.equal(received.content[0]!.text, json);
});

test("not-ready, stale and metadata-error snapshots remain explicit", () => {
  const value = card("clojure_repl", { action: "attach", port: 7888, confirm_state_loss: true }, result(JSON.stringify(status({
    ready: false, stale: true, namespace: null, pid: undefined, cwd: undefined,
    reason: "listener did not answer", metadataError: "probe timed out", observedAt: 1e30,
  }))));
  const text = plain(value.view);
  for (const part of ["Clojure REPL · attach", '"confirm_state_loss":true', "Snapshot · not ready · external · STALE",
    "Application PID: not reported", "Application cwd: not reported", "Namespace (last evaluation-reported): not reported",
    "timestamp unavailable", "listener did not answer", "Metadata unavailable: probe timed out"]) assert.ok(text.includes(part), part);
});

test("unknown status shapes and additional text fall back to received output without guessing readiness", () => {
  for (const received of [result('{"schemaVersion":2,"ready":true}'), result("not JSON"),
    { content: [{ type: "text", text: JSON.stringify(status()) }, { type: "text", text: "additional warning" }], isError: false }]) {
    const value = card("runtime_status", {}, received);
    const text = plain(value.view);
    assert.match(text, /Received output/);
    assert.doesNotMatch(text, /Snapshot · ready/);
    value.view.setExpanded(true);
    assert.ok(plain(value.view, 1000).includes(received.content.at(-1)!.text!));
  }
  const error = card("clojure_repl", { action: "stop" }, result("STATE LOSS: acknowledgment required", true));
  assert.match(plain(error.view), /STATE LOSS/);
});

test("saved full-output references stay visible without reading files or altering content", () => {
  const received = freeze({ ...result("x".repeat(10_000)), details: { server: "pi_clojure", tool: "clojure_eval", fullOutputPath: "/not/read/by/renderer.txt" } });
  assert.match(plain(card("clojure_eval", { code: "(large-value)" }, received).view), /Pi saved full output: \/not\/read\/by\/renderer.txt/);
  assert.equal(received.content[0]!.text.length, 10_000);
});

test("terminal controls are escaped only in presentation, including single-line runtime fields", () => {
  const text = "\x1b[2J\x1b]52;c;clipboard\x07\r\u202e=> 42";
  const received = freeze(result(text));
  const value = card("clojure_eval", { code: '(str "\x1b[2J")' }, received);
  const rendered = plain(value.view);
  assert.match(rendered, /\\u001b\[2J/);
  assert.match(rendered, /\\u0007/);
  assert.match(rendered, /\\u000d/);
  assert.match(rendered, /\\u202e/);
  assert.equal(received.content[0]!.text, text);
  const metadata = card("runtime_status", {}, result(JSON.stringify(status({ pid: "4567\nFAKE", cwd: "/app\nFAKE", namespace: "user\nFAKE" }))));
  assert.match(plain(metadata.view), /4567\\nFAKE/);
});

test("components fit narrow widths and invalidate cached colors on theme changes", () => {
  const value = card("clojure_eval", { code: '(str "界🔬e\u0301")' }, result("=> 界🔬e\u0301"));
  for (const expanded of [false, true]) {
    value.view.setExpanded(expanded);
    for (const part of [value.call(), value.output()]) {
      for (const width of [0, 0.5, 1, 2, 5, 12, 40, 80]) {
        assert.ok(part.render(width).every(line => visibleWidth(line) <= Math.floor(width)), `width ${width}`);
      }
    }
    for (const width of [8, 24, 80]) assert.ok(value.view.render(width).every(line => visibleWidth(line) <= width));
  }
  const before = value.call().render(80).join("\n");
  try {
    initTheme("light", false);
    value.call().invalidate();
    assert.notEqual(value.call().render(80).join("\n"), before);
  } finally { initTheme("dark", false); }
});

test("non-text results preserve the base renderer and do not mix incompatible component caches", () => {
  let called = 0;
  const base: ToolRenderers = { renderResult(received, options, _theme, context) {
    called++;
    assert.equal(context.lastComponent, undefined);
    assert.equal(options.expanded, true, "errors remain fully visible");
    assert.equal(context.showImages, false);
    assert.equal(received.content.length, 2);
    return new Text("original image fallback", 0, 0);
  } };
  const value = card("clojure_eval", { code: "(image)" }, result("initial text"), base);
  value.view.updateResult({ content: [{ type: "text", text: "image description" }, { type: "image", data: "", mimeType: "image/png" }], isError: true });
  assert.equal(called, 1);
  assert.match(plain(value.view), /original image fallback/);
  const offline = card("clojure_eval", { code: "(image)" }, { content: [{ type: "image", data: "", mimeType: "image/png" }], isError: false });
  assert.match(plain(offline.view), /\[image content\]/);
});
