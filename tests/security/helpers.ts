import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";

export function useSecurityDirectory(): () => string {
  let directory: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-security-"));
  });
  afterEach(async () => {
    if (directory)
      await fs
        .rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
        .catch(() => {});
  });
  return () => directory;
}
