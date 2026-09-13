import path from "node:path";
import { atomicWrite, isSafeProjectName } from "../utils/fs.js";
import { initGit } from "../utils/git.js";
import { scaffoldAgentPolicies } from "./agents.js";
import { scaffoldBackend } from "./backend.js";
import { scaffoldDesign } from "./design.js";
import { scaffoldFlagshipProject } from "./flagship.js";
import { scaffoldLibrary } from "./library.js";
import { scaffoldPhases } from "./phases.js";
import { scaffoldRepomap } from "./repomap.js";
import { scaffoldStandardProject } from "./standard.js";
import { scaffoldTokens } from "./tokens.js";
import { scaffoldWorkflow } from "./workflow.js";

export interface ScaffoldOptions {
  targetDir: string;
  name: string;
  flagship?: boolean;
  backend?: "php" | "node" | "none";
  initGit?: boolean;
}

export async function scaffoldNewProject(options: ScaffoldOptions): Promise<void> {
  const {
    targetDir,
    name,
    flagship = false,
    backend = "none",
    initGit: shouldInitGit = true,
  } = options;
  if (backend !== "php" && backend !== "node" && backend !== "none") {
    throw new Error(`Invalid backend '${backend}'. Expected none, php, or node.`);
  }

  if (!isSafeProjectName(name)) {
    throw new Error(
      `Invalid project name '${name}'. Use lowercase alphanumeric characters and hyphens.`,
    );
  }

  // 1. Authoritative Agent Policy & Bridges
  await scaffoldAgentPolicies(targetDir, name);

  // 2. Canonical Design Tokens (@theme)
  await scaffoldTokens(targetDir);

  // 3. 10-Step Atomic Phases
  await scaffoldPhases(targetDir);

  // 4. Repomap & Fihrist
  await scaffoldRepomap(targetDir, name, flagship, backend);

  // 5. Design Evidence Directory
  await scaffoldDesign(targetDir, name);
  await scaffoldWorkflow(targetDir);

  // 6. Frontend Framework Engine
  if (flagship) {
    await scaffoldFlagshipProject(targetDir, name);
  } else {
    await scaffoldStandardProject(targetDir, name);
  }

  await scaffoldLibrary(targetDir);
  await atomicWrite(
    path.join(targetDir, ".mozole", "project.json"),
    JSON.stringify(
      {
        version: 1,
        name,
        profile: flagship ? "flagship" : "standard",
        backend,
        library: "src/library/index.ts",
      },
      null,
      2,
    ),
  );
  await atomicWrite(
    path.join(targetDir, ".gitignore"),
    "node_modules/\ndist/\nbuild/\n.react-router/\n.env\n.env.*\n!.env.example\n*.log\nrelease/\nrelease.zip\nreleases/\n",
  );

  // 7. Backend API & Security Layer (optional)
  if (backend !== "none") {
    await scaffoldBackend(targetDir, backend);
  }

  // 8. Initialize Git Repository with Clean Initial Commit
  if (shouldInitGit) {
    try {
      await initGit(targetDir);
    } catch {
      // Non-fatal if git is unavailable in environment
    }
  }
}
