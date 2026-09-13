import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { generateFlagshipPackageJson } from "../scaffold/flagship.js";
import { scaffoldNewProject } from "../scaffold/index.js";
import { generateStandardPackageJson } from "../scaffold/standard.js";
import { linkWorkflowPolicies } from "../scaffold/workflow.js";
import { atomicWrite, exists, isDirectory, writeFiles } from "../utils/fs.js";
import { enableBackend } from "./backend.js";

export interface AdoptOptions {
  targetDir?: string;
  projectName?: string;
  flagship?: boolean;
  backend?: "none" | "php" | "node";
}

export async function adoptProject(options: AdoptOptions = {}): Promise<void> {
  const targetDir = path.resolve(options.targetDir ?? process.cwd());
  if (!(await isDirectory(targetDir))) throw new Error(`Directory not found: ${targetDir}`);
  const pkgPath = path.join(targetDir, "package.json");
  const hasPackage = await exists(pkgPath);
  const pkg = hasPackage ? JSON.parse(await readFile(pkgPath, "utf8")) : {};
  const dependencies = { ...pkg.devDependencies, ...pkg.dependencies };
  const foreignFramework =
    dependencies.vue ||
    dependencies.svelte ||
    dependencies["@angular/core"] ||
    dependencies.angular ||
    dependencies.next ||
    dependencies.nuxt;

  if (hasPackage && foreignFramework) {
    throw new Error(
      "Adopt supports Vite + React projects. Migrate this project's framework to Vite + React before adopting; no files were changed.",
    );
  }
  if (!hasPackage) {
    const contents = await readdir(targetDir);
    if (
      contents.some(
        (file) => !file.startsWith(".") && !/^(README|LICENSE|AGENTS|CLAUDE)(\.|$)/i.test(file),
      )
    ) {
      throw new Error("A nonempty project needs a Vite + React package.json before adoption.");
    }
  }
  if (options.backend && !["none", "php", "node"].includes(options.backend))
    throw new Error("Invalid backend runtime.");
  const flagship = options.flagship ?? Boolean(dependencies.wouter);
  if (
    flagship &&
    (dependencies["@react-router/dev"] ||
      dependencies["react-router"] ||
      dependencies["react-router-dom"])
  ) {
    throw new Error("Convert React Router framework routes to Wouter before adopting as Flagship.");
  }
  const name = options.projectName ?? pkg.name ?? path.basename(targetDir);
  const metadataPath = path.join(targetDir, ".mozole/project.json");
  const metadata = (await exists(metadataPath))
    ? JSON.parse(await readFile(metadataPath, "utf8"))
    : {};
  const backend =
    metadata.backend ??
    ((await exists(path.join(targetDir, "server/index.mjs")))
      ? "node"
      : (await exists(path.join(targetDir, "api/index.php")))
        ? "php"
        : "none");
  if (
    options.backend &&
    options.backend !== "none" &&
    backend !== "none" &&
    options.backend !== backend
  ) {
    throw new Error(
      `Existing ${backend} backend must be migrated explicitly before switching runtime.`,
    );
  }
  const framework = Boolean(dependencies["@react-router/dev"]);
  if (
    hasPackage &&
    dependencies.tailwindcss &&
    !/^(?:\^|~)?4(?:\.|$)/.test(dependencies.tailwindcss)
  ) {
    throw new Error(
      "Adopt requires Tailwind v4. Migrate the existing Tailwind configuration first; no files were changed.",
    );
  }
  const expected = JSON.parse(
    flagship
      ? generateFlagshipPackageJson("adopted-project")
      : generateStandardPackageJson("adopted-project"),
  );
  // Existing Vite SPAs retain their entry and routing composition.
  if (hasPackage && !flagship && !framework) {
    const {
      "@react-router/node": _node,
      "@react-router/serve": _serve,
      isbot: _bot,
      ...filteredDeps
    } = expected.dependencies;
    expected.dependencies = filteredDeps;

    const { "@react-router/dev": _dev, ...filteredDevDeps } = expected.devDependencies;
    expected.devDependencies = filteredDevDeps;
    expected.devDependencies["@vitejs/plugin-react"] = "^4.3.4";
    expected.scripts = {
      dev: "vite",
      build: "tsc --noEmit && vite build",
      preview: "vite preview",
      typecheck: "tsc --noEmit",
      verify: "mozole verify",
    };
  }
  const report: string[] = [];
  if (
    hasPackage &&
    !flagship &&
    !framework &&
    !dependencies["react-router"] &&
    !dependencies["react-router-dom"]
  ) {
    report.push(
      "React Router was added. Mount a BrowserRouter or RouterProvider when composing route-aware layouts into existing pages.",
    );
  }
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [dependency, version] of Object.entries(expected[section]) as [string, string][]) {
      if (dependencies[dependency]) {
        if (dependencies[dependency] !== version)
          report.push(
            `Review dependency ${dependency}: preserved ${dependencies[dependency]}, scaffold baseline ${version}.`,
          );
      } else {
        pkg[section] = { ...pkg[section], [dependency]: version };
      }
    }
  }
  pkg.name ??= name;
  pkg.type ??= "module";
  pkg.private ??= true;
  pkg.scripts = { ...expected.scripts, ...pkg.scripts };
  const temp = await mkdtemp(path.join(os.tmpdir(), "mozole-adopt-"));
  const written: string[] = [];
  try {
    await scaffoldNewProject({
      targetDir: temp,
      name: "adopted-project",
      flagship,
      initGit: false,
    });
    async function collect(dir: string, prefix = ""): Promise<Record<string, string>> {
      const files: Record<string, string> = {};
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.isDirectory())
          Object.assign(files, await collect(path.join(dir, item.name), relative));
        else files[relative] = await readFile(path.join(dir, item.name), "utf8");
      }
      return files;
    }
    const files = await collect(temp);
    if (hasPackage) {
      files["docs/repomap/routes.md"] =
        "# Existing routes\n\nApplication routes are preserved. Index the existing route components here during adoption review.\n";
      files["docs/repomap/architecture.md"] = files["docs/repomap/architecture.md"].replace(
        "None (static frontend)",
        backend === "none" ? "None (static frontend)" : `${backend} (existing project backend)`,
      );
      if (!flagship && !framework)
        files["docs/repomap/architecture.md"] = files["docs/repomap/architecture.md"].replace(
          "React Router 7 (Framework Mode with Static Pre-rendering / SSG)",
          "Existing Vite React SPA; React Router library available for composition",
        );
    }
    const {
      "package.json": _packageJson,
      ".mozole/project.json": _projectJson,
      ...filteredFiles
    } = files;
    for (const [file, content] of Object.entries(filteredFiles)) {
      if (file === "docs/design/design.md" && (await exists(path.join(targetDir, "design.md"))))
        continue;
      if (
        hasPackage &&
        (file === "index.html" ||
          file === "react-router.config.ts" ||
          file === "src/main.tsx" ||
          file === "src/App.tsx" ||
          file === "src/root.tsx" ||
          file === "src/routes.ts" ||
          file.startsWith("src/routes/"))
      )
        continue;
      if (hasPackage && file === "vite.config.ts") continue;
      if (await exists(path.join(targetDir, file))) {
        if (
          file.startsWith("src/components/") ||
          file.startsWith("src/behaviors/") ||
          file === "src/library/index.ts"
        ) {
          await writeFiles(targetDir, { [`.mozole/adoption-proposals/${file}`]: content });
        }
        if (
          file.endsWith("index.ts") ||
          file === "tsconfig.json" ||
          file === "src/styles/tokens.css"
        )
          report.push(
            `Preserved ${file}; review the project library exports and token/tooling integration.`,
          );
        continue;
      }
      const value =
        file.endsWith(".md") || file.endsWith(".mdc")
          ? content.replaceAll("adopted-project", name)
          : content;
      written.push(...(await writeFiles(targetDir, { [file]: value })));
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  await linkWorkflowPolicies(targetDir);
  if (hasPackage) {
    let entry: string | undefined;
    for (const candidate of framework
      ? ["src/root.tsx"]
      : ["src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx"]) {
      if (await exists(path.join(targetDir, candidate))) {
        entry = candidate;
        break;
      }
    }
    if (entry) {
      const file = path.join(targetDir, entry);
      const content = await readFile(file, "utf8");
      if (!content.includes("./styles/tokens.css"))
        await atomicWrite(file, `import "./styles/tokens.css";\n${content}`);
    } else report.push("Import src/styles/tokens.css from your custom application entry.");
    let config: string | undefined;
    for (const candidate of [
      "vite.config.ts",
      "vite.config.mts",
      "vite.config.js",
      "vite.config.mjs",
    ]) {
      if (await exists(path.join(targetDir, candidate))) {
        config = candidate;
        break;
      }
    }
    const configText = config ? await readFile(path.join(targetDir, config), "utf8") : "";
    if (!configText.includes("@tailwindcss/vite")) {
      const wrapper = "mozole.adopt.vite.config.mjs";
      if (!(await exists(path.join(targetDir, wrapper)))) {
        await writeFiles(targetDir, {
          [wrapper]: `${config ? `import base from "./${config}";` : framework ? 'import { reactRouter } from "@react-router/dev/vite";\nconst base = { plugins: [reactRouter()] };' : 'import react from "@vitejs/plugin-react";\nconst base = { plugins: [react()] };'}
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, mergeConfig } from "vite";

export default defineConfig(async (env) => mergeConfig(
  await (typeof base === "function" ? base(env) : base),
  { plugins: [tailwindcss()], server: { proxy: { "/api": "http://127.0.0.1:3001" } } },
));
`,
        });
      }
      for (const script of ["dev", "build", "preview"]) {
        if (
          typeof pkg.scripts[script] === "string" &&
          !pkg.scripts[script].includes("--config") &&
          !/(?:^|\s)-c(?:\s|$)/.test(pkg.scripts[script]) &&
          /\b(vite|react-router)\b/.test(pkg.scripts[script])
        ) {
          pkg.scripts[script] += ` --config ${wrapper}`;
        } else report.push(`Review ${script} script: retained its existing config selection.`);
      }
    }
    report.push(
      "Existing pages and routing were preserved. Compose the local UI/layout modules into those pages; remove legacy duplicate styles after reviewing their appearance.",
    );
    if (flagship)
      report.push(
        "Mount useSmoothScroll and Reveal where desired; generated behavior and motion remain opt-in in existing pages.",
      );
  }
  await atomicWrite(pkgPath, JSON.stringify(pkg, null, 2));
  await atomicWrite(
    metadataPath,
    JSON.stringify(
      {
        ...metadata,
        version: 1,
        name,
        profile: flagship ? "flagship" : "standard",
        backend,
        library: "src/library/index.ts",
        adoption: report.length ? "review-required" : "complete",
      },
      null,
      2,
    ),
  );
  if (options.backend && options.backend !== "none" && backend === "none") {
    await enableBackend({ targetDir, runtime: options.backend });
  }
  await atomicWrite(
    path.join(targetDir, ".mozole/adoption-report.md"),
    `# Adoption report\n\nAdded ${written.length} files. Existing application files were preserved.\n\n${report.length ? report.map((item) => `- ${item}`).join("\n") : "No manual integration items detected."}\n\nInstall dependencies at the prototype root (if applicable), otherwise here. Run mozole verify after completing the review.\n`,
  );
  console.log(pc.green(`✓ Adopted ${name}; added ${written.length} files.`));
  console.log(
    `Review ${path.join(targetDir, ".mozole/adoption-report.md")} before claiming full conformance.`,
  );
}
