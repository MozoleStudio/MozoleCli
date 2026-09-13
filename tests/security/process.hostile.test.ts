import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/utils/process.js";
import { useSecurityDirectory } from "./helpers.js";

describe("security: utils/process", () => {
  const directory = useSecurityDirectory();

  it("passes shell syntax literally without creating an injected marker", async () => {
    const args = [
      "; touch INJECTED",
      "$(touch INJECTED)",
      "`touch INJECTED`",
      "& echo pwned > INJECTED",
      "| cat",
      "> INJECTED",
      "--eval=process.exit(99)",
      "line\nbreak",
      "a\"b'c",
      "%PATH%",
      "$HOME",
    ];
    const result = await run(
      process.execPath,
      ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--", ...args],
      { cwd: directory(), timeoutMs: 3000 },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(args);
    expect(await fs.readdir(directory())).toEqual([]);
  });

  it("keeps stdout and stderr separate under bounded stream flooding", async () => {
    const bytes = 5 * 1024 * 1024;
    const result = await run(
      process.execPath,
      [
        "-e",
        `process.stdout.write('X'.repeat(${bytes})); process.stderr.write('Y'.repeat(${bytes}));`,
      ],
      { timeoutMs: 5000 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("X".repeat(bytes));
    expect(result.stderr).toBe("Y".repeat(bytes));
  }, 10000);

  it("rejects a missing executable as a handled error", async () => {
    await expect(
      run(path.join(directory(), "missing-binary"), [], { timeoutMs: 1000 }),
    ).rejects.toThrow();
  });

  it("does not start work when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      run(process.execPath, ["-e", "require('fs').writeFileSync('started', 'yes')"], {
        cwd: directory(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(await fs.readdir(directory())).toEqual([]);
  });

  it("terminates an endless process at its deadline", async () => {
    const result = await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      timeoutMs: 200,
    });
    expect(result.exitCode).not.toBe(0);
  }, 5000);

  it("cancels in-flight work", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 200);
    try {
      const result = await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        signal: controller.signal,
        timeoutMs: 2000,
      });
      expect(controller.signal.aborted).toBe(true);
      expect(result.exitCode).not.toBe(0);
    } finally {
      clearTimeout(timer);
    }
  }, 5000);
});
