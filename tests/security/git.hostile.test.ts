import { beforeEach, describe, expect, it, vi } from "vitest";
import { initGit, stageAndCommit } from "../../src/utils/git.js";
import { type RunResult, run } from "../../src/utils/process.js";

vi.mock("../../src/utils/fs.js", () => ({ exists: vi.fn(async () => true) }));
vi.mock("../../src/utils/process.js", () => ({ run: vi.fn() }));

function result(exitCode = 0, stdout = "", stderr = ""): RunResult {
  return { command: "git", args: [], exitCode, stdout, stderr, signal: null, durationMs: 0 };
}

describe("security: utils/git argument and index integrity", () => {
  beforeEach(() => {
    vi.mocked(run).mockReset();
  });

  it.each(["-m injected", "$(touch INJECTED)", "title; touch INJECTED", "title\n--no-verify"])(
    "passes hostile commit message as exactly one argument: %j",
    async (message) => {
      vi.mocked(run).mockResolvedValue(result());
      expect(await initGit("/isolated/project", message)).toBe(true);
      expect(run).toHaveBeenLastCalledWith("git", ["commit", "-m", message], {
        cwd: "/isolated/project",
      });
      expect(run).toHaveBeenCalledTimes(4);
    },
  );

  it.each(["add", "commit"])("restores the original index when %s fails", async (failure) => {
    vi.mocked(run).mockImplementation(async (_command, args = []) => {
      if (args[0] === "write-tree") return result(0, "abc123\n");
      if (args[0] === failure) return result(1, "", "blocked");
      return result();
    });
    expect(await stageAndCommit("/isolated/project", "safe message")).toEqual({
      success: false,
      output: "blocked",
    });
    expect(run).toHaveBeenLastCalledWith("git", ["read-tree", "abc123"], {
      cwd: "/isolated/project",
    });
    expect(vi.mocked(run).mock.calls.some(([, args]) => args.includes("--hard"))).toBe(false);
    if (failure === "add")
      expect(vi.mocked(run).mock.calls.some(([, args]) => args[0] === "commit")).toBe(false);
  });

  it("does not stage anything when the index snapshot fails", async () => {
    vi.mocked(run).mockResolvedValue(result(1, "", "unmerged index"));
    expect((await stageAndCommit("/isolated/project", "message")).success).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("git", ["write-tree"], { cwd: "/isolated/project" });
  });

  it("restores the index after a subprocess exception", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce(result(0, "abc123\n"))
      .mockRejectedValueOnce(new Error("spawn failed"))
      .mockResolvedValueOnce(result());
    expect((await stageAndCommit("/isolated/project", "message")).success).toBe(false);
    expect(run).toHaveBeenLastCalledWith("git", ["read-tree", "abc123"], {
      cwd: "/isolated/project",
    });
  });

  it("surfaces rollback failure instead of claiming the index is restored", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce(result(0, "abc123\n"))
      .mockResolvedValueOnce(result(1, "", "add failed"))
      .mockResolvedValueOnce(result(1, "", "index locked"));
    await expect(stageAndCommit("/isolated/project", "message")).rejects.toThrow(
      /Unable to restore Git index/,
    );
  });
});
