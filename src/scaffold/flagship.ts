import path from "node:path";
import { atomicWrite } from "../utils/fs.js";
import { generateBespokeButton, generateBespokeInput } from "./standard.js";

export function generateFlagshipPackageJson(projectName: string): string {
  const pkg = {
    name: projectName,
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc --noEmit && vite build",
      preview: "vite preview",
      typecheck: "tsc --noEmit",
      verify: "mozole verify",
    },
    dependencies: {
      "@radix-ui/react-dialog": "^1.1.6",
      "@radix-ui/react-slot": "^1.1.2",
      lenis: "^1.1.20",
      motion: "^12.4.7",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      wouter: "^3.5.0",
    },
    devDependencies: {
      "@biomejs/biome": "^1.9.4",
      "@tailwindcss/vite": "^4.0.9",
      "@types/node": "^22.13.0",
      "@types/react": "^19.0.10",
      "@types/react-dom": "^19.0.4",
      "@vitejs/plugin-react": "^4.3.4",
      tailwindcss: "^4.0.9",
      typescript: "^5.7.3",
      vite: "^6.2.0",
    },
  };
  return JSON.stringify(pkg, null, 2);
}

export function generateFlagshipViteConfig(): string {
  return `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
`;
}

export function generateFlagshipIndexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName} - Creative Flagship</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function generateFlagshipMain(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
`;
}

export function generateFlagshipCanvasLayer(): string {
  return `import { useEffect, useRef } from "react";

/**
 * Persistent Background Canvas Layer
 * Renders ambient graphics independently from route navigation.
 */
export function CanvasLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      // Draw static subtle ambient gradient
      ctx.fillStyle = "rgba(59, 130, 246, 0.03)";
      ctx.fillRect(0, 0, width, height);
      return () => window.removeEventListener("resize", onResize);
    }

    let t = 0;
    const render = () => {
      t += 0.01;
      ctx.clearRect(0, 0, width, height);
      
      const grad = ctx.createRadialGradient(
        width * 0.5 + Math.sin(t) * 100,
        height * 0.3 + Math.cos(t * 0.8) * 80,
        50,
        width * 0.5,
        height * 0.5,
        width * 0.8
      );
      grad.addColorStop(0, "rgba(59, 130, 246, 0.06)");
      grad.addColorStop(1, "rgba(9, 10, 15, 0)");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
`;
}

export function generateFlagshipApp(): string {
  return `import { useEffect } from "react";
import Lenis from "lenis";
import { Link, Route, Switch } from "wouter";
import { CanvasLayer } from "./components/creative/CanvasLayer";
import { Button } from "./components/ui/Button";

export default function App() {
  useEffect(() => {
    // Respect user motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] flex flex-col">
      <a
        href="#main-content"
        className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--color-primary)] focus:text-[var(--color-primary-foreground)] focus:rounded-[var(--radius-sm)]"
      >
        Skip to main content
      </a>

      {/* Persistent 60fps Canvas Layer */}
      <CanvasLayer />

      {/* Top Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[var(--spacing-container-max)] mx-auto px-[var(--spacing-container-gutter)] h-16 flex items-center justify-between">
          <Link href="/" className="text-[var(--text-lg)] font-bold tracking-tight text-[var(--color-foreground)]">
            Flagship Studio
          </Link>
          <nav aria-label="Main Navigation" className="flex items-center gap-6 text-[var(--text-sm)]">
            <Link href="/" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors">
              Home
            </Link>
            <Link href="/showcase" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors">
              Showcase
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Landmark */}
      <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={HomeView} />
          <Route path="/showcase" component={ShowcaseView} />
          <Route>
            <div className="py-20 px-[var(--spacing-container-gutter)] max-w-[var(--spacing-container-max)] mx-auto text-center">
              <h1 className="text-[var(--text-3xl)] font-bold mb-4">404 - Page Not Found</h1>
              <Link href="/">
                <Button variant="primary">Return Home</Button>
              </Link>
            </div>
          </Route>
        </Switch>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--color-border)] bg-[var(--color-surface)] py-8 mt-auto">
        <div className="max-w-[var(--spacing-container-max)] mx-auto px-[var(--spacing-container-gutter)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[var(--text-xs)] text-[var(--color-muted-foreground)]">
          <p>&copy; {new Date().getFullYear()} Flagship Studio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function HomeView() {
  return (
    <section className="py-24 px-[var(--spacing-container-gutter)] max-w-[var(--spacing-container-max)] mx-auto w-full">
      <div className="flex flex-col gap-6 max-w-2xl">
        <h1 className="text-[var(--text-5xl)] font-bold leading-tight tracking-tight">
          Creative Engineering & Visual Systems
        </h1>
        <p className="text-[var(--text-xl)] text-[var(--color-muted-foreground)] leading-relaxed">
          Interactive web experiences with headless routing, smooth scrolling, and dynamic graphics layers.
        </p>
        <div className="flex gap-4 pt-4">
          <Button variant="primary" size="lg">Explore Showcase</Button>
          <Button variant="outline" size="lg">Architecture</Button>
        </div>
      </div>
    </section>
  );
}

function ShowcaseView() {
  return (
    <section className="py-20 px-[var(--spacing-container-gutter)] max-w-[var(--spacing-container-max)] mx-auto w-full">
      <h1 className="text-[var(--text-4xl)] font-bold mb-6">Creative Showcase</h1>
      <p className="text-[var(--text-base)] text-[var(--color-muted-foreground)]">
        Interactive experiences delivered with precision performance.
      </p>
    </section>
  );
}
`;
}

export async function scaffoldFlagshipProject(
  projectRoot: string,
  projectName: string,
): Promise<void> {
  await atomicWrite(
    path.join(projectRoot, "package.json"),
    generateFlagshipPackageJson(projectName),
  );
  await atomicWrite(path.join(projectRoot, "vite.config.ts"), generateFlagshipViteConfig());
  await atomicWrite(path.join(projectRoot, "index.html"), generateFlagshipIndexHtml(projectName));

  // TsConfig & Biome
  const tsConfig = {
    compilerOptions: {
      target: "ES2022",
      lib: ["DOM", "DOM.Iterable", "ES2022"],
      module: "ESNext",
      moduleResolution: "Bundler",
      resolveJsonModule: true,
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      isolatedModules: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ["src/**/*"],
  };
  await atomicWrite(path.join(projectRoot, "tsconfig.json"), JSON.stringify(tsConfig, null, 2));

  // Biome
  const biomeConfig = {
    $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
    vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
    formatter: { enabled: true, indentStyle: "space", indentWidth: 2, lineWidth: 100 },
    linter: { enabled: true, rules: { recommended: true } },
    javascript: { formatter: { quoteStyle: "double", trailingCommas: "all" } },
  };
  await atomicWrite(path.join(projectRoot, "biome.json"), JSON.stringify(biomeConfig, null, 2));

  // Source files
  const srcDir = path.join(projectRoot, "src");
  await atomicWrite(path.join(srcDir, "main.tsx"), generateFlagshipMain());
  await atomicWrite(path.join(srcDir, "App.tsx"), generateFlagshipApp());
  await atomicWrite(
    path.join(srcDir, "components", "creative", "CanvasLayer.tsx"),
    generateFlagshipCanvasLayer(),
  );
  await atomicWrite(path.join(srcDir, "components", "ui", "Button.tsx"), generateBespokeButton());
  await atomicWrite(path.join(srcDir, "components", "ui", "Input.tsx"), generateBespokeInput());
}
