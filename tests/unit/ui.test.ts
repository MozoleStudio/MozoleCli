import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../../src/commands/doctor.js";
import { phaseCommand } from "../../src/commands/phase.js";
import { repomapCommand } from "../../src/commands/repomap.js";
import { uiCommand } from "../../src/commands/ui.js";
import { verifyCommand } from "../../src/commands/verify.js";
import { serverManager } from "../../src/server/manager.js";
import { atomicWrite } from "../../src/utils/fs.js";

vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("../../src/commands/phase.js", () => ({
  phaseCommand: vi.fn(),
  getProjectPhaseStatus: vi.fn().mockResolvedValue({ currentPhase: "02" }),
}));
vi.mock("../../src/commands/verify.js", () => ({ verifyCommand: vi.fn().mockResolvedValue(true) }));
vi.mock("../../src/commands/doctor.js", () => ({
  doctorCommand: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/commands/repomap.js", () => ({
  repomapCommand: vi.fn().mockResolvedValue(undefined),
}));

describe("prototype cockpit selection", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-ui-"));
    await atomicWrite(path.join(root, "mozole.config.json"), "{}");
    await atomicWrite(path.join(root, "AGENTS.md"), "Workspace policy");
    await atomicWrite(path.join(root, "projects/client/AGENTS.md"), "Client policy");
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "clear").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each(["phase-status", "phase-next", "verify"])(
    "runs %s in the selected client, not the workspace",
    async (action) => {
      vi.mocked(prompts)
        .mockResolvedValueOnce({ project: "client" })
        .mockResolvedValueOnce({ action });
      await uiCommand();
      const cwd = path.join(root, "projects/client");
      if (action === "verify") expect(verifyCommand).toHaveBeenCalledWith({ cwd });
      else
        expect(phaseCommand).toHaveBeenCalledWith({
          cwd,
          action: action === "phase-next" ? "next" : "status",
        });
    },
  );

  it("traps operation errors without crashing or throwing from uiCommand", async () => {
    vi.mocked(verifyCommand).mockRejectedValueOnce(
      new Error("Simulated build failure in verification"),
    );
    vi.mocked(prompts)
      .mockResolvedValueOnce({ project: "client" })
      .mockResolvedValueOnce({ action: "verify" });

    await expect(uiCommand()).resolves.not.toThrow();
  });

  it("starts and stops dev server via serverManager from the cockpit", async () => {
    const mockServer = {
      id: "client-5173",
      projectName: "client",
      projectPath: path.join(root, "projects/client"),
      port: 5173,
      process: { pid: 9999 } as unknown as import("node:child_process").ChildProcess,
      url: "http://localhost:5173",
      startTime: Date.now(),
      recentLogs: ["VITE ready in 250ms"],
    };
    vi.spyOn(serverManager, "startServer").mockResolvedValueOnce(mockServer);
    vi.spyOn(serverManager, "stopServer").mockReturnValueOnce(true);

    // Start server
    vi.mocked(prompts)
      .mockResolvedValueOnce({ project: "client" })
      .mockResolvedValueOnce({ action: "server-start" });
    await uiCommand();
    expect(serverManager.startServer).toHaveBeenCalledWith(
      "client",
      path.join(root, "projects/client"),
    );

    // Stop server
    vi.mocked(prompts)
      .mockResolvedValueOnce({ project: "client" })
      .mockResolvedValueOnce({ action: "server-stop" });
    await uiCommand();
    expect(serverManager.stopServer).toHaveBeenCalledWith("client");
  });

  it("runs repomap sync and doctor diagnostics from the cockpit", async () => {
    vi.mocked(prompts)
      .mockResolvedValueOnce({ project: "client" })
      .mockResolvedValueOnce({ action: "repomap" });
    await uiCommand();
    expect(repomapCommand).toHaveBeenCalledWith({
      action: "sync",
      cwd: path.join(root, "projects/client"),
    });

    vi.mocked(prompts)
      .mockResolvedValueOnce({ project: "client" })
      .mockResolvedValueOnce({ action: "doctor" });
    await uiCommand();
    expect(doctorCommand).toHaveBeenCalled();
  });
});
