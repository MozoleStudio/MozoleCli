import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import net from "node:net";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAvailablePort, serverManager } from "../../src/server/manager.js";
import { terminateProcess, trackProcess } from "../../src/utils/process.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../../src/utils/process.js", () => ({ terminateProcess: vi.fn(), trackProcess: vi.fn() }));

describe("security: server/manager process isolation", () => {
  let children: ChildProcess[];
  beforeEach(() => {
    vi.clearAllMocks();
    children = [];
    vi.spyOn(net, "createServer").mockImplementation(() => {
      const server = new EventEmitter() as net.Server;
      server.listen = vi.fn(() => {
        queueMicrotask(() => server.emit("listening"));
        return server;
      });
      server.close = vi.fn((callback?: (error?: Error) => void) => {
        callback?.();
        return server;
      });
      return server;
    });
    vi.mocked(spawn).mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        pid: 10000 + children.length,
        exitCode: null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      }) as unknown as ChildProcess;
      children.push(child);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    });
  });
  afterEach(() => {
    serverManager.stopAll();
    for (const child of children) {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
    vi.restoreAllMocks();
  });

  it("keeps attacker-controlled project text out of shell commands", async () => {
    const name = "project; touch INJECTED";
    const cwd = "/isolated/project $(touch INJECTED)";
    const managed = await serverManager.startServer(name, cwd);
    const expectedNpm = process.platform === "win32" ? "npm.cmd" : "npm";
    expect(spawn).toHaveBeenCalledWith(
      expectedNpm,
      ["run", "dev", "--", "--port", "5173", "--strictPort"],
      expect.objectContaining({ cwd, shell: false, detached: process.platform !== "win32" }),
    );
    expect(trackProcess).toHaveBeenCalledWith(managed.process);
    expect(serverManager.stopServer(name)).toBe(true);
    expect(terminateProcess).toHaveBeenCalledWith(managed.process.pid, true);
  });

  it("caps retained log lines under noisy child output", async () => {
    const managed = await serverManager.startServer("noisy", "/isolated/noisy");
    managed.process.stdout?.emit(
      "data",
      Buffer.from(Array.from({ length: 2000 }, (_, i) => `line-${i}`).join("\n")),
    );
    managed.process.stderr?.emit("data", Buffer.from("last-error\n"));
    expect(managed.recentLogs).toHaveLength(50);
    expect(managed.recentLogs.at(-1)).toBe("last-error");
    expect(managed.recentLogs).not.toContain("line-0");
  });

  it("reuses a running process instead of multiplying children", async () => {
    const first = await serverManager.startServer("__proto__", "/isolated/project");
    expect(await serverManager.startServer("__proto__", "/isolated/project")).toBe(first);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("does not let an old close event erase a replacement process", async () => {
    const old = await serverManager.startServer("project", "/isolated/project");
    serverManager.stopServer("project");
    const replacement = await serverManager.startServer("project", "/isolated/project");
    old.process.emit("close", 0);
    expect(serverManager.getServer("project")).toBe(replacement);
  });

  it("removes a failed spawn from the registry", async () => {
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), { exitCode: null }) as ChildProcess;
      queueMicrotask(() => child.emit("error", new Error("executable unavailable")));
      return child;
    });
    await expect(serverManager.startServer("broken", "/isolated/project")).rejects.toThrow(
      /unavailable/,
    );
    expect(serverManager.getServer("broken")).toBeUndefined();
  });

  it("terminates all registered children and makes repeated cleanup harmless", async () => {
    const first = await serverManager.startServer("one", "/isolated/one");
    const second = await serverManager.startServer("two", "/isolated/two");
    serverManager.stopAll();
    serverManager.stopAll();
    expect(terminateProcess).toHaveBeenCalledTimes(2);
    expect(terminateProcess).toHaveBeenCalledWith(first.process.pid, true);
    expect(terminateProcess).toHaveBeenCalledWith(second.process.pid, true);
    expect(serverManager.getRunningServers()).toEqual([]);
  });

  it("bounds port scanning when all candidate ports are occupied", async () => {
    vi.mocked(net.createServer).mockImplementation(() => {
      const server = new EventEmitter() as net.Server;
      server.listen = vi.fn(() => {
        queueMicrotask(() => server.emit("error", new Error("EADDRINUSE")));
        return server;
      });
      return server;
    });
    await expect(findAvailablePort(5173, 3)).rejects.toThrow(/5173-5176/);
    expect(net.createServer).toHaveBeenCalledTimes(3);
  });
});
