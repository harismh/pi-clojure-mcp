import { fileURLToPath } from "node:url";

export const SERVER_NAME = "pi_clojure";
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const MANAGEMENT_TOOLS = new Set([
  `mcp__${SERVER_NAME}__runtime_status`,
  `mcp__${SERVER_NAME}__clojure_repl`,
]);

export interface Options { command: string; host: string; port?: number }
export function parseOptions(getFlag: (name: string) => unknown, env: NodeJS.ProcessEnv = process.env): Options {
  const value = (flag: string, variable: string, fallback?: string) => {
    const supplied = getFlag(flag);
    return typeof supplied === "string" && supplied ? supplied : env[variable] || fallback;
  };
  const command = value("clojure-command", "PI_CLOJURE_COMMAND", "clojure")!;
  const host = value("clojure-host", "PI_CLOJURE_HOST", "127.0.0.1")!;
  const rawPort = value("clojure-port", "PI_CLOJURE_PORT");
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) throw new Error("Clojure host must be loopback; use SSH for remote targets.");
  if (command.includes("\0")) throw new Error("Invalid Clojure executable path.");
  if (rawPort !== undefined && (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)) {
    throw new Error("Clojure port must be an integer from 1 to 65535.");
  }
  return { command, host, ...(rawPort === undefined ? {} : { port: Number(rawPort) }) };
}

export function serverConfig(options: Options, project: string) {
  return {
    command: options.command,
    args: ["-Srepro", "-M", "-m", "pi-clojure.main", "--project-dir", project,
      "--clojure-command", options.command, "--host", options.host,
      ...(options.port === undefined ? [] : ["--port", String(options.port)])],
    cwd: PACKAGE_ROOT,
    exposure: "direct" as const,
    timeout: 120,
    description: "ClojureMCP: persistent evaluation and discovery, plus explicit nREPL health and lifecycle. Start is opt-in; managed JVMs end on MCP reconnect, Pi reload/exit or session replacement. Application state is not rewound by conversation navigation.",
  };
}

export interface RuntimeStatus {
  schemaVersion: 1;
  mcp: "connected";
  ready: boolean;
  ownership: "managed" | "external" | "none";
  project: string;
  host: string;
  port: number | null;
  pid?: string;
  cwd?: string;
  namespace?: string | null;
  namespaceSource: "last-evaluation";
  observedAt: number;
  stale: boolean;
  reason?: string;
}

export function readStatus(content: readonly unknown[]): RuntimeStatus | undefined {
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block) || block.type !== "text" || !("text" in block) || typeof block.text !== "string") continue;
    try {
      const value: unknown = JSON.parse(block.text);
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      if (v.schemaVersion !== 1 || v.mcp !== "connected" || typeof v.ready !== "boolean" ||
          !["managed", "external", "none"].includes(String(v.ownership)) ||
          typeof v.project !== "string" || typeof v.host !== "string" ||
          !(v.port === null || (Number.isInteger(v.port) && Number(v.port) >= 1 && Number(v.port) <= 65535)) ||
          typeof v.observedAt !== "number" || !Number.isFinite(v.observedAt) || typeof v.stale !== "boolean" ||
          v.namespaceSource !== "last-evaluation" ||
          (v.namespace !== undefined && v.namespace !== null && typeof v.namespace !== "string") ||
          (v.pid !== undefined && typeof v.pid !== "string") ||
          (v.cwd !== undefined && typeof v.cwd !== "string")) continue;
      return v as unknown as RuntimeStatus;
    } catch { /* Upstream text is not a status snapshot. */ }
  }
  return undefined;
}

const oneLine = (text: string) => text.replace(/[\x00-\x1f\x7f]/g, " ");
export function statusLabel(status?: RuntimeStatus) {
  if (!status) return "Clojure · target not checked";
  return oneLine(`Clojure · last checked ${status.ready ? "ready" : "not ready"}${status.port ? ` :${status.port}` : ""} · ${status.ownership}${status.stale ? " · stale" : ""}`);
}
