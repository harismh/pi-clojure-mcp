import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export async function eventually(check: () => boolean, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for lifecycle condition");
    await delay(30);
  }
}
export function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
export async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  try { await eventually(() => child.exitCode !== null || child.signalCode !== null, 5000); }
  catch { child.kill("SIGKILL"); await eventually(() => child.exitCode !== null || child.signalCode !== null); }
}
export async function externalRepl(cwd: string) {
  const child = spawn(process.env.PI_CLOJURE_COMMAND || "clojure", ["-Srepro", "-Sdeps", '{:deps {nrepl/nrepl {:mvn/version "1.7.0"}}}', "-M", "-e",
    '(require (quote nrepl.server)) (let [s (nrepl.server/start-server :bind "127.0.0.1" :port 0)] (println "TEST_PORT=" (:port s)) (flush) @(promise))'],
  { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", data => { output += data.toString(); });
  child.stderr?.on("data", data => { output += data.toString(); });
  try {
    await eventually(() => /TEST_PORT=\s+\d+/.test(output) || child.exitCode !== null, 45_000);
    const port = /TEST_PORT=\s+(\d+)/.exec(output)?.[1];
    if (!port) throw new Error(`External test nREPL failed: ${output}`);
    return { child, port: Number(port) };
  } catch (error) { await stopChild(child); throw error; }
}
