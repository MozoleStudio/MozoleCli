import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const activeChildren = new Set<number>();
let cleanupRegistered = false;

export function trackProcess(child: ChildProcess): void {
  if (child.pid) {
    const pid = child.pid;
    activeChildren.add(pid);
    child.once("close", () => activeChildren.delete(pid));
  }
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const cleanup = () => {
    for (const pid of activeChildren) terminateProcess(pid, true);
  };
  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

export interface RunResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  signal: NodeJS.Signals | null;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  stdio?: "pipe" | "inherit";
}

export function terminateProcess(pid: number | undefined, force = false): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      killer.unref();
    } else {
      process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
    }
  } catch {
    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    } catch {}
  }
}

function isBatchExecutable(command: string, cwd?: string): boolean {
  if (process.platform !== "win32") return false;
  const lower = command.toLowerCase();
  if (lower.endsWith(".exe")) return false;
  if (lower.endsWith(".cmd") || lower.endsWith(".bat") || command === "npm" || command === "npx") {
    return true;
  }
  const workDir = cwd ?? process.cwd();
  const localBin = path.join(workDir, "node_modules", ".bin");
  if (
    fs.existsSync(path.join(localBin, `${command}.cmd`)) ||
    fs.existsSync(path.join(localBin, `${command}.bat`))
  ) {
    return true;
  }
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    if (
      fs.existsSync(path.join(dir, `${command}.cmd`)) ||
      fs.existsSync(path.join(dir, `${command}.bat`))
    ) {
      return true;
    }
    if (fs.existsSync(path.join(dir, `${command}.exe`))) {
      return false;
    }
  }
  return false;
}

export async function run(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  options.signal?.throwIfAborted();
  const startTime = Date.now();

  const isWindows = process.platform === "win32";
  const isBatch = isBatchExecutable(command, options.cwd);

  const finalCommand = isBatch ? process.env.ComSpec || "cmd.exe" : command;
  const finalArgs = isBatch ? ["/d", "/s", "/c", command, ...args] : args;

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(finalCommand, finalArgs, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env },
        shell: false,
        windowsHide: true,
        detached: !isWindows,
        stdio: options.stdio ?? "pipe",
      });
    } catch (error) {
      reject(error);
      return;
    }
    trackProcess(child);

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
    }

    let forceTimer: NodeJS.Timeout | undefined;
    const stop = (force = false) => {
      terminateProcess(child.pid, force);
      if (!force && !forceTimer) {
        forceTimer = setTimeout(() => terminateProcess(child.pid, true), 3_000);
        forceTimer.unref();
      }
    };

    const timeoutTimer = options.timeoutMs
      ? setTimeout(() => stop(true), options.timeoutMs)
      : undefined;

    const onAbort = () => stop(true);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", (error) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.once("close", (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", onAbort);

      resolve({
        command,
        args,
        exitCode: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
        signal,
      });
    });
  });
}
