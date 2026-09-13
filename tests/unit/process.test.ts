import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/utils/process.js";

describe("subprocess lifecycle", () => {
  it("reports timeouts as failure and rejects already aborted work", async () => {
    const timedOut = await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      timeoutMs: 100,
    });
    expect(timedOut.exitCode).not.toBe(0);
    const controller = new AbortController();
    controller.abort();
    await expect(
      run(process.execPath, ["-e", "process.exit(0)"], { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")(
    "cleans up detached children and preserves SIGTERM exit status",
    async () => {
      const script = `import { run } from ${JSON.stringify(path.resolve("src/utils/process.ts"))};
      await run(process.execPath, ["-e", 'process.kill(process.ppid, "SIGTERM"); setInterval(() => {}, 1000)']);`;
      const result = await run(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        { timeoutMs: 5000 },
      );
      expect(result.exitCode, result.stderr).toBe(143);
      expect(result.signal).toBeNull();
    },
  );
});
