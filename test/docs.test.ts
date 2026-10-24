import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "bun:test";
import { PACKAGE_ROOT } from "../src/config.ts";

test("published documentation links, package identity and upstream pin remain consistent", async () => {
  const files = ["README.md", "AGENTS.md", "CHANGELOG.md"];
  for (const directory of ["docs", "skills"]) {
    for (const file of await readdir(resolve(PACKAGE_ROOT, directory), { recursive: true })) {
      if (file.endsWith(".md")) files.push(`${directory}/${file}`);
    }
  }
  const documents = new Map<string, string>();
  for (const file of files) documents.set(resolve(PACKAGE_ROOT, file), await readFile(resolve(PACKAGE_ROOT, file), "utf8"));
  for (const [path, source] of documents) {
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1]!;
      if (/^[a-z]+:/i.test(link)) continue;
      const [relative, anchor] = link.split("#");
      const target = resolve(dirname(path), relative || path);
      assert.ok((await stat(target)).isFile(), `${path}: missing ${link}`);
      if (anchor) {
        const text = documents.get(target) || await readFile(target, "utf8");
        const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(item => item[1]!.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-"));
        assert.ok(headings.includes(anchor), `${path}: missing anchor ${link}`);
      }
    }
  }
  const deps = await readFile(resolve(PACKAGE_ROOT, "deps.edn"), "utf8");
  const revision = /:git\/sha "([a-f0-9]{40})"/.exec(deps)?.[1];
  assert.ok(revision);
  assert.ok((await readFile(resolve(PACKAGE_ROOT, "clojure/src/pi_clojure/runtime.clj"), "utf8")).includes(revision));
  assert.ok(documents.get(resolve(PACKAGE_ROOT, "docs/reference.md"))!.includes(revision));
  const manifest = JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"));
  assert.equal(manifest.name, "pi-clojure-mcp");
  const repositoryUrl = manifest.homepage.replace(/#readme$/, "");
  assert.equal(new URL(repositoryUrl).protocol, "https:");
  assert.equal(manifest.repository.type, "git");
  assert.equal(manifest.repository.url, `git+${repositoryUrl}.git`);
  assert.equal(manifest.bugs.url, `${repositoryUrl}/issues`);
  assert.ok(manifest.author.name);
  assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
  for (const file of ["README.md", "docs/first-use.md"]) {
    assert.ok(documents.get(resolve(PACKAGE_ROOT, file))!.includes(`pi install npm:${manifest.name}@${manifest.version}`), `${file}: install version must match package.json`);
  }
  assert.ok(documents.get(resolve(PACKAGE_ROOT, "CHANGELOG.md"))!.includes(`## ${manifest.version}\n`));
  assert.match(manifest.packageManager, /^bun@\d+\.\d+\.\d+$/);
  assert.equal(manifest.scripts.test, "bun test ./test");
  const lock = Bun.JSONC.parse(await readFile(resolve(PACKAGE_ROOT, "bun.lock"), "utf8")) as { workspaces: { "": { name: string } } };
  assert.equal(lock.workspaces[""].name, manifest.name);
  await assert.rejects(stat(resolve(PACKAGE_ROOT, "package-lock.json")), { code: "ENOENT" });
  for (const host of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
    assert.equal(manifest.peerDependencies[host], "*");
    assert.ok(!manifest.dependencies?.[host], `host-provided ${host} must not be bundled`);
  }
  assert.deepEqual(manifest.pi.extensions, ["./src/extension.ts"]);
  assert.deepEqual(manifest.pi.skills, ["./skills"]);
  for (const required of ["src", "clojure/src", "skills", "deps.edn", "README.md", "CHANGELOG.md", "docs", "AGENTS.md", "LICENSE", "NOTICE"]) assert.ok(manifest.files.includes(required));
});
