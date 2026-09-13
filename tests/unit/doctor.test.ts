import pc from "picocolors";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../../src/commands/doctor.js";
import * as processUtils from "../../src/utils/process.js";

vi.mock("../../src/utils/process.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/process.js")>();
  return {
    ...actual,
    run: vi.fn(actual.run),
  };
});

// Avoid modifying global findLocalChromium behavior here if not needed
// The default run() from process.js might be mocked for browser checking too,
// so let's just make sure git fails as required.

describe("doctorCommand", () => {
  let consoleSpy: MockInstance;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports Git as not available when run throws an error", async () => {
    vi.mocked(processUtils.run).mockImplementation(async (command, args, options) => {
      if (command === "git") {
        throw new Error("spawn git ENOENT");
      }
      return {
        command,
        args: args || [],
        exitCode: 0,
        stdout: "mocked stdout",
        stderr: "",
        durationMs: 0,
        signal: null,
      };
    });

    await doctorCommand();

    expect(consoleSpy).toHaveBeenCalledWith(pc.yellow("  ! Git: Not available"));
  });
});
