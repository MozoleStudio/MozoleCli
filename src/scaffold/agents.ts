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

## 2. 10-Step Phased Development Discipline

Project development is strictly organized into phases documented in \`docs/phases/status.md\`:

- **Phase 00: Project Initialization & Contracts** — Scaffolding, tokens, tooling, and governance.
- **Phase 01: Core Architecture & Layout** — Root layout, navigation shell, responsive viewport frame.
- **Phase 02: Design Tokens & Primitive Components** — Semantic tokens, Radix-based bespoke UI atoms.
- **Phase 03: Primary Routes & Pages** — Route declarations, static content hierarchy.
- **Phase 04: Interactive Features & State** — Forms, client interactions, transitions.
- **Phase 05: Dynamic Animation & Canvas (Flagship)** — Scroll orchestration, WebGL/canvas layers.
- **Phase 06: Backend Integration & Security** — PHP endpoints, mailer, rate-limiting, honeypot.
- **Phase 07: Accessibility & WCAG 2.1 AA** — Landmark hierarchy, keyboard traps, screen reader fidelity.
- **Phase 08: Performance & Core Web Vitals** — Fluid typography, asset optimization, zero layout shift.
- **Phase 09: Browser & Breakpoint QA** — Headless DOM geometry audit across all media query boundaries.
- **Phase 10: Production Readiness & Launch** — Static build verification, SSG export, deployment readiness.

### Execution Rules
1. **Initial Development:** Must advance sequentially. Run \`mozole phase next\` to advance upon completing all phase deliverables and passing \`mozole verify\`.
2. **Post-Launch Maintenance:** After Phase 10 is reached, bug fixes and routine maintenance tasks do not require reopening completed phases, provided changes adhere to established design tokens and architectural contracts. If a change introduces major architectural divergence or new sub-systems, reopen the relevant phase with \`mozole phase reopen <number>\`.

---

## 3. Design Tokens & Visual Guardrails

- **Canonical Token Source:** The sole authoritative design token repository is \`src/styles/tokens.css\`, declared directly via Tailwind v4 \`@theme\` syntax. Do not duplicate or maintain parallel token definitions.
- **Zero Literal Values:** Never use hardcoded hex/rgb/hsl color literals or magic pixel offsets in components or style declarations. Consume tokens via utility classes or \`var(--...)\`.
- **Zero Code Cannibalization:** UI primitives must be bespoke application code living in \`src/components/ui/\`, using unstyled Radix primitives for accessibility; no generic pre-styled template dumping.
- **Performance & Motion:** \`transition: all\` is strictly prohibited. Declare explicit transition targets. Always respect \`@media (prefers-reduced-motion: reduce)\`.

---

## 4. Quality Kit & Verification

- **Automated Verification:** Run \`mozole verify\` before completing any task.
- **Headless & Screenshot-Free:** Routine automated QA (\`mozole qa\` or \`mozole test\`) must never capture, diff, or inspect raster screenshots. Visual quality is verified headlessly through static AST contract auditing and live DOM geometry probing.
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
