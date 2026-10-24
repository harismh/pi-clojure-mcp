import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "bun:test";
import { formatSkillsForPrompt, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { PACKAGE_ROOT } from "../src/config.ts";

const skillPath = join(PACKAGE_ROOT, "skills", "repl-driven-development", "SKILL.md");

test("bundled skill validates and advertises metadata without injecting its actual body", async () => {
  const result = loadSkillsFromDir({ dir: join(PACKAGE_ROOT, "skills"), source: "test" });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.skills.map(skill => skill.name), ["repl-driven-development"]);
  const skill = result.skills[0]!;
  assert.equal(skill.filePath, skillPath);
  assert.equal(skill.disableModelInvocation, false);

  const source = await readFile(skillPath, "utf8");
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  const [title, firstParagraph] = body.split(/\r?\n\s*\r?\n/);
  assert.ok(title?.startsWith("# "));
  assert.ok(firstParagraph);
  const advertised = formatSkillsForPrompt(result.skills);
  for (const metadata of [skill.name, skill.description, skill.filePath]) assert.ok(advertised.includes(metadata));
  assert.ok(!advertised.includes(title));
  assert.ok(!advertised.includes(firstParagraph));
});

test("skill retains runtime orientation, target choices and contract-directed verification", async () => {
  const source = await readFile(skillPath, "utf8");
  assert.match(source, /^## Orient to the runtime$/m);
  assert.match(source, /^### Choose a target$/m);
  assert.match(source, /`confirm_state_loss: true`/);
  assert.match(source, /`mcp__pi_clojure__`/);
  const tools = [...source.matchAll(/^\| `([a-z_]+)` \|/gm)].map(match => match[1]).sort();
  assert.deepEqual(tools, ["clojure_eval", "clojure_repl", "list_nrepl_ports", "paren_repair", "runtime_status"]);
  assert.match(source, /^## Verify the changed contracts$/m);
  assert.doesNotMatch(source, /^## Verify beyond the live session$/m);
});
