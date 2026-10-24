import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import type { TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createAgentSession, createMcpExtension, DefaultResourceLoader, initTheme, SessionManager, SettingsManager, ToolExecutionComponent, type AgentSession, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PACKAGE_ROOT, readStatus } from "../src/config.ts";
import { alive, eventually, externalRepl, stopChild } from "./support.ts";

const prefix = "mcp__pi_clojure__";
const text = (result: { content: unknown[] }) => result.content.map(block => block && typeof block === "object" && "text" in block ? String(block.text) : "").join("\n");

test("real Pi MCP: readiness, upstream discovery, scoped reload and ownership-safe lifecycle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-clojure-mcp integration "));
  const agentDir = join(directory, "agent");
  await mkdir(join(directory, "src", "pi_clojure"), { recursive: true });
  await mkdir(join(directory, ".clojure-mcp"));
  await mkdir(agentDir);
  await writeFile(join(directory, "deps.edn"), '{:paths ["src"] :deps {org.clojure/clojure {:mvn/version "1.12.6"}}}');
  const marker = join(directory, "UNEXPECTED_AUTOSTART");
  await writeFile(join(directory, ".clojure-mcp", "config.edn"), `{:start-nrepl-cmd ["sh" "-c" "touch '${marker}'"]}`);
  await writeFile(join(directory, "src", "pi_clojure", "integration.clj"), '(ns pi-clojure.integration)\n(defonce state (atom {:counter 41}))\n(defonce original-state state)\n');
  const viewFile = join(directory, "src", "pi_clojure", "integration_view.clj");
  await writeFile(viewFile, '(ns pi-clojure.integration-view)\n(defn describe [] @pi-clojure.integration/state)\n');
  const savedEnvironment = { port: process.env.PI_CLOJURE_PORT, host: process.env.PI_CLOJURE_HOST };
  delete process.env.PI_CLOJURE_PORT;
  process.env.PI_CLOJURE_HOST = "127.0.0.1";
  const settings = SettingsManager.inMemory({ extensions: [], packages: [PACKAGE_ROOT] });
  let session: AgentSession | undefined;
  let external: Awaited<ReturnType<typeof externalRepl>> | undefined;
  const managedPids: number[] = [];
  const errors: string[] = [];
  try {
    const loader = new DefaultResourceLoader({
      cwd: directory, agentDir, settingsManager: settings,
      noThemes: true, noPromptTemplates: true, noContextFiles: true,
      extensionFactories: [createMcpExtension(), (pi: ExtensionAPI) => {
        // A test-only parent tool exercises ctx.executeTool's actual validation,
        // MCP transport and extension hooks, without a model or private SDK APIs.
        pi.registerTool({ name: "test_dispatch", label: "Test dispatch", description: "Integration test driver",
          parameters: Type.Object({ tool: Type.String(), args: Type.Any() }),
          execute: async (_id, params, _signal, _update, ctx) => {
            const outcome = await ctx.executeTool(params.tool, params.args);
            return { ...outcome.result, isError: outcome.isError };
          },
        });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const discovered = loader.getSkills();
    assert.deepEqual(discovered.diagnostics, []);
    assert.deepEqual(discovered.skills.map(skill => skill.name), ["repl-driven-development"]);
    assert.equal(discovered.skills[0]!.filePath, join(PACKAGE_ROOT, "skills", "repl-driven-development", "SKILL.md"));
    assert.equal(discovered.skills[0]!.disableModelInvocation, false);
    const skillText = await readFile(discovered.skills[0]!.filePath, "utf8");
    const skillBody = skillText.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
    const firstParagraph = skillBody.split(/\r?\n\s*\r?\n/)[1]!;
    assert.ok(firstParagraph.length > 0);
    const manager = SessionManager.inMemory(directory);
    ({ session } = await createAgentSession({ cwd: directory, agentDir, resourceLoader: loader,
      settingsManager: settings, sessionManager: manager }));
    await session.bindExtensions({ mode: "json", onError: error => { errors.push(String(error)); } });
    assert.match(session.systemPrompt, /repl-driven-development/);
    assert.ok(!session.systemPrompt.includes(firstParagraph), "actual skill body is on demand, not injected every turn");
    await eventually(() => session!.getActiveToolNames().filter(name => name.startsWith(prefix)).length === 5, 60_000);
    assert.deepEqual(session.getActiveToolNames().filter(name => name.startsWith(prefix)).sort(),
      ["clojure_eval", "list_nrepl_ports", "paren_repair", "runtime_status", "clojure_repl"].map(name => prefix + name).sort());
    for (const tool of session.getAllTools().filter(tool => tool.name.startsWith(prefix))) {
      assert.match(tool.description, /REPL-first development: consult the repl-driven-development skill/);
      assert.equal(tool.description.match(/REPL-first development:/g)?.length, 1);
    }
    assert.match(session.getToolDefinition(prefix + "clojure_eval")!.description, /clj-mcp.repl-tools/);
    assert.match(session.getToolDefinition(prefix + "clojure_repl")!.description, /confirm_state_loss=true/);
    const dispatch = session.agent.state.tools.find(tool => tool.name === "test_dispatch")!;
    let serial = 0;
    const call = async (name: string, args: Record<string, string | number | boolean> = {}) => {
      const id = `test/${++serial}`;
      const params = { tool: prefix + name, args };
      // Restore an offline assistant turn through the public session store.
      // Nested tool execution correctly requires a parent assistant message.
      manager.appendMessage({ role: "assistant", api: "anthropic-messages", provider: "test", model: "offline",
        content: [{ type: "toolCall", id, name: "test_dispatch", arguments: params }],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "toolUse", timestamp: Date.now() });
      session!.refreshContext();
      const result = await dispatch.execute(id, params);
      manager.appendMessage({ role: "toolResult", toolCallId: id, toolName: "test_dispatch",
        content: result.content, details: result.details, isError: result.isError ?? false, timestamp: Date.now() });
      session!.refreshContext();
      return result;
    };
    initTheme("dark", false);
    const renderReceived = (name: string, args: Record<string, unknown>, received: { content: any[]; details?: unknown; isError?: boolean }) => {
      const original = JSON.stringify(received);
      const fullName = prefix + name;
      const renderers = session!.extensionRunner.resolveToolRenderers(fullName, () => session!.getToolDefinition(fullName));
      assert.ok(renderers?.renderCall);
      assert.ok(renderers?.renderResult);
      const view = new ToolExecutionComponent(fullName, "rendered/" + name, args, { outputPad: 1, showImages: false }, renderers,
        { requestRender() {} } as TUI, directory);
      view.markExecutionStarted();
      view.setArgsComplete();
      view.updateResult({ ...received, isError: received.isError ?? false });
      const compact = view.render(120).map(stripVTControlCharacters).join("\n");
      view.setExpanded(true);
      const expanded = view.render(120).map(stripVTControlCharacters).join("\n");
      assert.equal(JSON.stringify(received), original, "rendering never rewrites the model/codemode result");
      return { compact, expanded };
    };
    const initialResult = await call("runtime_status");
    const initialCard = renderReceived("runtime_status", {}, initialResult);
    assert.match(initialCard.compact, /Snapshot · not ready · none/);
    assert.match(initialCard.expanded, /"schemaVersion"/);
    assert.doesNotMatch(text(initialResult), /Snapshot ·/);
    const initial = readStatus(initialResult.content)!;
    assert.ok(initial, JSON.stringify(initialResult));
    assert.equal(initial.ready, false);
    assert.equal(initial.ownership, "none");
    await assert.rejects(access(marker), "upstream project auto-start configuration must not launch a process");

    const managed = readStatus((await call("clojure_repl", { action: "start" })).content)!;
    assert.equal(managed.ready, true);
    assert.equal(managed.ownership, "managed");
    managedPids.push(Number(managed.pid));
    const seedCode = "(require 'pi-clojure.integration 'pi-clojure.integration-view) (in-ns 'pi-clojure.integration) (+ 20 22)";
    const seeded = await call("clojure_eval", { code: seedCode });
    assert.equal(seeded.isError, false);
    assert.match(text(seeded), /=> 42/);
    const evalCard = renderReceived("clojure_eval", { code: seedCode }, seeded);
    assert.match(evalCard.compact, /Clojure eval · default target/);
    assert.match(evalCard.compact, /=> 42/);
    assert.match(evalCard.compact, /Request completed/);
    assert.doesNotMatch(text(seeded), /Received output|Request completed/);
    const checked = readStatus((await call("runtime_status")).content)!;
    assert.equal(checked.namespace, "pi-clojure.integration");
    assert.match(text(await call("clojure_eval", { code: "(and (= 42 *1) (identical? state original-state))" })), /=> true/);

    const failingCode = '(identity :before-error) (throw (ex-info "feedback-fixture" {})) :after-error';
    const failedEval = await call("clojure_eval", { code: failingCode });
    assert.equal(failedEval.isError, true);
    const errorSequence = /=> :before-error[\s\S]*feedback-fixture[\s\S]*=> :after-error/;
    assert.match(text(failedEval), errorSequence);
    const errorCard = renderReceived("clojure_eval", { code: failingCode }, failedEval);
    assert.match(errorCard.compact, /Request failed/);
    assert.match(errorCard.compact.split("Received output")[1] ?? "", errorSequence);

    await writeFile(viewFile, '(ns pi-clojure.integration-view)\n(defn describe [] (assoc @pi-clojure.integration/state :version 2))\n');
    const reloaded = await call("clojure_eval", { code: "(require 'pi-clojure.integration-view :reload) (and (identical? state original-state) (= {:counter 41 :version 2} (pi-clojure.integration-view/describe)))" });
    assert.match(text(reloaded), /=> true/);
    assert.match(text(await call("clojure_eval", { code: "(clj-mcp.repl-tools/source-symbol 'pi-clojure.integration-view/describe)" })), /:version 2/);
    assert.match(text(await call("clojure_eval", { code: "(select-keys (meta #'pi-clojure.integration-view/describe) [:file :line :arglists])" })), /integration_view.clj/);

    const refusedStop = await call("clojure_repl", { action: "stop" });
    assert.equal(refusedStop.isError, true);
    assert.match(text(refusedStop), /STATE LOSS/);
    assert.match(renderReceived("clojure_repl", { action: "stop" }, refusedStop).compact, /Request failed[\s\S]*STATE LOSS/);
    assert.ok(alive(Number(managed.pid)));
    external = await externalRepl(directory);
    const refusedAttach = await call("clojure_repl", { action: "attach", port: external.port });
    assert.equal(refusedAttach.isError, true);
    const attached = readStatus((await call("clojure_repl", { action: "attach", port: external.port, confirm_state_loss: true })).content)!;
    assert.equal(attached.ownership, "external");
    await eventually(() => !alive(Number(managed.pid)));
    assert.match(text(await call("clojure_eval", { code: "(def retained (atom 73)) @retained" })), /=> 73/);
    assert.equal((await call("clojure_repl", { action: "start" })).isError, true, "never silently replace a live external target");
    await call("clojure_repl", { action: "stop" });
    assert.equal(external.child.exitCode, null);
    assert.equal(external.child.signalCode, null);
    await call("clojure_repl", { action: "attach", port: external.port });
    assert.match(text(await call("clojure_eval", { code: "@retained" })), /=> 73/);
    await call("clojure_repl", { action: "stop" });
    const lastManaged = readStatus((await call("clojure_repl", { action: "start" })).content)!;
    managedPids.push(Number(lastManaged.pid));
    assert.equal(lastManaged.ownership, "managed");
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    await eventually(() => !alive(Number(lastManaged.pid)), 10_000);
    assert.equal(external.child.exitCode, null, "MCP shutdown must preserve the attached external JVM");
    assert.equal(external.child.signalCode, null);
    assert.deepEqual(errors, []);
  } finally {
    if (session) {
      try { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); } catch { /* best-effort cleanup */ }
      session.dispose();
    }
    if (external) await stopChild(external.child);
    for (const pid of managedPids) if (alive(pid)) { try { process.kill(pid, "SIGTERM"); } catch {} }
    for (const [key, value] of [["PI_CLOJURE_PORT", savedEnvironment.port], ["PI_CLOJURE_HOST", savedEnvironment.host]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);
