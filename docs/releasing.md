# Releasing

Pi packages use the ordinary npm registry. This package declares its extension and skill in `package.json`; no separate Pi registration or TypeScript build is required. The `pi-package` keyword makes the published package eligible for gallery discovery.

## 1. Prepare and check

From the package root:

```sh
bun install --frozen-lockfile
clojure -Srepro -P
bun run check
bun test
bun run test:clojure
bun run pack:check
```

These checks do not publish anything. Tests use disposable processes, not an existing user REPL. Do not reload the working Pi/MCP session to perform release checks.

Review:

- Version, repository/homepage/issue links, author, license and public-registry metadata in `package.json`.
- The matching entry in [CHANGELOG](../CHANGELOG.md), and versioned installation commands in [README](../README.md) and [first use](first-use.md).
- The actual package contents: extension source, Clojure source, `deps.edn`, skill, docs, changelog and license/notices. Development dependencies, editor caches, logs, credentials and application data must not be bundled.
- An extracted tarball loaded through an isolated Pi configuration, without the checkout's `node_modules`. Verify both skill discovery and MCP startup. This checks the distribution boundary that checkout-based integration tests do not establish.
- The [documented compatibility limits](development.md). Do not infer support for untested platforms or JDKs from a passing local suite.

Bun is development tooling, not an installed extension requirement. Pi supplies the host packages declared as `"*"` peer dependencies; do not bundle extra copies.

## 2. Commit and identify the release

After reviewing the prepared files and checks, commit and push the source. Tag the corresponding commit as `v0.1.0` for the initial release, then push the tag. Later releases should use their own version and matching tag.

A Git commit/tag is not required by npm itself, but a public release should correspond to an identifiable source revision. Committing, tagging and publishing are separate deliberate actions—not side effects of the test commands.

## 3. Authenticate and publish

Authenticate with an npm account authorized to publish the package. Bun can use credentials written by `npm login`; do not put tokens in source or commit them.

```sh
npm login
bun publish --dry-run --ignore-scripts
# Review the packaged file list before publishing:
bun publish --access public
```

Bun 1.4.2 requires registry authentication even for `publish --dry-run`. Use `bun run pack:check` for the unauthenticated file-list check in step 1. A missing-login error does not mean the test suites or package-content check failed.

If npm requests a one-time password, supply it through Bun's `--otp` option. For automated releases, configure registry-supported trusted publishing or appropriate publishing credentials separately; this repository does not currently include a publishing workflow.

Published name/version pairs cannot be overwritten. Use a new version for subsequent releases.

## 4. Verify the published version

```sh
bun info pi-clojure-mcp@0.1.0
pi install npm:pi-clojure-mcp@0.1.0
```

Verify installation in an isolated Pi configuration, or replace the previous local/Git source at a safe session boundary. Do not enable both copies. Inspect `/clj`, `/mcp`, and `/skill:repl-driven-development`; remember that MCP connectivity alone does not establish application readiness.

An npm version pin stays pinned. Publish a new version and update the installed source when deliberately moving to a later release.
