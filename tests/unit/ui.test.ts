import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { phaseCommand } from "../../src/commands/phase.js";
import { uiCommand } from "../../src/commands/ui.js";
import { verifyCommand } from "../../src/commands/verify.js";
import { atomicWrite } from "../../src/utils/fs.js";

vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("../../src/commands/phase.js", () => ({
  phaseCommand: vi.fn(),
  getProjectPhaseStatus: vi.fn().mockResolvedValue({ currentPhase: "02" }),
}));
vi.mock("../../src/commands/verify.js", () => ({ verifyCommand: vi.fn().mockResolvedValue(true) }));

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
});
