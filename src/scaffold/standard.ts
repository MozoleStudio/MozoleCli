import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export function generateStandardPackageJson(projectName: string): string {
  const pkg = {
    name: projectName,
    private: true,
    type: "module",
    scripts: {
      dev: "react-router dev",
      build: "react-router build",
      start: "react-router-serve ./build/server/index.js",
      typecheck: "tsc --noEmit",
      verify: "mozole verify",
    },
    dependencies: {
      "@radix-ui/react-dialog": "^1.1.6",
      "@radix-ui/react-slot": "^1.1.2",
      "@react-router/node": "^7.2.0",
      "@react-router/serve": "^7.2.0",
      isbot: "^5.1.23",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "react-router": "^7.2.0",
    },
    devDependencies: {
      "@biomejs/biome": "^1.9.4",
      "@react-router/dev": "^7.2.0",
      "@tailwindcss/vite": "^4.0.9",
      "@types/node": "^22.13.0",
      "@types/react": "^19.0.10",
      "@types/react-dom": "^19.0.4",
      tailwindcss: "^4.0.9",
      typescript: "^5.7.3",
      vite: "^6.2.0",
    },
  };
  return JSON.stringify(pkg, null, 2);
}

export function generateStandardViteConfig(): string {
  return `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: {
    port: 5173,
  },
});
`;
}

export function generateStandardRouterConfig(): string {
  return `import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  async prerender() {
    return ["/", "/about", "/contact"];
  },
} satisfies Config;
`;
}

export function generateStandardTsConfig(): string {
  return JSON.stringify(
    {
      include: ["src/**/*", ".react-router/types/**/*"],
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
        rootDirs: [".", "./.react-router/types"],
      },
    },
    null,
    2,
  );
}

export function generateStandardBiomeJson(): string {
  return JSON.stringify(
    {
      $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
      vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
      formatter: { enabled: true, indentStyle: "space", indentWidth: 2, lineWidth: 100 },
      linter: {
        enabled: true,
        rules: {
          recommended: true,
          style: { noNonNullAssertion: "warn" },
          a11y: { recommended: true },
        },
      },
      javascript: { formatter: { quoteStyle: "double", trailingCommas: "all" } },
    },
    null,
    2,
  );
}

export function generateStandardRoot(): string {
  return `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./styles/tokens.css";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a href="#main-content" className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--color-primary)] focus:text-[var(--color-primary-foreground)] focus:rounded-[var(--radius-sm)]">
          Skip to main content
        </a>
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col">
          {children}
        </main>
        <Footer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`;
}

export function generateStandardRoutesHome(): string {
  return `import type { Route } from "./+types/home";
import { Button } from "../components/ui/Button";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Mozole Studio - Digital Engineering" },
    { name: "description", content: "Web applications and design systems engineered with React Router and Tailwind CSS." },
  ];
}

export default function Home() {
  return (
    <section className="py-20 px-[var(--spacing-container-gutter)] max-w-[var(--spacing-container-max)] mx-auto w-full">
      <div className="flex flex-col gap-6 max-w-2xl">
        <h1 className="text-[var(--text-4xl)] font-bold text-[var(--color-foreground)] leading-tight">
          Digital Engineering & Design Systems
        </h1>
        <p className="text-[var(--text-lg)] text-[var(--color-muted-foreground)] leading-relaxed">
          Production web applications built with bespoke UI primitives, strict design tokens, and static pre-rendering.
        </p>
        <div className="flex gap-4 pt-4">
          <Button variant="primary">Explore Projects</Button>
          <Button variant="outline">Learn More</Button>
        </div>
      </div>
    </section>
  );
}
`;
}

