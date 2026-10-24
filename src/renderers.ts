import { highlightCode, keyHint, type Theme, type ThemeColor, type ToolRendererResolver, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { readStatus, SERVER_NAME, type RuntimeStatus } from "./config.ts";

// Derive context from the public renderer signature; no private SDK imports.
type RenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
type ResultRenderer = NonNullable<ToolRenderers["renderResult"]>;
type ViewContext = Pick<RenderContext, "argsComplete" | "expanded" | "isError" | "isPartial" | "executionStarted" | "durationMs">;
// Keep scalar observations, not SDK contexts that link to previous renderer components.
const viewContext = (context: RenderContext): ViewContext => ({
  argsComplete: context.argsComplete, expanded: context.expanded, isError: context.isError,
  isPartial: context.isPartial, executionStarted: context.executionStarted, durationMs: context.durationMs,
});
interface Block { text: string; color?: ThemeColor; bold?: boolean; code?: boolean; preview?: number }
const PREFIX = `mcp__${SERVER_NAME}__`;
const CODE_PREVIEW_CHARS = 4096;
const HIGHLIGHT_CHARS = 32_768;

/** Escape terminal controls in the view only. The original tool payload stays untouched. */
function display(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, "    ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
      char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
const field = (text: string) => display(text).replace(/\n/g, "\\n");
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const block = (text: string, color: ThemeColor = "toolOutput"): Block => ({ text, color });

/** A small native component: one-width cache, invalidated on theme changes by Pi. */
class FeedbackView implements Component {
  private cachedWidth?: number;
  private cachedLines?: string[];
  constructor(private readonly theme: Theme, private readonly blocks: () => Block[]) {}
  invalidate() { this.cachedWidth = undefined; this.cachedLines = undefined; }
  render(width: number): string[] {
    if (!Number.isFinite(width) || width <= 0) return [];
    width = Math.floor(width);
    if (width < 1) return [];
    if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
    const rendered: string[] = [];
    for (const part of this.blocks()) {
      const text = display(part.text);
      const styled = part.code && text.length <= HIGHLIGHT_CHARS
        ? highlightCode(text, "clojure").join("\n")
        : text.split("\n").map(line => this.theme.fg(part.color ?? "toolOutput", part.bold ? this.theme.bold(line) : line)).join("\n");
      const lines = new Text(styled, 0, 0).render(width).map(line => truncateToWidth(line, width, ""));
      if (part.preview && lines.length > part.preview) {
        const head = Math.ceil(part.preview / 2);
        rendered.push(...lines.slice(0, head));
        const hint = this.theme.fg("muted", `... ${lines.length - part.preview} display lines hidden; `)
          + keyHint("app.tools.expand", "to expand");
        rendered.push(...new Text(hint, 0, 0).render(width).map(line => truncateToWidth(line, width, "")));
        rendered.push(...lines.slice(-(part.preview - head)));
      } else {
        rendered.push(...lines);
      }
    }
    this.cachedWidth = width;
    return this.cachedLines = rendered;
  }
}

function phase(context: ViewContext): string {
  if (!context.isPartial) return context.isError ? "Request failed" : "Request completed";
  return context.executionStarted ? "Request in progress" : "Preparing request";
}
function duration(context: ViewContext): string {
  const ms = context.durationMs;
  if (context.isPartial || typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  return ` · elapsed ${ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`}`;
}
function route(args: Record<string, unknown>): string {
  return args.port == null ? "default target" : typeof args.port === "number" ? `:${args.port} (explicit)` : "port unavailable";
}
function argumentsBlock(args: Record<string, unknown>, omit: string[]): Block[] {
  const extra = Object.fromEntries(Object.entries(args).filter(([key]) => !omit.includes(key)));
  if (!Object.keys(extra).length) return [];
  try { return [block(`Arguments: ${JSON.stringify(extra)}`, "muted")]; }
  catch { return [block("Arguments unavailable", "warning")]; }
}
function callView(tool: string, args: unknown, theme: Theme, context: ViewContext): Component {
  const input = { ...record(args) };
  return new FeedbackView(theme, () => {
    const color: ThemeColor = context.isError ? "error" : "toolTitle";
    if (tool === "clojure_eval") {
      const code = typeof input.code === "string" ? input.code : "";
      const clipped = !context.expanded && code.length > CODE_PREVIEW_CHARS;
      return [
        { text: `Clojure eval · ${route(input)}`, color, bold: true },
        ...argumentsBlock(input, context.expanded ? ["code"] : ["code", "port"]),
        block("Input", "muted"),
        code ? { text: clipped ? code.slice(0, CODE_PREVIEW_CHARS) : code, code: context.argsComplete, preview: context.expanded ? undefined : 6 }
          : block(context.argsComplete ? "(no code supplied)" : "Receiving code...", "muted"),
        ...(clipped ? [block("Input preview; expand for the full requested code", "warning")] : []),
      ];
    }
    const title = tool === "runtime_status" ? "Clojure runtime status"
      : `Clojure REPL · ${typeof input.action === "string" ? field(input.action) : "receiving action"}`;
    return [{ text: title, color, bold: true }, ...argumentsBlock(input, ["action"])];
  });
}

function timestamp(observedAt: number): string {
  const date = new Date(observedAt);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "timestamp unavailable";
}
function statusBlocks(status: RuntimeStatus): Block[] {
  const extra = status as unknown as Record<string, unknown>;
  const host = status.host.includes(":") ? `[${field(status.host)}]` : field(status.host);
  const rows = [
    block(`Snapshot · ${status.ready ? "ready" : "not ready"} · ${status.ownership}${status.stale ? " · STALE" : ""}`,
      status.stale || !status.ready ? "warning" : "success"),
    block(`Endpoint: ${status.port === null ? "no selected target" : `${host}:${status.port}`}`),
    block(`Application PID: ${status.pid === undefined ? "not reported" : field(status.pid)}`),
    block(`Application cwd: ${status.cwd === undefined ? "not reported" : field(status.cwd)}`),
    block(`Integration project: ${field(status.project)}`, "muted"),
    block(`Namespace (last evaluation-reported): ${status.namespace == null ? "not reported" : field(status.namespace)}`, "muted"),
    block(`Last checked: ${timestamp(status.observedAt)}`, "muted"),
  ];
  if (typeof extra.managedPid === "string") rows.push(block(`Managed PID: ${field(extra.managedPid)}`, "muted"));
  if (typeof extra.clojureVersion === "string") rows.push(block(`Clojure: ${field(extra.clojureVersion)}`, "muted"));
  if (typeof extra.javaVersion === "string") rows.push(block(`Java: ${field(extra.javaVersion)}`, "muted"));
  if (typeof status.reason === "string" && status.reason) rows.push(block(`Reason: ${field(status.reason)}`, "warning"));
  if (typeof extra.metadataError === "string") rows.push(block(`Metadata unavailable: ${field(extra.metadataError)}`, "warning"));
  return rows;
}

function fullOutputPath(details: unknown, tool: string): string | undefined {
  const value = record(details);
  return value?.server === SERVER_NAME && value.tool === tool && typeof value.fullOutputPath === "string"
    ? field(value.fullOutputPath) : undefined;
}

/** UI-only decoration of the three feedback-heavy tools. No executor or result wrapping. */
export const feedbackRenderer: ToolRendererResolver = (name, next) => {
  const tool = name.startsWith(PREFIX) ? name.slice(PREFIX.length) : "";
  if (!["clojure_eval", "runtime_status", "clojure_repl"].includes(tool)) return next();
  const fallback = next();
  const renderResult: ResultRenderer = (result, options, theme, context) => {
    // Preserve Pi's normal image/resource handling. A fallback must not reuse our component type.
    if (result.content.some(item => item.type !== "text") && fallback?.renderResult) {
      return fallback.renderResult(result, { ...options, expanded: options.expanded || context.isError }, theme,
        { ...context, lastComponent: undefined });
    }
    const text = result.content.map(item => item.type === "text" ? item.text : `[${item.type} content]`).join("\n");
    // Only a complete, single, recognized status response gets a structured card.
    const status = tool !== "clojure_eval" && !options.isPartial && !context.isError && result.content.length === 1
      ? readStatus(result.content) : undefined;
    const view = viewContext(context);
    const { expanded, isPartial } = options;
    const path = fullOutputPath(result.details, tool);
    return new FeedbackView(theme, () => {
      // Completion belongs to the result: HTML export renders call headers before final context exists.
      const rows: Block[] = [block("", "muted"),
        block(`${phase({ ...view, isPartial })}${duration(view)}`, view.isError ? "error" : "muted")];
      if (status) rows.push(...statusBlocks(status));
      if (!status || expanded) {
        rows.push(block(isPartial ? "Partial received output" : "Received output", "muted"));
        rows.push(text ? { text, color: view.isError ? "error" : "toolOutput",
          preview: expanded || view.isError ? undefined : 8 } : block("(no text returned)", "muted"));
      } else {
        rows.push(block("Expand for the original received JSON", "muted"));
      }
      if (path) rows.push(block(`Pi saved full output: ${path}`, "warning"));
      return rows;
    });
  };
  return { renderShell: "default", renderCall: (args, theme, context) => callView(tool, args, theme, viewContext(context)), renderResult };
};
