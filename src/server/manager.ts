import { type ChildProcess, spawn } from "node:child_process";
import net from "node:net";
import { terminateProcess, trackProcess } from "../utils/process.js";

export interface ManagedServer {
  id: string;
  projectName: string;
  projectPath: string;
  port: number;
  process: ChildProcess;
  url: string;
  startTime: number;
  recentLogs: string[];
}

export function checkPortHost(
  port: number,
  host: string,
): Promise<"available" | "in_use" | "unsupported"> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRNOTAVAIL" || err.code === "EINVAL") {
        resolve("unsupported");
      } else {
        resolve("in_use");
      }
    });
    server.once("listening", () => {
      server.close(() => resolve("available"));
    });
    server.listen(port, host);
  });
}

export async function isPortAvailable(port: number): Promise<boolean> {
  const hosts = ["127.0.0.1", "::1"];
  let availableCount = 0;

  for (const host of hosts) {
    const res = await checkPortHost(port, host);
    if (res === "in_use") {
      return false;
    }
    if (res === "available") {
      availableCount++;
    }
  }

  return availableCount > 0;
}

export async function findAvailablePort(
  startPort = 5173,
  maxTries = 20,
  reservedPorts?: Iterable<number>,
): Promise<number> {
  const reservedSet = reservedPorts ? new Set(reservedPorts) : null;
  for (let p = startPort; p < startPort + maxTries; p++) {
    if (reservedSet?.has(p)) {
      continue;
    }
    const free = await isPortAvailable(p);
    if (free) return p;
  }
  throw new Error(`Unable to find an open port in range ${startPort}-${startPort + maxTries}`);
}

class ServerManager {
  private servers = new Map<string, ManagedServer>();

  public async startServer(projectName: string, projectPath: string): Promise<ManagedServer> {
    const existing = this.servers.get(projectName);
    if (existing && existing.process.exitCode === null) {
      return existing;
    }

    const reservedPorts = this.getRunningServers().map((s) => s.port);
    const port = await findAvailablePort(5173, 20, reservedPorts);
    const recentLogs: string[] = [];

    const isWindows = process.platform === "win32";
    const cmd = isWindows ? process.env.ComSpec || "cmd.exe" : "npm";
    const args = isWindows
      ? ["/d", "/s", "/c", "npm", "run", "dev", "--", "--port", String(port), "--strictPort"]
      : ["run", "dev", "--", "--port", String(port), "--strictPort"];

    const child = spawn(cmd, args, {
      cwd: projectPath,
      shell: false,
      detached: !isWindows,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port) },
    });
    trackProcess(child);

    const appendLog = (chunk: Buffer | string) => {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        if (line.trim()) {
          recentLogs.push(line.trim());
          if (recentLogs.length > 50) recentLogs.shift();
        }
      }
    };

    child.stdout?.on("data", appendLog);
    child.stderr?.on("data", appendLog);

    const managed: ManagedServer = {
      id: `${projectName}-${port}`,
      projectName,
      projectPath,
      port,
      process: child,
      url: `http://localhost:${port}`,
      startTime: Date.now(),
      recentLogs,
    };

    child.once("close", () => {
      if (this.servers.get(projectName) === managed) this.servers.delete(projectName);
    });

    this.servers.set(projectName, managed);
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        if (this.servers.get(projectName) === managed) this.servers.delete(projectName);
        reject(error);
      });
    });
    return managed;
  }

  public stopServer(projectName: string): boolean {
    const managed = this.servers.get(projectName);
    if (!managed) return false;

    terminateProcess(managed.process.pid, true);

    this.servers.delete(projectName);
    return true;
  }

  public stopAll(): void {
    for (const [name] of this.servers) {
      this.stopServer(name);
    }
  }

  public getRunningServers(): ManagedServer[] {
    return Array.from(this.servers.values()).filter((s) => s.process.exitCode === null);
  }

  public getServer(projectName: string): ManagedServer | undefined {
    const s = this.servers.get(projectName);
    return s && s.process.exitCode === null ? s : undefined;
  }
}

export const serverManager = new ServerManager();
