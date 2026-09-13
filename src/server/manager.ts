import { type ChildProcess, spawn } from "node:child_process";
import net from "node:net";

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

export async function findAvailablePort(startPort = 5173, maxTries = 20): Promise<number> {
  for (let p = startPort; p < startPort + maxTries; p++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(p, "127.0.0.1");
    });
    if (free) return p;
  }
  throw new Error(`Unable to find an open port in range ${startPort}-${startPort + maxTries}`);
}

class ServerManager {
  private servers = new Map<string, ManagedServer>();
  private cleanupRegistered = false;

  constructor() {
    this.registerCleanup();
  }

  private registerCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const onSignal = () => {
      this.stopAll();
      process.exit(0);
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    process.once("exit", () => this.stopAll());
  }

  public async startServer(projectName: string, projectPath: string): Promise<ManagedServer> {
    const existing = this.servers.get(projectName);
    if (existing && existing.process.exitCode === null) {
      return existing;
    }

    const port = await findAvailablePort(5173);
    const recentLogs: string[] = [];

    const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
      cwd: projectPath,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port) },
    });

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

    child.once("exit", () => {
      this.servers.delete(projectName);
    });

    this.servers.set(projectName, managed);
    return managed;
  }

  public stopServer(projectName: string): boolean {
    const managed = this.servers.get(projectName);
    if (!managed) return false;

    try {
      managed.process.kill("SIGTERM");
      setTimeout(() => {
        if (managed.process.exitCode === null) {
          managed.process.kill("SIGKILL");
        }
      }, 1500).unref();
    } catch {}

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
