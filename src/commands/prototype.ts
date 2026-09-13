import { readFile } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import {
  generateAgentsPolicy,
  generateClaudeBridge,
  generateCursorRuleBridge,
} from "../scaffold/agents.js";
import { generateFlagshipPackageJson } from "../scaffold/flagship.js";
import { generateStandardPackageJson } from "../scaffold/standard.js";
import { linkWorkflowPolicies, scaffoldWorkflow } from "../scaffold/workflow.js";
import { atomicWrite, exists, writeFiles } from "../utils/fs.js";

export interface PrototypeInitOptions {
  cwd?: string;
  name?: string;
}

export async function prototypeInit(options: PrototypeInitOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const name = options.name ?? path.basename(cwd);
  const configPath = path.join(cwd, "mozole.config.json");
  const config = (await exists(configPath)) ? JSON.parse(await readFile(configPath, "utf8")) : {};
  if (config.projectsDir && config.projectsDir !== "projects") {
    throw new Error(
      "Prototype projectsDir must be 'projects'. Move or configure existing projects before initializing.",
    );
  }
  const manifestPath = path.join(cwd, "package.json");
  const pkg = (await exists(manifestPath))
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : { name, version: "0.0.0", type: "module" };
  const standard = JSON.parse(generateStandardPackageJson("standard"));
  const flagship = JSON.parse(generateFlagshipPackageJson("flagship"));
  for (const section of ["dependencies", "devDependencies"] as const) {
    const required = { ...standard[section], ...flagship[section] };
    for (const [dependency, version] of Object.entries(required)) {
      const existing = pkg.dependencies?.[dependency] ?? pkg.devDependencies?.[dependency];
      if (existing && existing !== version) {
        throw new Error(
          `Shared dependency conflict: ${dependency} (${existing} vs ${version}). Align versions before initializing.`,
        );
      }
    }
    pkg[section] = { ...required, ...pkg[section] };
  }
  const workspaces = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : (pkg.workspaces?.packages ?? []);
  if (
    !Array.isArray(workspaces) ||
    workspaces.some((value: unknown) => typeof value !== "string")
  ) {
    throw new Error("Invalid package.json workspaces.");
  }
  pkg.private = true;
  pkg.mozolePrototype = true;
  pkg.workspaces = [...new Set([...workspaces, "projects/*"])];
  pkg.scripts = { "build:all": "npm run build --workspaces --if-present", ...pkg.scripts };
  await atomicWrite(manifestPath, JSON.stringify(pkg, null, 2));
  await atomicWrite(
    configPath,
    JSON.stringify(
      { ...config, version: "2.0.0", name, projectsDir: "projects", defaultBackend: "none" },
      null,
      2,
    ),
  );
  await writeFiles(cwd, {
    "projects/.gitkeep": "",
    "shared/.gitkeep": "",
    "AGENTS.md": generateAgentsPolicy(name),
    "CLAUDE.md": generateClaudeBridge(),
    ".cursor/rules/mozole.mdc": generateCursorRuleBridge(),
    "PROTOTYPE.md":
      "# Prototype workspace\n\nRun npm install once here. Create projects with mozole new <name>. Run npm run dev --workspace projects/<name>. After adding projects, run npm install here to register workspace links. Dependencies resolve from this root; all UI, layout, motion, behavior and tokens remain inside each project. Do not create a shared component library. Each project retains its package.json so it can also be installed independently after copying it outside the workspace. npm may nest incompatible third-party versions; keep workspace dependency versions aligned.\n",
  });
  await scaffoldWorkflow(cwd);
  await linkWorkflowPolicies(cwd);
  const ignorePath = path.join(cwd, ".gitignore");
  const ignore = (await exists(ignorePath)) ? await readFile(ignorePath, "utf8") : "";
  const additions = [
    "node_modules/",
    "release/",
    "release.zip",
    "releases/",
    "dist/",
    "build/",
    ".react-router/",
    ".env",
    ".env.*",
    "!.env.example",
  ].filter((line) => !ignore.split(/\r?\n/).includes(line));
  if (additions.length) await atomicWrite(ignorePath, `${ignore}\n${additions.join("\n")}\n`);
  console.log(pc.green(`✓ Initialized shared-dependency prototype workspace in ${cwd}`));
  console.log("  Run npm install at the workspace root, then mozole new <client-name>.");
}
