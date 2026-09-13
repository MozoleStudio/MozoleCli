import path from "node:path";
import pc from "picocolors";
import { scaffoldAgentPolicies } from "../scaffold/agents.js";
import { scaffoldDesign } from "../scaffold/design.js";
import { scaffoldPhases } from "../scaffold/phases.js";
import { scaffoldRepomap } from "../scaffold/repomap.js";
import { scaffoldTokens } from "../scaffold/tokens.js";
import { exists } from "../utils/fs.js";

export interface AdoptOptions {
  targetDir?: string;
  projectName?: string;
}

export async function adoptProject(options: AdoptOptions = {}): Promise<void> {
  const targetDir = options.targetDir ? path.resolve(options.targetDir) : process.cwd();
  const projectName = options.projectName ?? path.basename(targetDir);

  if (!(await exists(targetDir))) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  console.log(
    pc.cyan(
      `\n📦 Adopting existing project into Mozole Studio governance: ${pc.bold(projectName)}`,
    ),
  );
  console.log(`  Target: ${targetDir}\n`);

  // 1. Authoritative Policies
  const agentsPath = path.join(targetDir, "AGENTS.md");
  if (!(await exists(agentsPath))) {
    await scaffoldAgentPolicies(targetDir, projectName);
    console.log(pc.green("  ✓ Injected AGENTS.md, CLAUDE.md, and Cursor rules"));
  } else {
    console.log(pc.yellow("  - AGENTS.md already exists, preserving"));
  }

  // 2. Phases & Repomap
  const phasesPath = path.join(targetDir, "docs", "phases", "status.md");
  if (!(await exists(phasesPath))) {
    await scaffoldPhases(targetDir);
    console.log(pc.green("  ✓ Generated docs/phases/status.md (Phase 00 initialized)"));
  }

  const repomapPath = path.join(targetDir, "docs", "repomap", "architecture.md");
  if (!(await exists(repomapPath))) {
    await scaffoldRepomap(targetDir, projectName, false);
    console.log(pc.green("  ✓ Generated docs/repomap/ fihrist architecture"));
  }

  // 3. Design References
  const designPath = path.join(targetDir, "docs", "design", "README.md");
  if (!(await exists(designPath))) {
    await scaffoldDesign(targetDir, projectName);
    console.log(pc.green("  ✓ Generated docs/design/ evidence directory"));
  }

  // 4. Tokens
  const tokensPath = path.join(targetDir, "src", "styles", "tokens.css");
  if (!(await exists(tokensPath))) {
    await scaffoldTokens(targetDir);
    console.log(pc.green("  ✓ Generated canonical src/styles/tokens.css"));
  }

  console.log(pc.green("\n✓ Project successfully adopted into Mozole governance."));
  console.log(`Run ${pc.cyan("mozole verify")} to audit current conformance.\n`);
}
