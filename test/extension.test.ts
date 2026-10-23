import assert from "node:assert/strict";
import { test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../src/extension.ts";

test("extension registers lazily, keeps upstream tools intact and never owns a second JVM", async () => {
  const events = new Map<string, Function>();
  const servers: unknown[] = [];
  const statuses: unknown[] = [];
  const notices: string[] = [];
  const commands = new Map<string, { handler: Function }>();
  const pi = {
    registerFlag() {}, getFlag() { return undefined; },
    on(name: string, handler: Function) { events.set(name, handler); },
    registerMcpServer(name: string, config: unknown) { servers.push({ name, config }); },
    registerCommand(name: string, config: { handler: Function }) { commands.set(name, config); },
    sendMessage() {},
  } as unknown as ExtensionAPI;
  const context = { cwd: "/project", hasUI: true, isProjectTrusted: () => true,
    ui: { setStatus(_key: string, value: unknown) { statuses.push(value); }, notify(text: string) { notices.push(text); } } };
  extension(pi);
  assert.equal(servers.length, 0, "factory must not connect or start anything");
  await events.get("session_start")!({}, context);
  assert.equal(servers.length, 1);
  await events.get("session_start")!({}, context);
  assert.equal(servers.length, 1, "session changes must not replace a managed MCP/JVM");
  await events.get("session_tree")!({}, context);
  assert.equal(notices.length, 0);
  await events.get("tool_result")!({ toolName: "mcp__pi_clojure__clojure_eval", content: [] });
  await events.get("session_tree")!({}, context);
  assert.match(notices[0], /does not rewind/);
  await commands.get("clj")!.handler("", context);
  await events.get("session_shutdown")!();
  assert.equal(statuses.at(-1), undefined);
});

test("an untrusted project cannot trigger ClojureMCP project-config loading", async () => {
  let start: Function | undefined;
  let registered = false;
  extension({ registerFlag() {}, registerCommand() {}, getFlag() {}, on(name: string, handler: Function) { if (name === "session_start") start = handler; }, registerMcpServer() { registered = true; } } as unknown as ExtensionAPI);
  await start!({}, { cwd: "/untrusted", hasUI: false, isProjectTrusted: () => false });
  assert.equal(registered, false);
});
