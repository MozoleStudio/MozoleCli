# Mozole CLI — Repository Engineering Policy & Operational Manual

> **Repository-Level Authoritative Policy:** This repository is governed by the Mozole Studio development engine. This file is the authoritative repository-level engineering contract. Agents must not alter or weaken the rules in this document unless the user explicitly instructs to modify this policy.

---

## 1. Commands

- `npm run verify` — Biome lint, TypeScript typecheck, Vitest unit & integration tests, and build
- `npm run dev -- --help` — Run the CLI locally via tsx
- `npm run dev -- <command>` — Run any CLI command locally
- `npm run format` — Auto-format source code with Biome
- `npm run dev -- add --list` — List project-owned UI foundations
- `npm run dev -- assets --path <project>` — Encode responsive WebP/AVIF assets
- `npm run dev -- release --path <project>` — Build and package static/PHP deployment artifacts
- TUI: `[6] TOOLS` exposes component addition, asset encoding and release packaging.
- `src/scaffold/tools-guide.ts` generates the project-local tool guide; keep it aligned with CLI options.

---

## 2. Zero Synthetic Attribution & Clean Commits

- **Prohibited Synthetic Artifacts:** Never insert synthetic authorship watermarks, generated-by comments, model metadata, or LLM signatures into source code, documentation, or commit messages.
- **Prohibited Git Trailers:** Never generate bot `Co-authored-by:` trailers, AI assistant labels, or synthetic commit trailers. Authentic human co-author attribution is permitted when requested by the user.
- **Commit Style:** Follow standard Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`). Keep commit titles imperative and body text descriptive of technical changes.

---

## 3. Architecture & Standards

- `src/cli.ts`: Central CLI router built with `citty`.
- `src/commands/`: CLI command implementations (`new`, `add`, `assets`, `release`, `prototype`, `adopt`, `backend`, `phase`, `repomap`, `test`, `verify`, `doctor`, `ui`).
- `src/qa/`: Mozole Quality Kit (PostCSS AST contract auditor, headless DOM geometry probe, media query boundary extractor, static accessibility auditor).
- `src/scaffold/`: Project scaffolding engines (Standard React Router 7 + SSG, Flagship Wouter + Canvas, pure PHP 8.1+ backend, tokens, phases, repomap, design).
- `src/server/`: Process management and local dev server supervisor.
- `src/utils/`: Safe filesystem atomic writes, subprocess execution with `shell: false`, Git helpers, and trace scanner.

---

## 4. Maintenance Rules

- **Subprocess Safety:** Keep all subprocess calls strictly as argument arrays with `shell: false`. Always trap signals (`SIGINT`, `SIGTERM`, `exit`) to prevent orphan processes.
- **Atomic File Operations:** Always write files atomically (using temporary PID files and `rename`) when persisting configurations, generated files, or state.
- **Headless Quality Verification:** Routine automated QA (`mozole test` or `mozole verify`) must never capture, diff, or inspect raster screenshots. Visual quality is verified headlessly through static AST contract auditing and live DOM geometry probing.
- **Pre-existing / Environmental Failure Handling:** If a failure is proven pre-existing, caused by external tooling, or due to a missing environmental dependency (e.g. system PHP runtime absent in a pure frontend workspace), the task may conclude provided:
  1. The changes introduced zero regressions.
  2. The environmental condition is clearly documented in the completion report with actionable evidence.

---

## 5. Design Tokens & Visual Guardrails

- **Canonical Token Source:** The sole authoritative design token repository is `src/styles/tokens.css`, declared directly via Tailwind v4 `@theme` syntax.
- **Zero Literal Values:** Never use hardcoded hex/rgb/hsl color literals or magic pixel offsets in components or style declarations. Consume tokens via utility classes or `var(--...)`.
- **Zero Code Cannibalization:** UI primitives must be bespoke application code living in `src/components/ui/`, using unstyled Radix primitives for accessibility; no generic pre-styled template dumping.
- **Performance & Motion:** `transition: all` is strictly prohibited. Declare explicit transition targets. Always respect `@media (prefers-reduced-motion: reduce)`.

---

## 6. Autonomous Agents & CI Integration (Google Jules)

- **Environment Setup:** Execute `npm install` to install dependencies. Node.js >= 20.9.0 is required.
- **Verification Contract:** Always run `npm run verify` before opening a Pull Request or concluding work. The pipeline encompasses Biome lint/format, TypeScript type checking (`tsc --noEmit`), release build (`tsc -p tsconfig.build.json`), and Vitest test suites.
- **Commit Contract:** Strictly adhere to Section 2 (Zero Synthetic Attribution & Clean Commits). Do not add AI labels, model mentions, or synthetic co-authorship trailers. Use Conventional Commits.
- **Line Endings & File Safety:** Respect `.gitattributes` (LF line endings across all platforms) and atomic file persistence.
