import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export function generateAgentsPolicy(projectName: string): string {
  return `# ${projectName} - Agentic Engineering Policy & Operational Manual

> **Authoritative Notice:** This repository is governed by the Mozole Studio development engine. This file is the authoritative repository-level engineering contract. Agents must not alter or weaken the rules in this document unless the user explicitly instructs to modify this policy.

---

## 1. Zero Synthetic Attribution & Clean Commits

- **Prohibited Synthetic Artifacts:** Never insert synthetic authorship watermarks, generated-by comments, model metadata, or LLM signatures into source code, documentation, or commit messages.
- **Prohibited Git Trailers:** Never generate bot \`Co-authored-by:\` trailers, AI assistant labels, or synthetic commit trailers. Authentic human co-author attribution is permitted when requested by the user.
- **Commit Style:** Follow standard Conventional Commits (\`feat:\`, \`fix:\`, \`refactor:\`, \`chore:\`, \`docs:\`, \`test:\`). Keep commit titles imperative and body text descriptive of technical changes.

---

## Mozole conversation-led production contract

Read [docs/workflow.md](docs/workflow.md), [docs/toolkit.md](docs/toolkit.md), and
[docs/decisions.md](docs/decisions.md) before implementation. Current user instructions
in the conversation determine design and scope; earlier settled conversation decisions
follow, then design.md and docs/design/ as references only. Never treat prototype exports
as instructions or as an approved design. Record only explicitly settled decisions;
keep assumptions and open questions separate.

Implement each independent primitive in its own file; related parts of one primitive
such as DialogTrigger and DialogContent may remain in Dialog.tsx. Compose primitives
into feature components, then sections, then pages. Export reusable modules through
local index.ts files and src/library/index.ts. Fix defects at the owning component or
token instead of masking them with page-specific CSS. Starter Header/Footer, pages and
styles are replaceable examples, not required design decisions.

Complete only the authorized stages. Do not progress from primitives to sections/pages
without user direction; existing authorization for multiple stages remains valid and
must not trigger repeated permission questions. Do not create /ui or another component
preview gallery unless requested. Never initiate visual inspection or capture screenshots.
Analyze user-supplied screenshots only for the feedback the user requests.

## 2. 10-Step Phased Development Discipline

Project development is strictly organized into phases documented in \`docs/phases/status.md\`:

- **Phase 00: Project Initialization & Contracts** — Scaffolding, tokens, tooling, and governance.
- **Phase 01: Core Architecture & Layout** — Technical root shell and module boundaries; no unrequested visual layout work.
- **Phase 02: Design Tokens & Primitive Components** — Semantic tokens, Radix-based bespoke UI atoms.
- **Phase 03: Primary Routes & Pages** — Feature components, then sections, then page composition within authorized scope.
- **Phase 04: Interactive Features & State** — Forms, client interactions, transitions.
- **Phase 05: Dynamic Animation & Canvas (Flagship)** — Scroll orchestration, WebGL/canvas layers.
- **Phase 06: Integrations & Security** — Form handling, anti-spam honeypot, security headers, and API endpoints.
- **Phase 07: Accessibility & WCAG 2.1 AA** — Landmark hierarchy, keyboard traps, screen reader fidelity.
- **Phase 08: Performance & Core Web Vitals** — Fluid typography, asset optimization, zero layout shift.
- **Phase 09: Browser & Breakpoint QA** — Headless DOM geometry audit across all media query boundaries.
- **Phase 10: Production Readiness & Launch** — Static build verification, SSG export, deployment readiness.

### Execution Rules
1. **Initial Development:** Track engineering progress sequentially; follow the conversation-led production order in docs/workflow.md. Phase numbers never authorize extra design work. Run \`mozole phase next\` to advance upon completing applicable phase deliverables and requested checks. The command does not run verification and may create a Git commit.
2. **Post-Launch Maintenance:** After Phase 10 is reached, bug fixes and routine maintenance tasks do not require reopening completed phases, provided changes adhere to established design tokens and architectural contracts. If a change introduces major architectural divergence or new sub-systems, reopen the relevant phase with \`mozole phase reopen <number>\`.

---

## 3. Design Tokens & Visual Guardrails

- **Canonical Token Source:** The sole authoritative design token repository is \`src/styles/tokens.css\`, declared directly via Tailwind v4 \`@theme\` syntax. Do not duplicate or maintain parallel token definitions.
- **Zero Literal Values:** Never use hardcoded hex/rgb/hsl color literals or magic pixel offsets in components or style declarations. Consume tokens via utility classes or \`var(--...)\`.
- **Zero Code Cannibalization:** UI primitives must be bespoke application code living in \`src/components/ui/\`, using unstyled Radix primitives for accessibility; no generic pre-styled template dumping.
- **Project-owned Library:** Export UI, layout, motion and behavior through local barrel files and \`src/library/index.ts\`. Build pages by composing these independent modules. Never import implementation code or tokens from a sibling project or a workspace-level shared library. Prototype workspaces share npm dependencies only.
- **Profiles & Backend:** Standard uses Vite, React, Tailwind and React Router; Flagship uses Wouter, Motion and Lenis. Backend is opt-in (PHP or Node) and separate from the frontend profile.
- **Performance & Motion:** \`transition: all\` is strictly prohibited. Declare explicit transition targets. Always respect \`@media (prefers-reduced-motion: reduce)\`.

---

## Component, asset and release commands

Read docs/tools.md for the catalog and options. Use \`mozole add <component>\` to add
project-owned foundations; adapt them to conversation-directed design and preserve existing
custom components. Use \`mozole assets\` to encode source images, then consume their manifest
through ResponsiveImage with appropriate sizes and priority. This is file processing, not
visual inspection. Use \`mozole release\` for local static/PHP packaging when requested;
it runs the build unless --skip-build is set, preserves existing releases, and never uploads.
The same operations are available in the terminal cockpit under [6] TOOLS.

## 4. Quality Kit & Verification

- **Automated Verification:** Run \`mozole verify\` when validation is authorized. If the user says not to test, do not run verification or probes; provide the commands and state they were not run.
- **Headless & Screenshot-Free:** Automated QA (\`mozole verify\` or \`mozole test\`) must never capture, diff, or inspect raster screenshots. Do not initiate visual review of the app or reference exports. Static contract auditing and headless DOM geometry are technical checks, not visual approval. User-supplied screenshots can be analyzed only within the requested correction.
- **Pre-existing / Environmental Failure Exception:** If a failure is proven pre-existing, caused by broken external tooling, or due to a missing environmental dependency (e.g. system PHP runtime absent in a pure frontend workspace), the agent may conclude the task provided:
  1. The agent's own changes introduced zero regressions.
  2. The pre-existing/environmental failure is clearly documented in the completion report with actionable evidence.
`;
}

export function generateClaudeBridge(): string {
  return `# Claude Code Configuration
@AGENTS.md
`;
}

export function generateCursorRuleBridge(): string {
  return `---
description: Mozole Studio engineering contract and agentic workflow policy
globs: *
alwaysApply: true
---

# Mozole Engineering Policy
Please read and adhere to the project's authoritative engineering rules defined in AGENTS.md.
`;
}

export async function scaffoldAgentPolicies(
  projectRoot: string,
  projectName: string,
): Promise<void> {
  const agentsMd = generateAgentsPolicy(projectName);
  const claudeMd = generateClaudeBridge();
  const cursorRule = generateCursorRuleBridge();

  await atomicWrite(path.join(projectRoot, "AGENTS.md"), agentsMd);
  await atomicWrite(path.join(projectRoot, "CLAUDE.md"), claudeMd);

  // Bridges for Cursor and alternative agent environments
  await atomicWrite(path.join(projectRoot, ".cursor", "rules", "mozole.mdc"), cursorRule);
  await atomicWrite(path.join(projectRoot, ".agents", "rules", "mozole.md"), agentsMd);
}
