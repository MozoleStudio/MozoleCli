import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProjectPhaseStatus, phaseCommand } from "../../src/commands/phase.js";
import { type ScaffoldOptions, scaffoldNewProject } from "../../src/scaffold/index.js";
import { atomicWrite } from "../../src/utils/fs.js";
import { useSecurityDirectory } from "./helpers.js";

describe("security: scaffold input boundary", () => {
  const directory = useSecurityDirectory();
  it.each(["../escape", "a;touch INJECTED", "a\nscript", "CON.txt", "a\0b", "__proto__"])(
    "rejects hostile names before generating files: %j",
    async (name) => {
      await expect(
        scaffoldNewProject({ targetDir: directory(), name, initGit: false }),
      ).rejects.toThrow(/Invalid project name/);
      expect(await fs.readdir(directory())).toEqual([]);
    },
  );

  it.each(["../../escape", "php;id", "__proto__", "python"])(
    "rejects untrusted backend discriminator %s without writes",
    async (backend) => {
      await expect(
        scaffoldNewProject({
          targetDir: directory(),
          name: "safe-app",
          backend: backend as ScaffoldOptions["backend"],
          initGit: false,
        }),
      ).rejects.toThrow(/Invalid backend/);
      expect(await fs.readdir(directory())).toEqual([]);
    },
  );
});

describe("security: commands/phase state integrity", () => {
  const directory = useSecurityDirectory();
  it.each(["99", "-1", "../00", "00;id", "", "NaN"])(
    "rejects invalid stored phase %j",
    async (phase) => {
      const file = path.join(directory(), "docs/phases/status.md");
      const original = `**Current Phase:** Phase ${phase}\n`;
      await atomicWrite(file, original);
      await expect(getProjectPhaseStatus(directory())).rejects.toThrow(/Invalid current phase/);
      expect(await fs.readFile(file, "utf8")).toBe(original);
    },
  );

  it("rejects an unknown action without modifying phase state", async () => {
    const file = path.join(directory(), "docs/phases/status.md");
    const original = "**Current Phase:** Phase 00\n";
    await atomicWrite(file, original);
    await expect(phaseCommand({ cwd: directory(), action: "next;id" as "next" })).rejects.toThrow(
      /Invalid phase action/,
    );
    expect(await fs.readFile(file, "utf8")).toBe(original);
  });
});
