import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { findAttributionInContent } from "../../src/utils/attribution.js";
import { atomicWrite, discoverWorkspaceProjects, isSafeProjectName } from "../../src/utils/fs.js";
import { formatPhaseCommitMessage } from "../../src/utils/git.js";

describe("Phase 1 Utilities", () => {
  it("keeps concurrent atomic writes complete even within the same millisecond", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-atomic-"));
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const contents = Array.from({ length: 30 }, (_, i) => String(i).repeat(10000));
      const file = path.join(directory, "state.json");
      await Promise.all(contents.map((content) => atomicWrite(file, content)));
      expect(contents).toContain(await fs.readFile(file, "utf8"));
      expect(await fs.readdir(directory)).toEqual(["state.json"]);
    } finally {
      clock.mockRestore();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  describe("isSafeProjectName", () => {
    it("accepts valid alphanumeric project names", () => {
      expect(isSafeProjectName("hotel-luxe")).toBe(true);
      expect(isSafeProjectName("client_site")).toBe(true);
      expect(isSafeProjectName("project123")).toBe(true);
    });

    it("rejects unsafe or path-traversal names", () => {
      expect(isSafeProjectName("")).toBe(false);
      expect(isSafeProjectName(".")).toBe(false);
      expect(isSafeProjectName("../foo")).toBe(false);
      expect(isSafeProjectName("foo/bar")).toBe(false);
      expect(isSafeProjectName("foo\\bar")).toBe(false);
    });
  });

  describe("formatPhaseCommitMessage", () => {
    it("formats clean conventional commit message with padded number", () => {
      expect(formatPhaseCommitMessage(1, "Design Tokens")).toBe("feat(phase-01): design-tokens");
      expect(formatPhaseCommitMessage(10, "Deployment Readiness")).toBe(
        "feat(phase-10): deployment-readiness",
      );
    });
  });

  describe("findAttributionInContent", () => {
    it("detects forbidden attribution markers", () => {
      const syntheticMarker1 = ["Generated", "by", "AI", "assistant"].join(" ");
      const syntheticMarker2 = ["Co-authored-by:", "Claude", "<noreply@anthropic.com>"].join(" ");
      const dirtyCode = `
        // ${syntheticMarker1}
        export const x = 1;
        // ${syntheticMarker2}
      `;
      const matches = findAttributionInContent(dirtyCode, "test.ts");
      expect(matches.length).toBe(2);
      expect(matches[0].match.toLowerCase()).toContain(["generated", "by", "ai"].join(" "));
      expect(matches[1].match.toLowerCase()).toContain(["co-authored-by:", "claude"].join(" "));
    });

    it("passes clean bespoke code", () => {
      const cleanCode = `
        // Action button primitive
        export const Button = () => <button>Click</button>;
      `;
      const matches = findAttributionInContent(cleanCode, "test.ts");
      expect(matches.length).toBe(0);
    });
  });

  describe("discoverWorkspaceProjects", () => {
    it("discovers projects defined in package.json workspaces", async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-ws-"));
      try {
        await atomicWrite(
          path.join(dir, "package.json"),
          JSON.stringify({
            workspaces: ["apps/*", "packages/core"],
          }),
        );
        await atomicWrite(path.join(dir, "apps/web/package.json"), "{}");
        await atomicWrite(path.join(dir, "apps/admin/package.json"), "{}");
        await atomicWrite(path.join(dir, "packages/core/package.json"), "{}");

        const found = await discoverWorkspaceProjects(dir);
        expect(found.length).toBe(3);
        const names = found.map((p) => p.name);
        expect(names).toContain("web");
        expect(names).toContain("admin");
        expect(names).toContain("core");
        const relatives = found.map((p) => p.relative);
        expect(relatives).toContain("apps/web");
        expect(relatives).toContain("apps/admin");
        expect(relatives).toContain("packages/core");
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it("discovers projects in projects/ subfolder", async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-proj-"));
      try {
        await atomicWrite(path.join(dir, "projects/client-a/AGENTS.md"), "Policy");
        await atomicWrite(path.join(dir, "projects/client-b/package.json"), "{}");

        const found = await discoverWorkspaceProjects(dir);
        expect(found.length).toBe(2);
        expect(found.map((p) => p.name)).toEqual(["client-a", "client-b"]);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });
});
