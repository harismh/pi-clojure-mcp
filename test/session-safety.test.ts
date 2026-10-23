import assert from "node:assert/strict";
import { test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../src/extension.ts";

test("session replacement/fork confirms known managed state loss and shutdown clears cached health", async () => {
  const events = new Map<string, Function>();
  const labels: unknown[] = [];
  let consent = false;
  let confirmations = 0;
  extension({
    registerFlag() {}, registerCommand() {}, registerMcpServer() {}, getFlag() {},
    on(name: string, handler: Function) { events.set(name, handler); },
  } as unknown as ExtensionAPI);
  const ctx = { cwd: "/project", hasUI: true, isProjectTrusted: () => true, ui: {
    setStatus(_key: string, label: unknown) { labels.push(label); },
    confirm: async () => { confirmations++; return consent; }, notify() {},
  } };
  await events.get("session_start")!({}, ctx);
  await events.get("tool_result")!({ toolName: "mcp__pi_clojure__clojure_repl", content: [{ type: "text", text: JSON.stringify({
    schemaVersion: 1, mcp: "connected", ready: true, ownership: "managed", project: "/project", host: "127.0.0.1", port: 9000,
    namespaceSource: "last-evaluation", observedAt: Date.now(), stale: false,
  }) }] });
  assert.deepEqual(await events.get("session_before_switch")!({}, ctx), { cancel: true });
  consent = true;
  assert.equal(await events.get("session_before_fork")!({}, ctx), undefined);
  assert.equal(confirmations, 2);
  assert.deepEqual(await events.get("session_before_switch")!({}, { ...ctx, hasUI: false }), { cancel: true });
  await events.get("session_shutdown")!();
  await events.get("session_start")!({}, ctx);
  assert.match(String(labels.at(-1)), /target not checked/);
  assert.equal(await events.get("session_before_switch")!({}, ctx), undefined);
});
