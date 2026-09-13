import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export function generateCanonicalTokensCss(): string {
  return `@import "tailwindcss";

@theme static {
  /* Palette */
  --color-background: #090a0f;
  --color-foreground: #f8fafc;
  --color-surface: #12141c;
  --color-surface-elevated: #1a1d29;
  --color-border: #232738;
  --color-border-subtle: #171a26;

  --color-primary: #3b82f6;
  --color-primary-foreground: #ffffff;
  --color-accent: #60a5fa;
  --color-canvas-start: rgba(59, 130, 246, 0.06);
  --color-canvas-end: rgba(9, 10, 15, 0);
  --color-accent-foreground: #090a0f;

  --color-muted: #1e2230;
  --color-muted-foreground: #94a3b8;

  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  /* Typography */
  --font-display: "Cabinet Grotesk", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
  --font-body: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
  --font-interface: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.8125rem);
  --text-sm: clamp(0.875rem, 0.825rem + 0.25vw, 0.9375rem);
  --text-base: clamp(1rem, 0.95rem + 0.25vw, 1.0625rem);
  --text-lg: clamp(1.125rem, 1.05rem + 0.375vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1.35rem + 0.75vw, 1.875rem);
  --text-3xl: clamp(1.875rem, 1.65rem + 1.125vw, 2.25rem);
  --text-4xl: clamp(2.25rem, 1.95rem + 1.5vw, 3rem);
  --text-5xl: clamp(3rem, 2.5rem + 2.5vw, 4.5rem);

  /* Layout */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  --spacing-container-max: 1280px;
  --spacing-container-gutter: clamp(1rem, 0.5rem + 2.5vw, 2.5rem);

  /* Shadows */
  --shadow-solid-sm: 0 2px 0 0 rgba(0, 0, 0, 0.4);
  --shadow-solid-md: 0 4px 0 0 rgba(0, 0, 0, 0.5);
  --shadow-solid-lg: 0 8px 0 0 rgba(0, 0, 0, 0.6);
}

@layer base {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    font-family: var(--font-body);
    font-size: 16px;
    background-color: var(--color-background);
    color: var(--color-foreground);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
  }

  p {
    margin: 0;
    line-height: 1.6;
  }

  /* Accessible focus rings */
  :focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms;
      animation-iteration-count: 1;
      transition-duration: 0.01ms;
      scroll-behavior: auto;
    }
  }
}
`;
}

export async function scaffoldTokens(projectRoot: string): Promise<void> {
  const css = generateCanonicalTokensCss();
  await atomicWrite(path.join(projectRoot, "src", "styles", "tokens.css"), css);
}
