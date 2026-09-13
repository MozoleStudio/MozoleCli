import { type ChildProcess, spawn } from "node:child_process";

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

export async function run(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  options.signal?.throwIfAborted();
  const startTime = Date.now();

  const isWindows = process.platform === "win32";
  const finalCommand =
    isWindows && !command.endsWith(".exe") && !command.endsWith(".cmd") && !command.endsWith(".bat")
      ? command === "npm" || command === "npx"
        ? `${command}.cmd`
        : command
      : command;

  return new Promise((resolve, reject) => {
    const child = spawn(finalCommand, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      shell: false,
      windowsHide: true,
      detached: !isWindows,
      stdio: options.stdio ?? "pipe",
    });
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
