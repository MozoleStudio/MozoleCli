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
    proxy: { "/api": "http://127.0.0.1:3001" },
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
    </StrictMode>,
  );
}
`;
}

export function generateFlagshipCanvasLayer(): string {
  return `import { useEffect, useRef } from "react";

export function CanvasLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let time = 0;
    const tokens = getComputedStyle(document.documentElement);
    const startColor = tokens.getPropertyValue("--color-canvas-start").trim();
    const endColor = tokens.getPropertyValue("--color-canvas-end").trim();

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(
        width * (0.5 + Math.sin(time) * 0.08),
        height * (0.3 + Math.cos(time * 0.8) * 0.08),
        width * 0.04,
        width * 0.5,
        height * 0.5,
        width * 0.8,
      );
      gradient.addColorStop(0, startColor);
      gradient.addColorStop(1, endColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    };
    const render = () => {
      time += 0.01;
      draw();
      frameId = requestAnimationFrame(render);
    };
    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    };
    const onPreferenceChange = () => {
      cancelAnimationFrame(frameId);
      if (preference.matches) draw();
      else frameId = requestAnimationFrame(render);
    };
    onResize();
    onPreferenceChange();
    window.addEventListener("resize", onResize);
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      window.removeEventListener("resize", onResize);
      preference.removeEventListener("change", onPreferenceChange);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={-1}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
`;
}

export function generateFlagshipApp(): string {
  return `import { Link, Route, Switch } from "wouter";
import { useSmoothScroll } from "./behaviors";
import { CanvasLayer } from "./components/creative/CanvasLayer";
import { Footer, Header } from "./components/layout";
import { Button } from "./components/ui";
import HomeView from "./routes/home";
import ShowcaseView from "./routes/showcase";

export default function App() {
  useSmoothScroll();

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
      <Header />

      {/* Main Content Landmark */}
      <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={HomeView} />
          <Route path="/showcase" component={ShowcaseView} />
          <Route>
            <div className="py-20 px-[var(--spacing-container-gutter)] max-w-[var(--spacing-container-max)] mx-auto text-center">
              <h1 className="text-[var(--text-3xl)] font-bold mb-4">404 - Page Not Found</h1>
              <Button asChild variant="primary">
                <Link href="/">Return Home</Link>
              </Button>
            </div>
          </Route>
        </Switch>
      </main>

      {/* Footer */}
      <Footer />
    </div>
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

  await atomicWrite(
    path.join(projectRoot, "src/behaviors/useSmoothScroll.ts"),
    generateSmoothScroll(),
  );
  await atomicWrite(
    path.join(projectRoot, "src/behaviors/index.ts"),
    'export { useSmoothScroll } from "./useSmoothScroll";\n',
  );
  await atomicWrite(
    path.join(projectRoot, "src/components/motion/Reveal.tsx"),
    `import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react";

export function Reveal({ children, ...props }: HTMLMotionProps<"div">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
`,
  );
  await atomicWrite(
    path.join(projectRoot, "src/components/motion/index.ts"),
    'export { Reveal } from "./Reveal";\n',
  );
  await atomicWrite(
    path.join(projectRoot, "src/library/index.ts"),
    'export * from "../components/ui";\nexport * from "../components/layout";\nexport * from "../components/features";\nexport * from "../components/sections";\nexport * from "../components/motion";\nexport * from "../behaviors";\n',
  );

  // Source files
  const srcDir = path.join(projectRoot, "src");
  await atomicWrite(path.join(srcDir, "main.tsx"), generateFlagshipMain());
  await atomicWrite(path.join(srcDir, "App.tsx"), generateFlagshipApp());
  await atomicWrite(path.join(srcDir, "components/layout/Header.tsx"), generateFlagshipHeader());
  await atomicWrite(path.join(srcDir, "components/layout/Footer.tsx"), generateFlagshipFooter());
  await atomicWrite(path.join(srcDir, "routes/home.tsx"), generateFlagshipHome());
  await atomicWrite(path.join(srcDir, "routes/showcase.tsx"), generateFlagshipShowcase());
  await atomicWrite(
    path.join(srcDir, "components", "creative", "CanvasLayer.tsx"),
    generateFlagshipCanvasLayer(),
  );
  await atomicWrite(path.join(srcDir, "components", "ui", "Button.tsx"), generateBespokeButton());
  await atomicWrite(path.join(srcDir, "components", "ui", "Input.tsx"), generateBespokeInput());
}

export function generateSmoothScroll(): string {
  return `import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

export function useSmoothScroll() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | undefined;
    let frameId = 0;
    const stop = () => {
      cancelAnimationFrame(frameId);
      lenis?.destroy();
      lenis = undefined;
    };
    const update = () => {
      stop();
      if (preference.matches) return;
      const instance = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
        smoothWheel: true,
      });
      lenis = instance;
      const raf = (time: number) => {
        instance.raf(time);
        frameId = requestAnimationFrame(raf);
      };
      frameId = requestAnimationFrame(raf);
    };
    update();
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      stop();
    };
  }, []);
}
`;
}

export function generateFlagshipHeader(): string {
  return `import { Link } from "wouter";

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[var(--spacing-container-max)] mx-auto px-[var(--spacing-container-gutter)] h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-[var(--text-lg)] font-bold tracking-tight text-[var(--color-foreground)]"
        >
          Flagship Studio
        </Link>
        <nav aria-label="Main Navigation" className="flex items-center gap-6 text-[var(--text-sm)]">
          <Link
            href="/"
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Home
          </Link>
          <Link
            href="/showcase"
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Showcase
          </Link>
        </nav>
      </div>
    </header>
  );
}
`;
}

export function generateFlagshipFooter(): string {
  return `export function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--color-border)] bg-[var(--color-surface)] py-8 mt-auto">
      <div className="max-w-[var(--spacing-container-max)] mx-auto px-[var(--spacing-container-gutter)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[var(--text-xs)] text-[var(--color-muted-foreground)]">
        <p>&copy; {new Date().getFullYear()} Flagship Studio. All rights reserved.</p>
      </div>
    </footer>
  );
}
`;
}

export function generateFlagshipHome(): string {
  return `import { Reveal } from "../components/motion";
import { Button } from "../components/ui";

export default function HomeView() {
  return (
    <section className="py-24 px-[var(--spacing-container-gutter)] max-w-[var(--spacing-container-max)] mx-auto w-full">
      <Reveal className="flex flex-col gap-6 max-w-2xl">
        <h1 className="text-[var(--text-5xl)] font-bold leading-tight tracking-tight">
          Creative Engineering & Visual Systems
        </h1>
        <p className="text-[var(--text-xl)] text-[var(--color-muted-foreground)] leading-relaxed">
          Interactive web experiences with headless routing, smooth scrolling, and dynamic graphics
          layers.
        </p>
        <div className="flex gap-4 pt-4">
          <Button variant="primary" size="lg">
            Explore Showcase
          </Button>
          <Button variant="outline" size="lg">
            Architecture
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
`;
}

export function generateFlagshipShowcase(): string {
  return `export default function ShowcaseView() {
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
