# Performance toolkit

`mozole performance` measures production output without executing application code or
opening a browser. It checks static transfer-size budgets, oversized media/fonts and
regressions against a previously saved report. CLI, TUI [6] TOOLS → [P], and
`mozole verify --performance` use the same engine.

```sh
mozole performance --path ./project --build
mozole performance --path ./project --from build/client --base /client/ --json
mozole performance --save-baseline docs/quality/performance-baseline.json
mozole performance --baseline docs/quality/performance-baseline.json --output .mozole/performance.json
mozole ui --action performance --input dist
```

The default command is read-only and measures an existing `dist` or `build/client`.
When both exist, select `--from`. `--build` explicitly runs the project's `npm run build`
with a five-minute timeout; without it, output freshness is not established.
`--path` selects any local static-site project, including projects without a package.json.
A package.json with a build script is required only for `--build`.

## Budgets

The following is the default `performance.config.json`. All sizes are bytes; 1 KiB is
1024 bytes. Sections and settings can be omitted to retain defaults. Unknown keys,
negative values, strings and fractional byte limits are rejected. `--config` selects a
custom project-relative JSON file.

```json
{
  "budgets": {
    "jsGzip": 153600,
    "cssGzip": 51200,
    "htmlGzip": 51200,
    "mediaRaw": 524288,
    "fontRaw": 153600,
    "totalRaw": 10485760
  },
  "regression": { "percent": 10, "bytes": 4096 }
}
```

JS/CSS/HTML limits apply per emitted HTML route; media/font limits apply per file.
The total limit includes all nonexcluded output files, including unreferenced chunks and
media. Budgets are project policy defaults, not universal runtime performance targets.
Equality passes. Regression fails when growth exceeds **both** configured allowances.
For a zero-byte previous measurement, the absolute allowance still applies.

## What is counted

- HTML scripts and styles, including inline content, stylesheet links and script/style
  preloads. Alternate/disabled styles and `nomodule` scripts are excluded for the modern
  browser model. HTML comments and inert template contents do not add dependencies.
- Transitive static JS imports and re-exports; CSS `@import` dependencies. Cycles and
  duplicate preloads are counted once per route. CSS media/layer conditions are counted
  conservatively without evaluating a viewport.
- Literal dynamic imports are listed as deferred, not included in initial budgets.
  A dynamic import invoked at startup still appears as deferred: this is a syntax-based
  model, not a measurement of when the browser downloads code. Deferred descendants are
  not traversed; their files are still present in the build inventory and total budget.
- `<base href>`, `--base`, relative/absolute local URLs, query strings, fragments and URL
  encoding are resolved without fetching remote content.
- Raw, gzip level 9 and Brotli quality 5 sizes. Compressed totals sum per-file estimates.
  Inline estimates are assigned to JS/CSS budgets but are already inside HTML transfer;
  do not add route HTML/JS/CSS totals to infer exact network bytes.

HTML is parsed with [parse5](https://parse5.js.org/); JS import edges use
[es-module-lexer](https://github.com/guybedford/es-module-lexer/tree/1.7.0).
CSS imports use the existing PostCSS parser. Vite manifests are not required: actual
emitted HTML and module references drive the graph.

This does not measure Core Web Vitals, CPU execution, request latency, cache behavior,
third-party transfers, viewport-selected images/fonts, workers, runtime DOM insertion,
or routes that exist only in a client router. Only emitted HTML files define route
identities: `index.html` becomes `/`, `about/index.html` becomes `/about/`, and
`about.html` remains `/about.html`. Choose the same deployment base for comparisons.

## Findings and reports

Exit codes are **0** within budgets, **1** budget/regression violations or missing local
resources, **2** configuration, parsing, unsafe-path or operational errors. Warnings
(import maps, bare imports, external resources, computed imports, added/removed routes)
do not change the exit code; review them before interpreting a passing result.

`--json` emits a single JSON object, including on operational errors. `--output` writes
an atomic report. The report includes `kind: "mozole-performance"`, `schemaVersion: 1`,
`measurement: "static-transfer-v1"`, effective configuration, assets, routes, totals,
exclusions and findings. Ordering is deterministic and reports contain no timestamps.
Use the same Node/zlib version when comparing compressed measurements across machines.

`--baseline` compares route identities and total build size, so chunk hash changes alone
do not look like added routes. New routes still receive absolute budget checks.
`--save-baseline` creates a snapshot only when there are no error findings. A failed audit
can still write `--output`, but does not create a baseline. Existing baselines are never
overwritten: review a new snapshot and replace the tracked baseline deliberately.
Reports cannot overwrite input config/baseline files or unrelated JSON documents.

## Filesystem limits

All input/output paths stay inside the selected project. Reports and baselines must be
outside the build directory. Symlinks in build output are rejected. Files over 32 MiB,
builds over 512 MiB or 20,000 files, directory depth over 64, or dependency depth over
256 fail explicitly instead of passing with incomplete
measurements. Source maps, `.gz`/`.br` copies and dotfiles (including manifests) are
excluded and listed. Text resources must be UTF-8. Unsupported escaped CSS import syntax
fails explicitly. Large videos should be measured through a separate media workflow.

For CI, run the project build then `mozole performance --baseline <tracked-report> --json`.
There is no automatic baseline update or upload. For a custom output directory or base,
use the standalone command; `mozole verify --performance` uses the defaults and the
project's `performance.config.json` after its normal build stage.
