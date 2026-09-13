import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adoptProject } from "../../src/commands/adopt.js";
import { doctorCommand } from "../../src/commands/doctor.js";
import { createNewProject } from "../../src/commands/new.js";
import { getProjectPhaseStatus, phaseCommand } from "../../src/commands/phase.js";
import { prototypeInit } from "../../src/commands/prototype.js";
import { repomapCommand } from "../../src/commands/repomap.js";
import { testCommand } from "../../src/commands/test.js";
import { exists } from "../../src/utils/fs.js";

describe("CLI Integration Suite", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-cli-int-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("initializes a prototype repository workspace and creates client projects", async () => {
    const protoDir = path.join(tmpDir, "prototype-workspace");
    await fs.mkdir(protoDir, { recursive: true });

    // mozole prototype init
    await prototypeInit({ cwd: protoDir, name: "prototype-workspace" });
    expect(await exists(path.join(protoDir, "mozole.config.json"))).toBe(true);
    expect(await exists(path.join(protoDir, "projects"))).toBe(true);
    expect(await exists(path.join(protoDir, "shared"))).toBe(true);
    expect(await exists(path.join(protoDir, "AGENTS.md"))).toBe(true);

    // mozole new client-alpha inside prototype workspace
    const projectDir = await createNewProject({
      name: "client-alpha",
      cwd: protoDir,
      flagship: false,
      backend: "php",
      initGit: false,
    });

    expect(projectDir).toBe(path.join(protoDir, "projects", "client-alpha"));
    expect(await exists(path.join(projectDir, "AGENTS.md"))).toBe(true);
    expect(await exists(path.join(projectDir, "docs", "phases", "status.md"))).toBe(true);
    expect(await exists(path.join(projectDir, "src", "styles", "tokens.css"))).toBe(true);
  });

  it("manages 10-step atomic phases (status, next, reopen)", async () => {
    const projectDir = path.join(tmpDir, "phase-site");
    await createNewProject({
      name: "phase-site",
      targetDir: projectDir,
      flagship: false,
      backend: "php",
      initGit: false,
    });

    // Check initial phase 00
    const initial = await getProjectPhaseStatus(projectDir);
    expect(initial.currentPhase).toBe("00");

    // Advance to phase 01
    await phaseCommand({ action: "next", cwd: projectDir });
    const p1 = await getProjectPhaseStatus(projectDir);
    expect(p1.currentPhase).toBe("01");

    // Advance to phase 02
    await phaseCommand({ action: "next", cwd: projectDir });
    const p2 = await getProjectPhaseStatus(projectDir);
    expect(p2.currentPhase).toBe("02");

    // Reopen phase 01 for maintenance
    await phaseCommand({ action: "reopen", phaseId: "01", cwd: projectDir });
    const pReopened = await getProjectPhaseStatus(projectDir);
    expect(pReopened.currentPhase).toBe("01");
  });

  it("checks and syncs repomap architectural index", async () => {
    const projectDir = path.join(tmpDir, "repomap-site");
    await createNewProject({
      name: "repomap-site",
      targetDir: projectDir,
      flagship: false,
      backend: "php",
      initGit: false,
    });

    // mozole repomap check should pass
    await expect(repomapCommand({ action: "check", cwd: projectDir })).resolves.not.toThrow();

    // mozole repomap sync should update files cleanly
    await expect(repomapCommand({ action: "sync", cwd: projectDir })).resolves.not.toThrow();
  });

  it("runs contract and a11y tests on scaffolded project", async () => {
    const projectDir = path.join(tmpDir, "qa-site");
    await createNewProject({
      name: "qa-site",
      targetDir: projectDir,
      flagship: false,
      backend: "php",
      initGit: false,
    });

    // mozole test contract
    await expect(testCommand({ type: "contract", cwd: projectDir })).resolves.not.toThrow();
  });

  it("adopts an existing project into Mozole governance", async () => {
    const legacyDir = path.join(tmpDir, "legacy-project");
    await fs.mkdir(path.join(legacyDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "package.json"),
      JSON.stringify({ name: "legacy", version: "1.0.0" }),
    );

    // mozole adopt
    await adoptProject({ targetDir: legacyDir });

    expect(await exists(path.join(legacyDir, "AGENTS.md"))).toBe(true);
    expect(await exists(path.join(legacyDir, "CLAUDE.md"))).toBe(true);
    expect(await exists(path.join(legacyDir, "docs", "phases", "status.md"))).toBe(true);
    expect(await exists(path.join(legacyDir, "docs", "repomap", "architecture.md"))).toBe(true);
    expect(await exists(path.join(legacyDir, "src", "styles", "tokens.css"))).toBe(true);
  });

  it("runs doctor diagnostic command without exceptions", async () => {
    await expect(doctorCommand()).resolves.not.toThrow();
  });
});
