import assert from "node:assert/strict";
import { test } from "bun:test";
import { parseOptions, readStatus, serverConfig, statusLabel } from "../src/config.ts";

test("configuration is attach-first, explicit, loopback-only and shell-free", () => {
  const defaults = parseOptions(() => undefined, {});
  assert.deepEqual(defaults, { command: "clojure", host: "127.0.0.1" });
  const configured = parseOptions(name => name === "clojure-port" ? "9000" : undefined, { PI_CLOJURE_PORT: "7888" });
  assert.equal(configured.port, 9000);
  for (const port of ["0", "65536", "3.5", "7888x"]) {
    assert.throws(() => parseOptions(() => undefined, { PI_CLOJURE_PORT: port }));
  }
  assert.throws(() => parseOptions(() => undefined, { PI_CLOJURE_HOST: "0.0.0.0" }));
  const config = serverConfig(configured, "/project with spaces");
  assert.equal(config.args[config.args.indexOf("--project-dir") + 1], "/project with spaces");
  assert.equal(config.exposure, "direct");
  assert.equal(config.args.includes(":fallback-nrepl"), false);
  assert.equal(config.args.includes("-Tmcp"), false, "use the package's pinned dependency, not a global tool alias");
});

test("only validated management snapshots can update the last-checked UI", () => {
  const snapshot = { schemaVersion: 1, mcp: "connected", ready: false, ownership: "none", project: "/app", host: "127.0.0.1", port: null, namespace: null, namespaceSource: "last-evaluation", observedAt: Date.now(), stale: false };
  const blocks = (value: unknown) => [{ type: "text", text: JSON.stringify(value) }];
  assert.deepEqual(readStatus(blocks(snapshot)), snapshot);
  assert.equal(readStatus([{ type: "text", text: "upstream eval output" }]), undefined);
  assert.equal(readStatus(blocks({ ...snapshot, ready: "yes" })), undefined);
  assert.equal(readStatus(blocks({ ...snapshot, port: 70000 })), undefined);
  assert.equal(readStatus(blocks({ schemaVersion: 1, error: "failed" })), undefined);
  assert.match(statusLabel(snapshot as never), /last checked not ready/);
  assert.match(statusLabel(), /not checked/);
});
