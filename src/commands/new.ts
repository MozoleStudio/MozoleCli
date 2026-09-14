import path from "node:path";
import pc from "picocolors";
import { scaffoldNewProject } from "../scaffold/index.js";
import { exists, findPrototypeRoot } from "../utils/fs.js";

export interface NewProjectOptions {
  name: string;
  flagship?: boolean;
  backend?: "php" | "node" | "none";
  targetDir?: string;
  cwd?: string;
  initGit?: boolean;
}

export async function createNewProject(options: NewProjectOptions): Promise<string> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const name = options.name.trim();

  let targetDir = options.targetDir ? path.resolve(cwd, options.targetDir) : undefined;
  const protoRoot = await findPrototypeRoot(targetDir ? path.dirname(targetDir) : cwd);
  if (!targetDir) {
    if (protoRoot) {
      targetDir = path.join(protoRoot, "projects", name);
    } else {
      targetDir = path.join(cwd, name);
    }
  }

  if (await exists(targetDir)) {
    throw new Error(`Target directory already exists: ${targetDir}`);
  }

  const backend = options.backend ?? "none";
  const backendLabel =
    backend === "none"
      ? pc.green("none (Pure Frontend / Zero-Backend)")
      : backend === "php"
        ? pc.yellow("php (Pure PHP 8.1+ Zero-Dependency)")
        : pc.yellow("node (Native HTTP Node.js API)");

  console.log(pc.cyan(`\n⚡ Scaffolding Mozole project: ${pc.bold(name)}`));
  console.log(
    `  Profile: ${options.flagship ? pc.magenta("Flagship Creative (Wouter + Lenis + Canvas)") : pc.blue("Standard Production (React Router 7 + SSG)")}`,
  );
  console.log(`  Backend: ${backendLabel}`);
  console.log(`  Destination: ${targetDir}\n`);

  await scaffoldNewProject({
    targetDir,
    name,
    flagship: options.flagship,
    backend,
    initGit: options.initGit ?? !protoRoot,
  });

  console.log(pc.green(`✓ Project successfully generated at ${targetDir}`));
  console.log("\nNext steps:");
  console.log(`  1. ${pc.cyan(`cd ${path.relative(cwd, targetDir) || "."}`)}`);
  console.log(`  2. ${pc.cyan(protoRoot ? `npm install --prefix "${protoRoot}"` : "npm install")}`);
  console.log(`  3. ${pc.cyan("mozole verify")}`);
  console.log(`  4. ${pc.cyan("npm run dev")}\n`);
  if (backend !== "none")
    console.log(`  Backend: run ${pc.cyan("npm run dev:backend")} in a second terminal.\n`);

  return targetDir;
}
