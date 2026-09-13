import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export interface PhaseDefinition {
  id: string;
  name: string;
  description: string;
  checklist: string[];
}

export const PHASES: PhaseDefinition[] = [
  {
    id: "00",
    name: "Project Initialization & Contracts",
    description:
      "Tooling configuration, canonical design tokens, and authoritative agent policies.",
    checklist: [
      "Authoritative AGENTS.md and CLAUDE.md established",
      "Canonical tokens defined in src/styles/tokens.css with Tailwind v4 @theme",
      "Biome linter/formatter configured and passing",
      "Git repository initialized with Conventional Commit rules",
      "Initial verification passing (mozole verify)",
    ],
  },
  {
    id: "01",
    name: "Core Architecture & Layout",
    description:
      "Application root shell, navigation container, footer, and responsive viewport frame.",
    checklist: [
      "Root layout established with single <main> landmark",
      "Skip-to-content accessible link implemented",
      "Navigation header with responsive mobile drawer/menu",
      "Footer landmark with copyright and essential links",
      "Zero viewport overflow at 320px minimum mobile width",
    ],
  },
  {
    id: "02",
    name: "Design Tokens & Primitive Components",
    description: "Bespoke Radix UI primitives, typography hierarchies, and token integration.",
    checklist: [
      "Bespoke primitives implemented in src/components/ui/ (Button, Dialog, Input)",
      "Zero hardcoded color hex/rgb literals (enforced by PostCSS AST audit)",
      "Semantic typography applied via var(--font-display) and var(--font-body)",
      "Interactive targets satisfy minimum 24px/44px touch area",
      "No transition: all used in component styling",
    ],
  },
  {
    id: "03",
    name: "Primary Routes & Pages",
    description: "Static content routes, hierarchy, meta tags, and document title management.",
    checklist: [
      "Home page and primary sub-pages declared with unique routes",
      "Single <h1> per page verified across all views",
      "Semantic HTML tags used (section, article, nav, aside)",
      "All images include descriptive alt text or explicit decorative alt=''",
      "External links include target='_blank' rel='noopener'",
    ],
  },
  {
    id: "04",
    name: "Interactive Features & State",
    description: "Client interactions, modal dialogs, and form submission flows.",
    checklist: [
      "Interactive modals and menus trap focus correctly",
      "Form controls declare explicit button types (type='button'/'submit')",
      "Mobile inputs satisfy 16px minimum font floor to prevent iOS zoom",
      "Input validation states accessible via aria-invalid and aria-describedby",
      "Keyboard Escape key dismisses active overlays",
    ],
  },
  {
    id: "05",
    name: "Dynamic Animation & Canvas (Flagship)",
    description: "Smooth scrolling, motion transitions, and persistent WebGL/Canvas layer.",
    checklist: [
      "Lenis smooth scroll initialized and managed cleanly",
      "Persistent WebGL or HTML5 canvas layer running smoothly at 60fps",
      "Prefers-reduced-motion respected (disables heavy motion & smooth scroll)",
      "Zero layout shifts (CLS < 0.05) during dynamic animations",
      "Route transitions maintain scroll position and focus context",
    ],
  },
  {
    id: "06",
    name: "Integrations & Security",
    description:
      "Form submission handling, anti-spam honeypot, security headers, and optional API endpoints.",
    checklist: [
      "Form submissions validated and protected against spam (honeypot or rate limiting)",
      "Security headers and CORS origins verified",
      "Input sanitization active on all interactive input fields",
      "Backend API endpoints (if applicable) or client form handlers respond cleanly",
      "Sensitive secrets and environment variables protected from client bundle leakage",
    ],
  },
  {
    id: "07",
    name: "Accessibility & WCAG 2.1 AA",
    description: "Screen reader tree, keyboard navigation, and color contrast compliance.",
    checklist: [
      "All interactive elements reachable and operable via Keyboard Tab/Shift-Tab",
      "Color contrast ratios meet or exceed 4.5:1 (normal text) and 3:1 (large text)",
      "Focus indicator visible and distinct on all interactive controls",
      "ARIA roles, states, and properties valid and non-redundant",
      "Automated a11y audit passes with zero critical violations",
    ],
  },
  {
    id: "08",
    name: "Performance & Core Web Vitals",
    description: "Asset optimization, modern formats (WebP/AVIF), font loading, and LCP tuning.",
    checklist: [
      "LCP element prioritized and fonts preloaded without layout shift",
      "Responsive images use srcset or modern picture elements",
      "Zero blocking third-party scripts or render-delaying styles",
      "Production build bundle size within performance budget (< 150kB initial JS)",
      "Lighthouse performance target >= 95",
    ],
  },
  {
    id: "09",
    name: "Browser & Breakpoint QA",
    description: "Headless DOM geometry probing across media query boundaries (320px to 1920px).",
    checklist: [
      "Headless DOM probe verifies zero horizontal scroll across all boundaries",
      "Text clipping inspected against overflow:hidden ancestors (zero defects)",
      "Touch targets verified across mobile viewports (320px, 375px, 390px)",
      "Tablet and desktop viewports verified (768px, 1024px, 1440px, 1920px)",
      "Zero raster screenshot dependency during routine QA",
    ],
  },
  {
    id: "10",
    name: "Production Readiness & Launch",
    description: "Final static build, SSG pre-rendering, sitemap, and deployment readiness.",
    checklist: [
      "Full static build succeeds with zero TypeScript or Biome errors",
      "Static pre-rendering generates all required HTML entrypoints",
      "Robots.txt and sitemap.xml generated and verified",
      "Clean git tree with Conventional Commits and zero AI attribution traces",
      "Production deployment verified on hosting target",
    ],
  },
];

export function generatePhasesStatusMd(currentPhase = "00"): string {
  let content = `# Project Development Phases & Status

> **Discipline Notice:** Development proceeds sequentially through phases 00 to 10. Run \`mozole phase status\` to inspect progress, and \`mozole phase next\` to advance upon passing all checklist criteria and \`mozole verify\`.

**Current Phase:** Phase ${currentPhase}

---

`;

  for (const p of PHASES) {
    const isCompleted = Number(p.id) < Number(currentPhase);
    const isCurrent = p.id === currentPhase;
    const statusBadge = isCompleted ? "[COMPLETED]" : isCurrent ? "[IN PROGRESS]" : "[PENDING]";

    content += `### Phase ${p.id}: ${p.name} ${statusBadge}\n`;
    content += `${p.description}\n\n`;
    for (const item of p.checklist) {
      const mark = isCompleted ? "[x]" : "[ ]";
      content += `- ${mark} ${item}\n`;
    }
    content += "\n---\n\n";
  }

  return content;
}

export async function scaffoldPhases(projectRoot: string): Promise<void> {
  const statusMd = generatePhasesStatusMd("00");
  await atomicWrite(path.join(projectRoot, "docs", "phases", "status.md"), statusMd);
}
