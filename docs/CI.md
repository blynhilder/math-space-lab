# Continuous integration

[Workflow](../.github/workflows/ci.yml) runs on every push and pull request,
and can also be dispatched manually once present on the default branch.
It uses one GitHub-hosted Ubuntu 24.04 job with Node.js 24 and Python 3.12.
Actions are pinned to release commit SHAs. The job has read-only repository
permissions, a ten-minute timeout, and cancels superseded runs for the same
branch or pull request. It does not need account secrets or model API keys.

## Prerequisites and build order

- There is no root npm workspace: install `math-plugin` and `math-site` separately.
  Both have npm lockfile version 3, integrity hashes and public npm registry URLs.
- `math-plugin` declares Node.js >=20; locked dependencies require no higher
  minimum. This CI checks Node.js 24 only, not every version allowed by that range.
- Python only uses the standard library (`pathlib`); no pip installation is needed.
- Keep dev and optional dependencies: esbuild is a dev dependency and uses its
  platform binary from an optional package. Clean Ubuntu installations and builds
  work with npm lifecycle scripts disabled; do not add `--omit=optional`.
- Build the bridge before Python embeds it into both HTML files. Build the Worker
  after that: its test imports `dist/server/index.js`, not the unbundled source.

## Reproduce from the repository root

Use Node.js 24, npm and Python 3.12. Run these commands in order; stop on the
first nonzero exit code, as GitHub Actions does. On systems without a `python`
command, use `python3`.

```sh
npm ci --prefix math-plugin --include=dev --ignore-scripts --no-audit --no-fund
npm ci --prefix math-site --include=dev --ignore-scripts --no-audit --no-fund
rm math-plugin/public/bridge.js math-plugin/public/math-lab.html math-site/src/math-lab.html
npm --prefix math-plugin run build:bridge
python scripts/build-ui.py
git diff --exit-code -- math-plugin/public/bridge.js math-plugin/public/math-lab.html math-site/src/math-lab.html
npm --prefix math-site run build
node math-lab-src/test-expression.cjs
node math-lab-src/test-matrix-analysis.cjs
node math-lab-src/check-matrix-crystal.cjs
npm --prefix math-plugin test
npm --prefix math-site test
```

The removal step ensures checked-in assets cannot conceal a missing build input.
The diff step deliberately fails when generated files are stale. After changing
scene or bridge source, regenerate and commit all changed generated assets before
running the full check again. No test failures are ignored or converted to success.
The initial CI change also removes one stale blank line from each generated HTML
file so that the existing generator reproduces them exactly.

## What a green run means

| Check | Automated coverage |
| --- | --- |
| Builds and generated-file diff | Bridge bundle, both embedded HTML files, Worker bundle and checked-in asset consistency |
| Expression checks | Precedence, supported functions, domains, invalid syntax and complexity bounds |
| Matrix regression | 15 tests covering rank, numerical tolerance, determinant interpretation and presets |
| Matrix/crystal factories | 261 assertions using VM contexts and stub DOM controls, including SC/BCC/FCC counts and plane equations |
| Node MCP | 26 tests including subtests; actual loopback HTTP on an ephemeral port, official SDK handshake, schemas and UI resource delivery |
| Worker | 3 tests importing the generated bundle, using an in-process fetch adapter with the official SDK |

These are current suite counts, not thresholds that CI substitutes for execution.
Network access is needed to download Actions, runtimes and npm packages. The tests
themselves use no deployed endpoint: the Worker URL is intercepted by the adapter,
and the Node server binds to loopback. No Cloudflare account or Wrangler is required.

Browser rendering, canvas interaction, screenshots, mobile layouts, accessibility
acceptance, embedding in a real MCP Apps client and Cloudflare/workerd deployment
behavior remain manual checks. `math-plugin/scripts/check-remote.js` requires an
explicit remote MCP URL and is intentionally outside this offline-service suite.
A green run is not a claim that those environments were tested, or that other
operating systems and Node versions are supported by CI.

## Independent execution record

The first [successful GitHub-hosted run](https://github.com/blynhilder/math-space-lab/actions/runs/41202854049)
tested commit `50784a6a1db1c3f165a80035edfafa62298cc442` on 2026-10-31 with Node.js
24.22.1, npm 11.19.1 and Python 3.12.15. All builds, generated-file checks and
the five suites above passed, with zero failed or skipped Node tests.

The README badge follows `main` and will reflect its runs after this workflow is
merged. Review a proposed change using its PR Checks tab; open a run and expand
individual steps to inspect commands and test output. The earlier
[validation snapshot](VALIDATION.md) records local checks separately.
