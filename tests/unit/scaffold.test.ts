import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditHtmlA11y } from "../../src/qa/a11y.js";
import { auditCssContracts } from "../../src/qa/contract.js";
import { scaffoldNewProject } from "../../src/scaffold/index.js";
import { scanProjectForAiTraces } from "../../src/utils/ai-trace.js";

describe("scaffoldNewProject", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-scaffold-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("scaffolds a complete standard project with zero AI traces and valid tokens", async () => {
    const projectDir = path.join(tmpDir, "test-site");
    await scaffoldNewProject({
      targetDir: projectDir,
      name: "test-site",
      flagship: false,
      backend: "php",
      initGit: false,
    });

    // 1. Authoritative Policy & Bridges
    const agentsMd = await fs.readFile(path.join(projectDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("Agentic Engineering Policy");
    expect(agentsMd).toContain("Phase 00: Project Initialization & Contracts");
    expect(agentsMd).toContain("Zero Synthetic Attribution");

    const claudeMd = await fs.readFile(path.join(projectDir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("@AGENTS.md");

    const cursorRule = await fs.readFile(
      path.join(projectDir, ".cursor", "rules", "mozole.mdc"),
      "utf8",
    );
    expect(cursorRule).toContain("Mozole Engineering Policy");

    // 2. Canonical Tokens
    const tokensCss = await fs.readFile(
      path.join(projectDir, "src", "styles", "tokens.css"),
      "utf8",
    );
    expect(tokensCss).toContain("@theme");
    expect(tokensCss).toContain("--color-primary:");

    // Verify token CSS against Mozole contract audit
    const cssAudit = auditCssContracts([{ file: "src/styles/tokens.css", css: tokensCss }]);
    expect(cssAudit.errors).toEqual([]);

    // 3. Phases & Repomap
    const phasesStatus = await fs.readFile(
      path.join(projectDir, "docs", "phases", "status.md"),
      "utf8",
    );
    expect(phasesStatus).toContain("**Current Phase:** Phase 00");

    const architecture = await fs.readFile(
      path.join(projectDir, "docs", "repomap", "architecture.md"),
      "utf8",
    );
    expect(architecture).toContain("React Router 7");

    // 4. Backend PHP
    const phpConfig = await fs.readFile(path.join(projectDir, "api", "config.php"), "utf8");
    expect(phpConfig).toContain("MOZOLE_SECURE");

    const phpIndex = await fs.readFile(path.join(projectDir, "api", "index.php"), "utf8");
    expect(phpIndex).toContain("honeypot_field");
    expect(phpIndex).toContain("rate_limit");

    // 5. Zero AI Trace Check across entire project
    const traces = await scanProjectForAiTraces(projectDir);
    expect(traces).toEqual([]);
  });

  it("scaffolds a flagship creative project with Wouter and persistent Canvas", async () => {
    const projectDir = path.join(tmpDir, "creative-site");
    await scaffoldNewProject({
      targetDir: projectDir,
      name: "creative-site",
      flagship: true,
      backend: "php",
      initGit: false,
    });

    const pkg = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.dependencies.wouter).toBeDefined();
    expect(pkg.dependencies.lenis).toBeDefined();

    const canvasComponent = await fs.readFile(
      path.join(projectDir, "src", "components", "creative", "CanvasLayer.tsx"),
      "utf8",
    );
    expect(canvasComponent).toContain("prefers-reduced-motion");
    expect(canvasComponent).toContain("CanvasLayer");

    const indexHtml = await fs.readFile(path.join(projectDir, "index.html"), "utf8");
    const a11yResult = auditHtmlA11y([{ file: "index.html", html: indexHtml }]);
    expect(a11yResult.errors).toEqual([]);
  });
});
