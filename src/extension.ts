import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MANAGEMENT_TOOLS, parseOptions, readStatus, SERVER_NAME, serverConfig, statusLabel, type RuntimeStatus } from "./config.ts";
import { feedbackRenderer } from "./renderers.ts";

const HELP = `pi-clojure-mcp — thin ClojureMCP integration

Use the agent's MCP tools:
  runtime_status   Check actual nREPL readiness, ownership, PID/cwd and versions.
  clojure_repl     Explicit start / attach / stop; managed state loss requires acknowledgment.
  clojure_eval     Upstream persistent evaluation and namespace/source discovery.
  list_nrepl_ports Upstream server discovery.
  paren_repair     Upstream delimiter repair.

Ask: "Check the Clojure runtime, then attach to port 7888" or "Start a fresh managed REPL".
For Clojure coding/debugging, consult the repl-driven-development skill.
Use /skill:repl-driven-development to load its full guidance explicitly.
Application JVM startup is explicit. Stopping an external target detaches without terminating its process.
Managed JVMs end with MCP: Pi reload/exit, session replacement, or MCP reconnect; no replay.
Eval/runtime cards support Pi's native expansion for received output; rendering never evaluates code.
The footer is LAST CHECKED information. Call runtime_status for a fresh health check.
Conversation branching does not rewind application state; this is not a sandbox.`;

export default function clojureExtension(pi: ExtensionAPI) {
  pi.registerToolRenderer(feedbackRenderer);

  let context: ExtensionContext | undefined;
  let registeredProject: string | undefined;
  let lastStatus: RuntimeStatus | undefined;
  let evaluated = false;
  const update = () => { if (context?.hasUI) context.ui.setStatus("pi-clojure-mcp", statusLabel(lastStatus)); };

  pi.registerFlag("clojure-command", { type: "string", description: "Clojure CLI executable path (PI_CLOJURE_COMMAND); not a shell command" });
  pi.registerFlag("clojure-host", { type: "string", description: "Loopback nREPL host (PI_CLOJURE_HOST); default 127.0.0.1" });
  pi.registerFlag("clojure-port", { type: "string", description: "Attach target port (PI_CLOJURE_PORT); otherwise discover the project's .nrepl-port" });

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    if (!registeredProject) {
      if (!ctx.isProjectTrusted()) {
        if (ctx.hasUI) ctx.ui.notify("pi-clojure-mcp: project is not trusted; MCP registration was skipped.", "warning");
        return;
      }
      pi.registerMcpServer(SERVER_NAME, serverConfig(parseOptions(name => pi.getFlag(name)), ctx.cwd));
      registeredProject = ctx.cwd;
    } else if (registeredProject !== ctx.cwd && ctx.hasUI) {
      ctx.ui.notify("pi-clojure-mcp kept its existing target instead of silently changing project/ownership. Reload explicitly to reconfigure; managed JVM state will be lost.", "warning");
    }
    update();
  });

  pi.on("tool_result", event => {
    if (MANAGEMENT_TOOLS.has(event.toolName)) {
      const status = readStatus(event.content);
      if (status) lastStatus = status;
      else if (lastStatus) lastStatus = { ...lastStatus, stale: true };
      update();
    } else if (event.toolName === `mcp__${SERVER_NAME}__clojure_eval`) {
      evaluated = true;
      if (lastStatus) lastStatus = { ...lastStatus, stale: true };
      update();
    }
  });

  const confirmSessionChange = async (_event: unknown, ctx: ExtensionContext) => {
    if (lastStatus?.ownership !== "managed") return;
    const acknowledged = ctx.hasUI && await ctx.ui.confirm("Discard managed Clojure state?",
      "Replacing/forking the Pi session closes MCP and stops its managed JVM. The heap and REPL history will be lost, with no replay. Attach an independently started nREPL for longer-lived state.");
    if (!acknowledged) return { cancel: true };
  };
  pi.on("session_before_switch", confirmSessionChange);
  pi.on("session_before_fork", confirmSessionChange);
  pi.on("session_tree", (_event, ctx) => {
    if ((evaluated || lastStatus?.ready) && ctx.hasUI) {
      ctx.ui.notify("Clojure is live: conversation navigation does not rewind the REPL or restore its heap.", "warning");
    }
  });

  pi.registerCommand("clj", {
    description: "Show ClojureMCP tools, lifecycle rules and last-checked status (agent tools perform management)",
    handler: async (_args, ctx) => {
      pi.sendMessage({ customType: "pi-clojure-mcp", content: `${HELP}\n\n${statusLabel(lastStatus)}`, display: true });
    },
  });

  pi.on("session_shutdown", () => {
    if (context?.hasUI) context.ui.setStatus("pi-clojure-mcp", undefined);
    context = undefined;
    lastStatus = undefined;
    evaluated = false;
  });
}