export function generateStandardHeader(): string {
  return `import { NavLink } from "react-router";

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[var(--spacing-container-max)] mx-auto px-[var(--spacing-container-gutter)] h-16 flex items-center justify-between">
        <NavLink to="/" className="text-[var(--text-lg)] font-bold tracking-tight text-[var(--color-foreground)]">
          Mozole Studio
        </NavLink>
        <nav aria-label="Main Navigation" className="flex items-center gap-6 text-[var(--text-sm)]">
          <NavLink to="/" className={({ isActive }) => isActive ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"}>
            Home
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => isActive ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"}>
            About
          </NavLink>
          <NavLink to="/contact" className={({ isActive }) => isActive ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"}>
            Contact
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
`;
}

export function generateStandardFooter(): string {
  return `export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-8 mt-auto">
      <div className="max-w-[var(--spacing-container-max)] mx-auto px-[var(--spacing-container-gutter)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[var(--text-xs)] text-[var(--color-muted-foreground)]">
        <p>&copy; {new Date().getFullYear()} Mozole Studio. All rights reserved.</p>
      </div>
    </footer>
  );
}
`;
}

export function generateBespokeButton(): string {
  return `import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", type = "button", children, ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-medium transition-[background-color,border-color,color] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-[var(--radius-sm)]";
    
    const variants = {
      primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-accent)]",
      outline: "border border-[var(--color-border)] bg-transparent text-[var(--color-foreground)] hover:border-[var(--color-primary)]",
      ghost: "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-surface-elevated)]",
    };

    const sizes = {
      sm: "h-8 px-3 text-[var(--text-xs)] min-h-[32px] min-w-[32px]",
      md: "h-10 px-4 text-[var(--text-sm)] min-h-[40px] min-w-[40px]",
      lg: "h-12 px-6 text-[var(--text-base)] min-h-[48px] min-w-[48px]",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={\`\${base} \${variants[variant]} \${sizes[size]} \${className}\`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
`;
}

export function generateBespokeInput(): string {
  return `import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, id, type = "text", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <input
          ref={ref}
          id={id}
          type={type}
          aria-invalid={Boolean(error)}
          aria-describedby={error && id ? \`\${id}-error\` : undefined}
          style={{ fontSize: "16px" }} // Floor of 16px strictly enforced to prevent iOS Safari auto-zoom
          className={\`w-full h-10 px-3 bg-[var(--color-surface)] border \${
            error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
          } rounded-[var(--radius-sm)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] transition-[border-color] \${className}\`}
          {...props}
        />
        {error && id && (
          <span id={\`\${id}-error\`} className="text-[var(--text-xs)] text-[var(--color-danger)]">
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
`;
}

export async function scaffoldStandardProject(
  projectRoot: string,
  projectName: string,
): Promise<void> {
  await atomicWrite(
    path.join(projectRoot, "package.json"),
    generateStandardPackageJson(projectName),
  );
  await atomicWrite(path.join(projectRoot, "vite.config.ts"), generateStandardViteConfig());
  await atomicWrite(
    path.join(projectRoot, "react-router.config.ts"),
    generateStandardRouterConfig(),
  );
  await atomicWrite(path.join(projectRoot, "tsconfig.json"), generateStandardTsConfig());
  await atomicWrite(path.join(projectRoot, "biome.json"), generateStandardBiomeJson());

  // Source files
  const srcDir = path.join(projectRoot, "src");
  await atomicWrite(path.join(srcDir, "root.tsx"), generateStandardRoot());
  await atomicWrite(path.join(srcDir, "routes", "home.tsx"), generateStandardRoutesHome());

  // Components
  await atomicWrite(
    path.join(srcDir, "components", "layout", "Header.tsx"),
    generateStandardHeader(),
  );
  await atomicWrite(
    path.join(srcDir, "components", "layout", "Footer.tsx"),
    generateStandardFooter(),
  );
  await atomicWrite(path.join(srcDir, "components", "ui", "Button.tsx"), generateBespokeButton());
  await atomicWrite(path.join(srcDir, "components", "ui", "Input.tsx"), generateBespokeInput());
}
