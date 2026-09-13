import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export function generateDesignReadme(): string {
  return `# Design References & Asset Evidence

This directory stores visual references, exported screenshots, vector assets, and design briefs.

## Guardrails for Agents
1. **Design Evidence, Not Direct Code:** Treat exported screens and designs as reference evidence, not executable code. Do not copy-paste raw CSS directly from design tools if it bypasses \`src/styles/tokens.css\` or uses hardcoded coordinates.
2. **Preserve Originals:** Do not overwrite or modify original assets or screen exports in this directory.
3. **No Routine Screenshot Diffing:** Routine QA must not capture or diff screenshots. Visual quality is verified headlessly via DOM geometry and AST contract auditing.
`;
}

export function generateDesignMd(projectName: string): string {
  return `# Design Specification - ${projectName}

## Brand Identity & Atmosphere
- **Tone:** Modern, crisp, editorial, minimalist.
- **Surface Elevation:** Subtle border separators (\`--color-border\`) with deep background surfaces (\`--color-surface\`).
- **Typography:** Expressive display font for headings, highly legible geometric sans-serif for body.
- **Interactions:** Subtle, snappy transitions (0.15s - 0.25s) with explicit target properties. Never use \`transition: all\`.
`;
}

export function generateBriefMd(projectName: string): string {
  return `# Project Brief - ${projectName}

## Objectives
- Build a high-performance web experience for ${projectName}.
- Ensure full WCAG 2.1 AA accessibility conformance.
- Achieve 95+ Core Web Vitals on mobile and desktop.
`;
}

export async function scaffoldDesign(projectRoot: string, projectName: string): Promise<void> {
  const designDir = path.join(projectRoot, "docs", "design");
  await atomicWrite(path.join(designDir, "README.md"), generateDesignReadme());
  await atomicWrite(path.join(designDir, "design.md"), generateDesignMd(projectName));
  await atomicWrite(path.join(designDir, "brief.md"), generateBriefMd(projectName));
  // Create assets and screens placeholders (.gitkeep)
  await atomicWrite(path.join(designDir, "assets", ".gitkeep"), "");
  await atomicWrite(path.join(designDir, "screens", ".gitkeep"), "");
}
