import { readFile } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { scanProjectAttribution } from "../utils/attribution.js";
import { exists, findNodeModulesFile, findProjectRoot } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { auditPerformance, formatPerformance } from "./performance.js";
import { testCommand } from "./test.js";

export interface VerifyOptions {
  cwd?: string;
  skipBuild?: boolean;
  withProbe?: boolean;
  withPerformance?: boolean;
}

export interface VerificationStage {
  name: string;
  success: boolean;
  message?: string;
  evidence?: string;
}

export async function verifyCommand(options: VerifyOptions = {}): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = (await findProjectRoot(cwd)) ?? cwd;

  console.log(pc.cyan(`\n🛡️  Running Mozole Deterministic Verification in ${pc.bold(projectRoot)}`));
  console.log(pc.gray("═".repeat(65)));

  const stages: VerificationStage[] = [];

  // Stage 1: Synthetic Trace Scanner
  console.log(pc.bold("\n1. Scanning for synthetic attribution markers and bot trailers..."));
  try {
    const traces = await scanProjectAttribution(projectRoot);
    if (traces.length > 0) {
      stages.push({
        name: "Synthetic Trace Scanner",
        success: false,
        message: `Detected ${traces.length} synthetic attribution marker(s).`,
        evidence: traces.map((t) => `  ${t.file}:${t.line} -> "${t.match}"`).join("\n"),
      });
      console.log(pc.red("  ✗ Prohibited synthetic markers found:"));
      for (const t of traces) {
        console.log(pc.red(`    - ${t.file}:${t.line} (${t.match})`));
      }
    } else {
      stages.push({ name: "Synthetic Trace Scanner", success: true });
      console.log(pc.green("  ✓ Zero synthetic traces or bot trailers detected."));
    }
  } catch (err: unknown) {
    stages.push({
      name: "Synthetic Trace Scanner",
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Compute hoisted node_modules/.bin paths for monorepo workspaces
  const binDirs: string[] = [];
  let cur = path.resolve(projectRoot);
  while (true) {
    const binCandidate = path.join(cur, "node_modules", ".bin");
    if (await exists(binCandidate)) {
      binDirs.push(binCandidate);
    }
    const par = path.dirname(cur);
    if (par === cur) break;
    cur = par;
  }
  const pathSep = process.platform === "win32" ? ";" : ":";
  const augmentedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH:
      binDirs.length > 0
        ? `${binDirs.join(pathSep)}${pathSep}${process.env.PATH ?? ""}`
        : process.env.PATH,
  };

  // Stage 2: Biome Lint & Format Check
  console.log(pc.bold("\n2. Running Biome linter and formatter..."));
  try {
    const biomeBin =
      (await findNodeModulesFile(projectRoot, "@biomejs/biome/bin/biome")) ??
      path.join(projectRoot, "node_modules/@biomejs/biome/bin/biome");
    const targetDir = (await exists(path.join(projectRoot, "src")))
      ? "src"
      : (await exists(path.join(projectRoot, "app")))
        ? "app"
        : ".";
    const biomeRes = await run(process.execPath, [biomeBin, "check", targetDir], {
      cwd: projectRoot,
      env: augmentedEnv,
    });
    if (biomeRes.exitCode === 0) {
      stages.push({ name: "Biome Code Standards", success: true });
      console.log(pc.green("  ✓ Biome lint and formatting clean."));
    } else {
      stages.push({
        name: "Biome Code Standards",
        success: false,
        evidence: biomeRes.stderr + biomeRes.stdout,
      });
      console.log(pc.red("  ✗ Biome reported lint or formatting violations."));
    }
  } catch (err: unknown) {
    // Environmental check
    stages.push({
      name: "Biome Code Standards",
      success: false,
      message: `Biome execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Stage 3: TypeScript Compilation & Typecheck
  console.log(pc.bold("\n3. Running TypeScript typecheck..."));
  try {
    const pkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
    const tscBin =
      (await findNodeModulesFile(projectRoot, "typescript/bin/tsc")) ??
      path.join(projectRoot, "node_modules/typescript/bin/tsc");
    const tscRes = pkg.scripts?.typecheck
      ? await run("npm", ["run", "typecheck"], { cwd: projectRoot, env: augmentedEnv })
      : await run(process.execPath, [tscBin, "--noEmit"], { cwd: projectRoot, env: augmentedEnv });
    if (tscRes.exitCode === 0) {
      stages.push({ name: "TypeScript Typecheck", success: true });
      console.log(pc.green("  ✓ TypeScript compiled with zero type errors."));
    } else {
      stages.push({
        name: "TypeScript Typecheck",
        success: false,
        evidence: tscRes.stderr + tscRes.stdout,
      });
      console.log(pc.red("  ✗ TypeScript compilation reported type errors."));
    }
  } catch (err: unknown) {
    stages.push({
      name: "TypeScript Typecheck",
      success: false,
      message: `TypeScript execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (!options.skipBuild) {
    console.log(pc.bold("\n4. Building production output..."));
    try {
      const build = await run("npm", ["run", "build"], { cwd: projectRoot, env: augmentedEnv });
      stages.push({
        name: "Production Build",
        success: build.exitCode === 0,
        evidence: build.stdout + build.stderr,
      });
    } catch (error) {
      stages.push({ name: "Production Build", success: false, message: String(error) });
    }
  }

  console.log(pc.bold("\n5. Running Mozole Design Contract & A11y Audit..."));
  try {
    await testCommand({ cwd: projectRoot, type: "all" });
    stages.push({ name: "Design Contract & A11y Audit", success: true });
  } catch (err: unknown) {
    stages.push({
      name: "Design Contract & A11y Audit",
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Stage 6: Live Headless DOM Geometry & Trace Probe (if requested)
  if (options.withProbe) {
    console.log(pc.bold("\n6. Running Live Headless DOM Geometry & Trace Probe..."));
    try {
      await testCommand({ cwd: projectRoot, type: "probe" });
      stages.push({ name: "Live DOM Geometry Probe", success: true });
    } catch (err: unknown) {
      stages.push({
        name: "Live DOM Geometry Probe",
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (options.withPerformance) {
    console.log(pc.bold("\n7. Auditing static performance budgets..."));
    try {
      const report = await auditPerformance({ cwd: projectRoot });
      stages.push({
        name: "Performance Budgets",
        success: !report.findings.some((finding) => finding.severity === "error"),
        evidence: formatPerformance(report).join("\n"),
      });
      for (const line of formatPerformance(report)) console.log(line);
    } catch (error) {
      stages.push({
        name: "Performance Budgets",
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Summary Report
  console.log(pc.gray(`\n${"═".repeat(65)}`));
  const failedStages = stages.filter((s) => !s.success);
  const allPassed = failedStages.length === 0;

  if (allPassed) {
    console.log(
      pc.green(
        pc.bold("\n🎉 All Mozole verification checks PASSED! Ready for deployment/commit.\n"),
      ),
    );
  } else {
    console.log(
      pc.red(
        pc.bold(
          `\n❌ Verification FAILED (${failedStages.length}/${stages.length} stages failed):\n`,
        ),
      ),
    );
    for (const f of failedStages) {
      console.log(pc.red(`  ✗ Stage: ${f.name}`));
      if (f.message) console.log(pc.red(`    Message: ${f.message}`));
      if (f.evidence) {
        console.log(pc.dim("    Evidence:"));
        const sample = f.evidence.split("\n").slice(0, 10).join("\n");
        console.log(pc.dim(sample));
      }
    }
    console.log();
  }

  return allPassed;
}
