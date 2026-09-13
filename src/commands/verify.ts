import pc from "picocolors";
import { scanProjectForAiTraces } from "../utils/ai-trace.js";
import { findProjectRoot } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { testCommand } from "./test.js";

export interface VerifyOptions {
  cwd?: string;
  skipBuild?: boolean;
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
    const traces = await scanProjectForAiTraces(projectRoot);
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

  // Stage 2: Biome Lint & Format Check
  console.log(pc.bold("\n2. Running Biome linter and formatter..."));
  try {
    const biomeRes = await run("npx", ["@biomejs/biome", "check", "src"], { cwd: projectRoot });
    if (biomeRes.exitCode === 0) {
      stages.push({ name: "Biome Code Standards", success: true });
      console.log(pc.green("  ✓ Biome lint and formatting clean."));
    } else {
      stages.push({
        name: "Biome Code Standards",
        success: false,
        evidence: biomeRes.stdout || biomeRes.stderr,
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
    const tscRes = await run("npx", ["tsc", "--noEmit"], { cwd: projectRoot });
    if (tscRes.exitCode === 0) {
      stages.push({ name: "TypeScript Typecheck", success: true });
      console.log(pc.green("  ✓ TypeScript compiled with zero type errors."));
    } else {
      stages.push({
        name: "TypeScript Typecheck",
        success: false,
        evidence: tscRes.stdout || tscRes.stderr,
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

  // Stage 4: Mozole Design Token & A11y Contract Audit
  console.log(pc.bold("\n4. Running Mozole Design Contract & A11y Audit..."));
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
