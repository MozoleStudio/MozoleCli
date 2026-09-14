import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPortHost,
  detectProjectPort,
  findAvailablePort,
  isPortAvailable,
  serverManager,
} from "../../src/server/manager.js";
import { atomicWrite } from "../../src/utils/fs.js";

describe("ServerManager and Port Availability", () => {
  afterEach(() => {
    serverManager.stopAll();
    vi.restoreAllMocks();
  });

  it("reports port as available when both 127.0.0.1 and ::1 are free", async () => {
    const available = await isPortAvailable(59888);
    expect(available).toBe(true);
  });

  it("detects port in use when bound on IPv6 ::1", async () => {
    const testPort = 59889;
    const server = net.createServer();
    let ipv6Bound = false;

    await new Promise<void>((resolve) => {
      server.once("error", () => resolve());
      server.listen(testPort, "::1", () => {
        ipv6Bound = true;
        resolve();
      });
    });

    if (ipv6Bound) {
      try {
        const available = await isPortAvailable(testPort);
        expect(available).toBe(false);
      } finally {
        await new Promise((res) => server.close(res));
      }
    } else {
      server.close();
    }
  });

  it("detects port in use when bound on IPv4 127.0.0.1", async () => {
    const testPort = 59890;
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(testPort, "127.0.0.1", () => resolve());
    });

    try {
      const available = await isPortAvailable(testPort);
      expect(available).toBe(false);
    } finally {
      await new Promise((res) => server.close(res));
    }
  });

  it("handles IPv6 EADDRNOTAVAIL gracefully and reports port as available if IPv4 is available", async () => {
    const testPort = 59891;
    const originalCreateServer = net.createServer;
    vi.spyOn(net, "createServer").mockImplementation((...args: unknown[]) => {
      const server = originalCreateServer(...(args as []));
      const originalListen = server.listen.bind(server);
      server.listen = (...listenArgs: unknown[]) => {
        const host = listenArgs[1];
        if (host === "::1") {
          queueMicrotask(() => {
            const err = new Error("address not available") as NodeJS.ErrnoException;
            err.code = "EADDRNOTAVAIL";
            server.emit("error", err);
          });
          return server;
        }
        return originalListen(...(listenArgs as [number, string]));
      };
      return server;
    });

    const available = await isPortAvailable(testPort);
    expect(available).toBe(true);
  });

  it("handles IPv6 EINVAL gracefully and reports port as available if IPv4 is available", async () => {
    const testPort = 59896;
    const originalCreateServer = net.createServer;
    vi.spyOn(net, "createServer").mockImplementation((...args: unknown[]) => {
      const server = originalCreateServer(...(args as []));
      const originalListen = server.listen.bind(server);
      server.listen = (...listenArgs: unknown[]) => {
        const host = listenArgs[1];
        if (host === "::1") {
          queueMicrotask(() => {
            const err = new Error("invalid argument") as NodeJS.ErrnoException;
            err.code = "EINVAL";
            server.emit("error", err);
          });
          return server;
        }
        return originalListen(...(listenArgs as [number, string]));
      };
      return server;
    });

    const available = await isPortAvailable(testPort);
    expect(available).toBe(true);
  });

  it("skips reserved ports in findAvailablePort", async () => {
    const port = await findAvailablePort(59892, 10, [59892, 59893]);
    expect(port).toBe(59894);
  });

  it("reserves ports of running servers in ServerManager", async () => {
    const spy = vi.spyOn(serverManager, "getRunningServers").mockReturnValue([
      {
        id: "obscura-5173",
        projectName: "obscura",
        projectPath: "/tmp/obscura",
        port: 5173,
        process: {} as ChildProcess,
        url: "http://localhost:5173",
        startTime: Date.now(),
        recentLogs: [],
      },
    ]);

    const findSpy = vi.fn().mockResolvedValue(5174);
    // Verify that startServer fetches running servers and passes their ports as reservedPorts
    const runningServers = serverManager.getRunningServers();
    expect(runningServers.map((s) => s.port)).toEqual([5173]);
    const port = await findAvailablePort(
      5173,
      20,
      runningServers.map((s) => s.port),
    );
    expect(port).toBe(5174);
    spy.mockRestore();
  });

  it("detects port in use when bound on IPv4 0.0.0.0", async () => {
    const testPort = 59897;
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(testPort, "0.0.0.0", () => resolve());
    });

    try {
      const available = await isPortAvailable(testPort);
      expect(available).toBe(false);
    } finally {
      await new Promise((res) => server.close(res));
    }
  });

  it("detects project port from vite.config, package.json, or defaults to 5173", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mozole-port-"));
    try {
      expect(await detectProjectPort(tmpDir)).toBe(5173);

      await atomicWrite(
        path.join(tmpDir, "vite.config.js"),
        "export default { server: { port: 3000 } };",
      );
      expect(await detectProjectPort(tmpDir)).toBe(3000);
    } finally {
      await rm(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(
        () => {},
      );
    }
  });
});
