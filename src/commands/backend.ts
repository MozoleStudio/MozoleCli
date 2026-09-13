import { readFile } from "node:fs/promises";
import path from "node:path";
import { scaffoldBackend } from "../scaffold/backend.js";
import { atomicWrite, exists, findProjectRoot, writeFiles } from "../utils/fs.js";

export async function enableBackend(options: {
  targetDir?: string;
  runtime: string;
}): Promise<void> {
  const { runtime } = options;
  if (runtime !== "php" && runtime !== "node")
    throw new Error("Choose backend runtime: php or node.");
  const root = path.resolve(options.targetDir ?? (await findProjectRoot()) ?? process.cwd());
  const manifestPath = path.join(root, ".mozole/project.json");
  const project = (await exists(manifestPath))
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : {};
  if (project.backend && project.backend !== "none") {
    if (project.backend !== runtime)
      throw new Error(
        `Project already uses ${project.backend}. Migrate its data and API explicitly before switching.`,
      );
    console.log(`Backend ${runtime} already enabled. Run npm run dev:backend.`);
    return;
  }
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const dev = pkg.scripts?.dev;
  if (typeof dev !== "string" || !/^(vite|react-router dev)(\s|$)/.test(dev)) {
    throw new Error(
      "Backend activation requires a Vite or React Router dev script. Adopt or configure the project first.",
    );
  }
  const selected = dev.match(/(?:--config(?:=|\s+)|-c\s+)([a-zA-Z0-9_./-]+)/);
  if ((dev.includes("--config") || /(?:^|\s)-c(?:\s|$)/.test(dev)) && !selected) {
    throw new Error("Use an unquoted project-relative Vite config path before enabling backend.");
  }
  if (selected && (path.isAbsolute(selected[1]) || selected[1].split("/").includes(".."))) {
    throw new Error("Vite config must be inside the project.");
  }
  const configs = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];
  let config: string | undefined;
  for (const candidate of configs)
    if (await exists(path.join(root, candidate))) {
      config = candidate;
      break;
    }
  config = selected?.[1] ?? config;
  if (config && !(await exists(path.join(root, config))))
    throw new Error(`Vite config not found: ${config}`);
  const wrapper = "mozole.backend.vite.config.mjs";
  if (await exists(path.join(root, wrapper)))
    throw new Error(`Preserving existing ${wrapper}; integrate the API proxy manually.`);
  await scaffoldBackend(root, runtime);
  await writeFiles(root, {
    [wrapper]: `${config ? `import base from "./${config}";` : "const base = {};"}
import { defineConfig, mergeConfig } from "vite";

export default defineConfig(async (env) => mergeConfig(
  await (typeof base === "function" ? base(env) : base),
  { server: { proxy: { "/api": "http://127.0.0.1:3001" } } },
));
`,
  });
  const updatedPkg = JSON.parse(await readFile(pkgPath, "utf8"));
  updatedPkg.scripts.dev = `${selected ? dev.replace(selected[0], "").trim() : dev} --config ${wrapper}`;
  await atomicWrite(pkgPath, JSON.stringify(updatedPkg, null, 2));
  await atomicWrite(manifestPath, JSON.stringify({ ...project, backend: runtime }, null, 2));
  const architecturePath = path.join(root, "docs/repomap/architecture.md");
  if (await exists(architecturePath)) {
    const architecture = await readFile(architecturePath, "utf8");
    await atomicWrite(
      architecturePath,
      architecture.replace(
        /^- \*\*Backend Architecture:\*\*.*$/m,
        `- **Backend Architecture:** ${runtime === "php" ? "PHP 8.1+ API in api/" : "Node.js HTTP API in server/"}`,
      ),
    );
  }
  console.log(
    `Backend ${runtime} enabled. Run npm run dev:backend and npm run dev in separate terminals.`,
  );
}
