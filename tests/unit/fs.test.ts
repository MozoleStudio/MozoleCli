import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite, discoverWorkspaceProjects } from "../../src/utils/fs.js";

describe("discoverWorkspaceProjects deduplication in prototype workspaces", () => {
  it("never returns duplicates when both workspaces array and projects/ directory are present", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-proto-ws-"));
    try {
      // Setup prototype workspace with package.json workspaces: ['projects/*'] and projects/ dir
      await atomicWrite(
        path.join(dir, "package.json"),
        JSON.stringify({
          workspaces: ["projects/*"],
        }),
      );
      await atomicWrite(path.join(dir, "projects/alpha/package.json"), "{}");
      await atomicWrite(path.join(dir, "projects/beta/AGENTS.md"), "# Beta Project");

      const projects = await discoverWorkspaceProjects(dir);

      // Verify deduplication and proper structure
      expect(projects.length).toBe(2);

      const alpha = projects.find((p) => p.name === "alpha");
      expect(alpha).toBeDefined();
      expect(alpha?.name).toBe("alpha");
      expect(alpha?.relative).toBe("projects/alpha");
      expect(alpha?.path).toBe(path.resolve(dir, "projects/alpha"));

      const beta = projects.find((p) => p.name === "beta");
      expect(beta).toBeDefined();
      expect(beta?.name).toBe("beta");
      expect(beta?.relative).toBe("projects/beta");
      expect(beta?.path).toBe(path.resolve(dir, "projects/beta"));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("handles non-wildcard workspaces and fallback scanning without duplicates", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-proto-ws-2-"));
    try {
      await atomicWrite(
        path.join(dir, "package.json"),
        JSON.stringify({
          workspaces: ["packages/shared"],
        }),
      );
      await atomicWrite(path.join(dir, "packages/shared/package.json"), "{}");
      await atomicWrite(path.join(dir, "projects/shared/package.json"), "{}");

      const projects = await discoverWorkspaceProjects(dir);

      expect(projects.length).toBe(2);
      expect(projects.map((p) => ({ name: p.name, relative: p.relative }))).toEqual([
        { name: "shared", relative: "packages/shared" },
        { name: "shared", relative: "projects/shared" },
      ]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
