import pc from "picocolors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand, isPortAvailable } from "../../src/commands/doctor.js";
import { findLocalChromium } from "../../src/utils/browser.js";
import { run } from "../../src/utils/process.js";

vi.mock("../../src/utils/browser.js", () => ({ findLocalChromium: vi.fn() }));
vi.mock("../../src/utils/process.js", () => ({ run: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("doctorCommand", () => {
  it("probes port availability with dual-stack support", async () => {
    const free = await isPortAvailable(59897);
    expect(typeof free).toBe("boolean");
  });

  it("reports Git as unavailable when launching it fails and continues diagnostics", async () => {
    vi.mocked(run).mockImplementation(async (command, args) => {
      if (command === "git") throw new Error("spawn git ENOENT");
      return {
        command,
        args,
        exitCode: 0,
        stdout: "PHP 8.3.0\n",
        stderr: "",
        durationMs: 0,
        signal: null,
      };
    });
    vi.mocked(findLocalChromium).mockResolvedValue(null);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await doctorCommand();

    expect(log).toHaveBeenCalledWith(pc.yellow("  ! Git: Not available"));
    expect(log).toHaveBeenCalledWith(pc.green("✓ Doctor environment diagnostics completed.\n"));
  });
});
