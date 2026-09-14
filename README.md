# Mozole CLI (`@mozole/cli`)

> **Mozole Studio** internal project generator and development cockpit tailored for autonomous agentic engineering workflows.

---

## Highlights

- **Vite-Powered Frontend Engines:**
  - **Standard Profile:** React 19 + React Router 7 (Framework Mode Plugin) + Static Pre-rendering (SSG) + Tailwind CSS v4 + bespoke Radix UI primitives.
  - **Flagship Creative Profile (`--flagship`):** React 19 + Wouter + Lenis (Smooth Scroll) + Motion + Persistent 60fps Canvas/WebGL layer.
- **Pure PHP 8.1+ Zero-Dependency Backend:**
  - Engineered for budget shared hosting (cPanel 250k Inodes, 25 MB/s I/O, Imunify360).
  - 5-Layer Security Architecture: Origin/Referer verification, honeypot spam protection, file-based IP rate-limiting, direct file access denial for `config.php`, input sanitization.
- **10-Step Phased Development Pipeline:**
  - Sequential phases (Phase 00–10) with status tracking in `docs/phases/status.md` and automated phase advancement commits (`mozole phase next`).
  - Post-launch maintenance workflow (`mozole phase reopen <id>`).
- **Architectural Fihrist (`docs/repomap/`):**
  - Continuous mapping of architecture, bespoke UI primitives, application routes, and design tokens.
- **Mozole Quality Kit:**
  - Static PostCSS AST contract auditor enforcing token integrity (`src/styles/tokens.css`), banning literal colors, raw font families, and `transition: all`.
  - Headless in-browser DOM geometry probe detecting layout reflow defects, text clipping, and minimum touch target violations.
  - Automated WCAG 2.1 AA landmark and accessibility auditor.
- **Interactive Terminal Cockpit (`mozole ui`):**
  - Clean, lightweight TUI to inspect client projects, advance phases, and run deterministic verification.

---

## Installation & Local Development

```bash
# Clone and install dependencies
git clone git@github.com:mozolestudio/MozoleCli.git
cd MozoleCli
npm install

# Run verification suite (Biome lint, TypeScript typecheck, Vitest, build)
npm run verify

# Run local development binary
npm run dev -- --help
```

---

## Command Reference

### `mozole new <name> [--flagship] [--backend=php|node]`
Generates a client project with Mozole Studio governance and canonical design tokens. Install its dependencies with `npm install`, then run `mozole verify` to check the generated project in your environment.

```bash
# Standard React Router 7 + SSG + Tailwind v4 project
mozole new acme-corp

# Flagship creative project with smooth scroll & persistent canvas
mozole new studio-flagship --flagship
```

### `mozole prototype init`
Initializes a new prototype repository workspace with a multi-project `projects/` directory and shared token bridges.

### `mozole adopt [path]`
Adopts an existing web project into Mozole Studio governance, injecting `AGENTS.md`, `CLAUDE.md`, `docs/phases/status.md`, `docs/repomap/`, and design token foundations.

### `mozole phase [status|next|reopen]`
Manages project progression through the 10-step atomic development lifecycle:

- `mozole phase status` — Displays visual checklist and status for all phases.
- `mozole phase next` — Advances one phase and creates a conventional commit (`feat(phase-XX): ...`) when Git is initialized. Complete the checklist and run `mozole verify` first; checklist completion is a developer responsibility. Failed commits restore the previous phase file and Git index.
- `mozole phase reopen <id>` — Reopens a completed phase for post-launch maintenance.

### `mozole repomap [sync|check]`
Synchronizes and audits the `docs/repomap/` architectural index, component registry, and route catalog.

### `mozole test [contract|a11y|probe|all]`
Executes Mozole Quality Kit verification suites:
- `mozole test contract` — PostCSS AST design token contract audit (prohibits literal colors, `transition: all`, fixed viewport dimensions).
- `mozole test a11y` — Static HTML and accessibility landmark hierarchy validation.
- `mozole test probe` — Headless live DOM geometry and trace runner. Discovers local Brave/Chromium (or auto-provisions Playwright Chromium if absent). Measures live bounding boxes, horizontal overflow on mobile viewports (320px+), text clipping, touch targets (<24px), prefers-reduced-motion violations, and 200% text-zoom reflow stress. Strictly zero raster screenshots (`screenshots: false, snapshots: true`); emits full interactive trace packages to `docs/qa/trace.zip` for inspection via [trace.playwright.dev](https://trace.playwright.dev).
- `mozole test all` (default) — Executes static contract and accessibility audits.

### `mozole verify [--probe]`
The authoritative, multi-stage deterministic gate required before completing agentic tasks:
1. AI Trace Scanner (strictly prohibits synthetic watermarks and bot co-author trailers)
2. Biome lint & code style check
3. Project `typecheck` script (including React Router type generation), or local TypeScript compiler
4. Production build (`npm run build`)
5. PostCSS design token contract audit
6. Accessibility & landmark hierarchy validation against built HTML
7. *(Optional with `--probe`)* Live headless DOM geometry & trace probe across critical viewports

Biome and TypeScript must be installed locally; verification never downloads missing CLI tools with `npx`. Standard projects emit static pages for `/`, `/about`, and `/contact` without requiring a Node server in production. See the [React Router pre-rendering documentation](https://reactrouter.com/how-to/pre-rendering) for hosting configuration.

The PHP contact backend requires an allowed Origin or a Referer with the same scheme, host and port as an allowed origin. Requests without either are rejected. Rate-limit storage errors return HTTP 503; mail transport failures return HTTP 502 with `success: false`. Configure `api/config.php` and the hosting mail transport before accepting real submissions.

### `mozole doctor`
Diagnoses workstation prerequisites: Node.js (>= 20), Git, PHP 8.1+ status, local Chromium/Brave browser engine availability, and network port availability.

### `mozole ui` (or bare `mozole`)
Launches the interactive terminal cockpit.

---

## Repository Governance

This project is governed by [AGENTS.md](./AGENTS.md). All automated agents and contributors must adhere to the rules therein.

## License

MIT © Mozole Studio

## Repository hygiene (2.2.0)

Use `mozole hygiene --strict --json` to audit repository metadata and vendor references.
Use `mozole hygiene --fix` on a clean mozolestudio checkout for conservative signature
cleanup, `--history 100` to inspect recent commits, and `--message <file>` to validate
commit text. See [the maintenance runbook](docs/repository-hygiene.md) for scope, exit
codes, skipped files and recurring maintenance integration.

## Performance budgets (2.2.0)

```sh
mozole performance --build
mozole performance --from build/client --base /client/ --json
mozole performance --save-baseline docs/quality/performance-baseline.json
mozole performance --baseline docs/quality/performance-baseline.json
mozole verify --performance
```

The performance toolkit checks per-route JS/CSS/HTML compression budgets, large media
and fonts, total output size and regressions. It follows static imports and CSS imports,
reports dynamic modules separately, and supports JSON reports and the TUI [P] action.
See [performance scope and configuration](docs/performance.md). This is a static size
check; it does not measure runtime page speed or Core Web Vitals.

## Publishing a verified package

Run `npm run verify`, then `npm pack`. Packing rebuilds a clean `dist` directory and
includes toolkit documentation. Inspect the archive and smoke-test its installed CLI.
To publish the reviewed archive, run `npm publish ./mozole-cli-2.2.2.tgz --access public`
with an authorized npm account. Package creation does not publish anything.
