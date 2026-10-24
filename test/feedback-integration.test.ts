import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { createAgentSession, DefaultResourceLoader, initTheme, SessionManager, SettingsManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import { feedbackRenderer } from "../src/renderers.ts";

test("offline history and HTML export use feedback renderers without connecting a REPL or changing transcript data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-clojure-feedback-"));
  const agentDir = join(directory, "agent");
  await mkdir(agentDir);
  initTheme("dark", false);
  let session: AgentSession | undefined;
  try {
    const settings = SettingsManager.inMemory({ extensions: [], packages: [] });
    const loader = new DefaultResourceLoader({ cwd: directory, agentDir, settingsManager: settings,
      noThemes: true, noPromptTemplates: true, noContextFiles: true,
      extensionFactories: [pi => { pi.registerToolRenderer(feedbackRenderer); }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const manager = SessionManager.create(directory, join(directory, "sessions"));
    const assistant = (id: string, name: string, args: Record<string, string | number | boolean>) => {
      manager.appendMessage({ role: "assistant", api: "anthropic-messages", provider: "test", model: "offline",
        content: [{ type: "toolCall", id, name, arguments: args }],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "toolUse", timestamp: 1 });
    };
    assistant("historical/eval", "mcp__pi_clojure__clojure_eval", { code: '(str "<script>alert(1)</script>")', port: 7888 });
    manager.appendMessage({ role: "toolResult", toolCallId: "historical/eval", toolName: "mcp__pi_clojure__clojure_eval",
      content: [{ type: "text", text: '=> "<script>alert(1)</script>"' }], isError: false, timestamp: 2, durationMs: 24 });
    assistant("historical/status", "mcp__pi_clojure__runtime_status", {});
    manager.appendMessage({ role: "toolResult", toolCallId: "historical/status", toolName: "mcp__pi_clojure__runtime_status",
      content: [{ type: "text", text: JSON.stringify({ schemaVersion: 1, mcp: "connected", ready: true, ownership: "external",
        project: "/old-project", host: "127.0.0.1", port: 7888, pid: "4567", cwd: "/old-app", namespace: "old.core",
        namespaceSource: "last-evaluation", observedAt: 1234, stale: false }) }], isError: false, timestamp: 3 });
    const reopened = SessionManager.open(manager.getSessionFile()!, join(directory, "sessions"));
    ({ session } = await createAgentSession({ cwd: directory, agentDir, resourceLoader: loader,
      settingsManager: settings, sessionManager: reopened }));
    await session.bindExtensions({ mode: "json" });
    assert.equal(session.getToolDefinition("mcp__pi_clojure__clojure_eval"), undefined, "no server or evaluator is connected");
    const before = JSON.stringify(reopened.getEntries());
    const file = await session.exportToHtml(join(directory, "feedback.html"), { themeName: "dark" });
    const html = await readFile(file, "utf8");
    // Inspect the actual pre-rendered views in Pi's base64-encoded export payload.
    const encoded = /<script id="session-data" type="application\/json">([^<]+)<\/script>/.exec(html)?.[1];
    assert.ok(encoded, "export contains session data");
    const exported = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.ok(exported.renderedTools, "SDK used the registered renderers");
    const rendered = JSON.stringify(exported.renderedTools);
    for (const text of ["Clojure eval", "Request completed", "Received output", "Snapshot", "Application PID", "4567", "/old-app",
      "Namespace (last evaluation-reported)", "old.core", "&lt;script&gt;"]) assert.ok(rendered.includes(text), text);
    assert.ok(!rendered.includes("Request in progress"), "completed historical calls must not look live");
    assert.ok(!rendered.includes("<script>alert(1)</script>"), "received content is escaped in HTML");
    assert.equal(JSON.stringify(exported.entries), before, "export preserves original result data alongside the views");
    assert.equal(JSON.stringify(reopened.getEntries()), before, "rendering/export is not a transcript transformation");
  } finally {
    if (session) {
      try { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); }
      finally { session.dispose(); }
    }
    await rm(directory, { recursive: true, force: true });
  }
});
