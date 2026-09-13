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
git clone git@github.com:mozolestudio/cli.git
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
Generates a complete, verified client project adhering to all Mozole Studio governance rules and design tokens.

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
- `mozole phase next` — Validates criteria, creates a conventional commit (`feat(phase-XX): ...`), and unlocks the next phase.
- `mozole phase reopen <id>` — Reopens a completed phase for post-launch maintenance.

### `mozole repomap [sync|check]`
Synchronizes and audits the `docs/repomap/` architectural index, component registry, and route catalog.

### `mozole test [contract|a11y|all]`
Executes Mozole Quality Kit static and headless verification suites.

### `mozole verify`
The authoritative, multi-stage deterministic gate required before completing agentic tasks:
1. AI Trace Scanner (strictly prohibits synthetic watermarks and bot co-author trailers)
2. Biome lint & code style check
3. TypeScript compiler typecheck (`tsc --noEmit`)
4. PostCSS design token contract audit
5. Accessibility & landmark hierarchy validation

### `mozole doctor`
Diagnoses workstation prerequisites, Node.js version (>= 20), Git, PHP 8.1+ status, and network port availability.

### `mozole ui` (or bare `mozole`)
Launches the interactive terminal cockpit.

---

## Repository Governance

This project is governed by [AGENTS.md](./AGENTS.md). All automated agents and contributors must adhere to the rules therein.

## License

MIT © Mozole Studio
