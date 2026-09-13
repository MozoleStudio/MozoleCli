import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { auditHtmlA11y } from "../qa/a11y.js";
import { type CssSource, auditCssContractsAsync } from "../qa/contract.js";
import { runLiveGeometryProbe } from "../qa/runner.js";
import { exists, findProjectRoot } from "../utils/fs.js";

export interface TestCommandOptions {
  cwd?: string;
  type?: "contract" | "a11y" | "probe" | "all";
}

export async function testCommand(options: TestCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = (await findProjectRoot(cwd)) ?? cwd;
  const testType = options.type ?? "all";
  if (!["contract", "a11y", "probe", "all"].includes(testType)) {
    throw new Error(`Invalid test type '${testType}'. Expected contract, a11y, probe, or all.`);
  }

  let hasFailures = false;

  // 1. PostCSS Design Token Contract Audit
  if (testType === "contract" || testType === "all") {
    console.log(pc.cyan(`\n🎨 Running Mozole Design Token Contract Audit in ${projectRoot}...`));

    async function collectCss(dir: string): Promise<CssSource[]> {
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results = await Promise.all(
        entries.map(async (e) => {
          const full = path.join(dir, e.name);
          if (e.isDirectory() && !["node_modules", ".git", "dist", "build"].includes(e.name)) {
            return collectCss(full);
          }
          if (e.isFile() && e.name.endsWith(".css")) {
            const css = await fs.readFile(full, "utf8");
            return [{ file: path.relative(projectRoot, full), css }];
          }
          return [];
        }),
      );
      return results.flat();
    }

    const cssSources = await collectCss(path.join(projectRoot, "src"));

    if (cssSources.length === 0) {
      console.log(pc.yellow("  ! No CSS files found in src/"));
    } else {
      const result = await auditCssContractsAsync(cssSources);

      for (const err of result.errors) {
        hasFailures = true;
        console.log(
          pc.red(`  ✗ [ERROR] ${err.file}:${err.line} (${err.selector}): ${err.message}`),
        );
        console.log(pc.dim(`    Rule: ${err.rule} | Value: ${err.value}`));
      }

      for (const warn of result.warnings) {
        console.log(
          pc.yellow(`  ! [WARN] ${warn.file}:${warn.line} (${warn.selector}): ${warn.message}`),
        );
      }

      if (result.errors.length === 0) {
        console.log(
          pc.green(`  ✓ Design contracts verified across ${cssSources.length} CSS files.`),
        );
        if (result.warnings.length > 0) {
          console.log(pc.yellow(`    (${result.warnings.length} diagnostic warnings)`));
        }
      }
    }
  }

  // 2. Static HTML & Accessibility Audit
  if (testType === "a11y" || testType === "all") {
    console.log(
      pc.cyan(`\n♿ Running Static A11y & Landmark Hierarchy Audit in ${projectRoot}...`),
    );

    async function collectHtml(dir: string): Promise<{ file: string; html: string }[]> {
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results = await Promise.all(
        entries.map(async (entry) => {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) return collectHtml(full);
          if (
            entry.isFile() &&
            entry.name.endsWith(".html") &&
            entry.name !== "__spa-fallback.html"
          ) {
            const html = await fs.readFile(full, "utf8");
            return [{ file: path.relative(projectRoot, full), html }];
          }
          return [];
        }),
      );
      return results.flat();
    }

    let htmlSources = await collectHtml(path.join(projectRoot, "build", "client"));
    if (htmlSources.length === 0) {
      htmlSources = await collectHtml(path.join(projectRoot, "dist"));
    }
    const indexHtmlPath = path.join(projectRoot, "index.html");
    if (htmlSources.length === 0 && (await exists(indexHtmlPath))) {
      const html = await fs.readFile(indexHtmlPath, "utf8");
      htmlSources.push({ file: "index.html", html });
    }

    if (htmlSources.length === 0) {
      console.log(
        pc.yellow("  ! No HTML available for accessibility audit. Build the project first."),
      );
    } else {
      const result = auditHtmlA11y(htmlSources);
      for (const err of result.errors) {
        hasFailures = true;
        console.log(pc.red(`  ✗ [ERROR] ${err.file}:${err.line} (${err.element}): ${err.message}`));
      }
      for (const warn of result.warnings) {
        console.log(
          pc.yellow(`  ! [WARN] ${warn.file}:${warn.line} (${warn.element}): ${warn.message}`),
        );
      }
      if (result.errors.length === 0) {
        console.log(pc.green("  ✓ Accessibility landmark hierarchy passed."));
      }
    }
  }

  // 3. Live Headless DOM Geometry & Trace Probe (Separate command per policy)
  if (testType === "probe") {
    const probeRes = await runLiveGeometryProbe({ cwd: projectRoot });
    if (!probeRes.success) {
      hasFailures = true;
    }
  }

  console.log();
  if (hasFailures) {
    throw new Error("Mozole quality test suite detected contract or accessibility violations.");
  }
}
