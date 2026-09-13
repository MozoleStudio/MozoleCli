import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export function generateRepomapArchitecture(projectName: string, isFlagship: boolean): string {
  return `# Architecture Overview - ${projectName}

## Technology Stack
- **Engine:** Vite (Universal ESM Build Engine)
- **Frontend Framework:** React 19
- **Routing Model:** ${isFlagship ? "Wouter (Headless Micro-Router with Dynamic View Transitions)" : "React Router 7 (Framework Mode with Static Pre-rendering / SSG)"}
- **Styling Architecture:** Tailwind CSS v4 with Canonical Tokens in \`src/styles/tokens.css\`
- **UI Primitives:** Bespoke application components backed by unstyled Radix UI primitives
${isFlagship ? "- **Creative Experience:** Lenis (Smooth Scroll) + Motion + Persistent Canvas Layer\n" : ""}
- **Backend Architecture:** Pure PHP 8.1+ Zero-Dependency API (Contact Mailer, Honeypot, IP Rate Limiter)

## Directory Hierarchy
\`\`\`
├── api/                    # Pure PHP 8.1+ endpoints & security htaccess
├── docs/
│   ├── design/             # Design references, exported assets & screens
│   ├── phases/             # 10-step atomic development status
│   └── repomap/            # Architecture, components, and routes index
├── src/
│   ├── components/
│   │   ├── layout/         # Header, Footer, PageShell
│   │   └── ui/             # Bespoke Radix UI primitives (Button, Dialog, etc.)
│   ├── routes/             # Page components and views
│   └── styles/
│       └── tokens.css      # Sole canonical design token repository (@theme)
└── AGENTS.md               # Authoritative engineering contract
\`\`\`
`;
}

export function generateRepomapComponents(): string {
  return `# Component Registry & Primitives Index

All UI primitives are bespoke application code located in \`src/components/ui/\`.

| Component | Path | Backing Primitive | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Header** | \`src/components/layout/Header.tsx\` | Semantic \`<header>\` | Main navigation, mobile drawer toggle, branding |
| **Footer** | \`src/components/layout/Footer.tsx\` | Semantic \`<footer>\` | Site links, legal notes, copyright |
| **Button** | \`src/components/ui/Button.tsx\` | Native \`<button>\` | Accessible action trigger, variant styling, loading state |
| **Dialog** | \`src/components/ui/Dialog.tsx\` | Radix \`@radix-ui/react-dialog\` | Accessible modal dialog, focus trap, escape key |
| **Input** | \`src/components/ui/Input.tsx\` | Native \`<input>\` | Form control with 16px mobile font floor and error states |

> **Contract Rule:** Primitives must remain unopinionated, unstyled Radix foundations with project design tokens applied. No external template dumping.
`;
}

export function generateRepomapRoutes(): string {
  return `# Routes & Page Index

| Path | Component | Layout | Purpose |
| :--- | :--- | :--- | :--- |
| \`/\` | \`src/routes/home.tsx\` | Root Layout | Primary landing page & value proposition |
| \`/about\` | \`src/routes/about.tsx\` | Root Layout | Studio background and team ethos |
| \`/contact\` | \`src/routes/contact.tsx\` | Root Layout | Contact form, interactive inquiry submission |

> **SEO & A11y Requirement:** Every route must export a unique title and meta description, and render exactly one top-level \`<h1>\` tag.
`;
}

export function generateRepomapTokens(): string {
  return `# Design Tokens Index

Canonical token definitions live in \`src/styles/tokens.css\` using Tailwind v4 \`@theme\`.

## Color Tokens
- \`--color-background\`: Primary viewport background.
- \`--color-foreground\`: Primary text and icon color.
- \`--color-surface\`: Card and panel background surface.
- \`--color-primary\`: Brand primary interactive accent.
- \`--color-border\`: Component outline and separator.

## Typography Roles
- \`--font-display\`: Headings (\`<h1>\` through \`<h6>\`).
- \`--font-body\`: Paragraphs, captions, and body copy.
- \`--font-mono\`: Code snippets, technical telemetry, and metadata.

## Fluid Text Scales
- \`--text-xs\` to \`--text-5xl\`: Fluid viewport-scaled typography via \`clamp()\`.
`;
}

export async function scaffoldRepomap(
  projectRoot: string,
  projectName: string,
  isFlagship = false,
): Promise<void> {
  const repomapDir = path.join(projectRoot, "docs", "repomap");
  await atomicWrite(
    path.join(repomapDir, "architecture.md"),
    generateRepomapArchitecture(projectName, isFlagship),
  );
  await atomicWrite(path.join(repomapDir, "components.md"), generateRepomapComponents());
  await atomicWrite(path.join(repomapDir, "routes.md"), generateRepomapRoutes());
  await atomicWrite(path.join(repomapDir, "tokens.md"), generateRepomapTokens());
}
