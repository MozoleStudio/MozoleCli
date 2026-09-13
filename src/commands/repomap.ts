import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import {
  generateRepomapComponents,
  generateRepomapRoutes,
  generateRepomapTokens,
} from "../scaffold/repomap.js";
import { atomicWrite, exists, findProjectRoot } from "../utils/fs.js";

export interface RepomapCommandOptions {
  action?: "sync" | "check";
  cwd?: string;
}

export async function repomapCommand(options: RepomapCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = (await findProjectRoot(cwd)) ?? cwd;
  const action = options.action ?? "sync";
  if (action !== "sync" && action !== "check") {
    throw new Error(`Invalid repomap action '${action}'. Expected sync or check.`);
  }

  const repomapDir = path.join(projectRoot, "docs", "repomap");
  if (!(await exists(repomapDir))) {
    throw new Error(
      `Repomap directory not found: ${repomapDir}. Run 'mozole adopt' to initialize.`,
    );
  }

  const requiredFiles = ["architecture.md", "components.md", "routes.md", "tokens.md"];

  if (action === "check") {
    console.log(pc.cyan(`\n🔍 Checking docs/repomap architectural index in ${projectRoot}...`));
    let allOk = true;

    for (const file of requiredFiles) {
      const filePath = path.join(repomapDir, file);
      if (!(await exists(filePath))) {
        console.log(pc.red(`  ✗ Missing: docs/repomap/${file}`));
        allOk = false;
      } else {
        const stat = await fs.stat(filePath);
        if (stat.size === 0) {
          console.log(pc.yellow(`  ! Empty: docs/repomap/${file}`));
          allOk = false;
        } else {
          console.log(pc.green(`  ✓ Found: docs/repomap/${file} (${stat.size} bytes)`));
        }
      }
    }

    if (!allOk) {
      throw new Error("Repomap index validation failed. Run 'mozole repomap sync' to restore.");
    }
    console.log(pc.green("\n✓ Repomap architectural index is complete and healthy.\n"));
    return;
  }

  if (action === "sync") {
    console.log(pc.cyan(`\n🔄 Syncing docs/repomap architectural index in ${projectRoot}...`));

    // Components
    const compPath = path.join(repomapDir, "components.md");
    if (!(await exists(compPath))) {
      await atomicWrite(compPath, generateRepomapComponents());
      console.log(pc.green("  ✓ Generated docs/repomap/components.md"));
    } else {
      console.log(pc.gray("  • docs/repomap/components.md up to date"));
    }

    // Routes
    const routesPath = path.join(repomapDir, "routes.md");
    if (!(await exists(routesPath))) {
      await atomicWrite(routesPath, generateRepomapRoutes());
      console.log(pc.green("  ✓ Generated docs/repomap/routes.md"));
    } else {
      console.log(pc.gray("  • docs/repomap/routes.md up to date"));
    }

    // Tokens
    const tokensPath = path.join(repomapDir, "tokens.md");
    await atomicWrite(tokensPath, generateRepomapTokens());
    console.log(pc.green("  ✓ Synchronized docs/repomap/tokens.md"));

    console.log(pc.green("\n✓ Repomap index synchronized successfully.\n"));
  }
}
