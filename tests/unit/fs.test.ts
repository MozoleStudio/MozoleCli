import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  atomicWrite,
  discoverWorkspaceProjects,
  findPrototypeRoot,
  isPrototypeRoot,
} from "../../src/utils/fs.js";

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

describe("isPrototypeRoot and findPrototypeRoot accurate identification", () => {
  it("rejects generic directories even if they contain a subfolder named projects", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-generic-"));
    try {
      await fs.mkdir(path.join(dir, "projects"), { recursive: true });
      expect(await isPrototypeRoot(dir)).toBe(false);
      expect(await findPrototypeRoot(dir)).toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("identifies prototype root when mozole.config.json declares projectsDir: 'projects'", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-proto-cfg-"));
    try {
      await atomicWrite(
        path.join(dir, "mozole.config.json"),
        JSON.stringify({ projectsDir: "projects" }),
      );
      expect(await isPrototypeRoot(dir)).toBe(true);

      const subDir = path.join(dir, "projects", "sub");
      await fs.mkdir(subDir, { recursive: true });
      expect(await findPrototypeRoot(subDir)).toBe(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("identifies prototype root when package.json contains mozolePrototype: true", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-proto-pkg-"));
    try {
      await atomicWrite(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "proto-repo", mozolePrototype: true }),
      );
      expect(await isPrototypeRoot(dir)).toBe(true);
      expect(await findPrototypeRoot(dir)).toBe(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("identifies prototype root when PROTOTYPE.md and projects/ exist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-proto-doc-"));
    try {
      await atomicWrite(path.join(dir, "PROTOTYPE.md"), "# Prototype");
      await fs.mkdir(path.join(dir, "projects"), { recursive: true });
      expect(await isPrototypeRoot(dir)).toBe(true);
      expect(await findPrototypeRoot(dir)).toBe(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
