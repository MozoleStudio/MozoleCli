import path from "node:path";
import pc from "picocolors";
import { scaffoldAgentPolicies } from "../scaffold/agents.js";
import { atomicWrite, exists } from "../utils/fs.js";
import { initGit } from "../utils/git.js";

export interface PrototypeInitOptions {
  cwd?: string;
  name?: string;
}

export async function prototypeInit(options: PrototypeInitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? path.basename(cwd);

  const configPath = path.join(cwd, "mozole.config.json");
  if (await exists(configPath)) {
    console.log(pc.yellow(`Mozole prototype repository already initialized at ${cwd}`));
    return;
  }

  const config = {
    version: "2.0.0",
    name,
    projectsDir: "projects",
    defaultBackend: "php",
  };

  await atomicWrite(configPath, JSON.stringify(config, null, 2));
  await atomicWrite(path.join(cwd, "projects", ".gitkeep"), "");
  await atomicWrite(path.join(cwd, "shared", ".gitkeep"), "");

  await scaffoldAgentPolicies(cwd, name);
  await initGit(cwd, "feat: initialize mozole prototype ecosystem");

  console.log(pc.green(`✓ Initialized Mozole Prototype workspace in ${cwd}`));
  console.log(`  Run ${pc.cyan("mozole new <client-name>")} to generate a new project.`);
}
