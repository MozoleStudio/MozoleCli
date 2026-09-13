import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runLiveGeometryProbe } from "../../src/qa/runner.js";
import { atomicWrite } from "../../src/utils/fs.js";
import { useSecurityDirectory } from "./helpers.js";

vi.mock("../../src/utils/browser.js", () => ({
  ensureChromiumBrowser: vi.fn(async () => ({ name: "security transport stub", type: "system" })),
  getBrowserLaunchArgs: vi.fn(() => []),
}));
vi.mock("playwright-core", () => ({ chromium: { launch: vi.fn() } }));

describe("security: qa/runner static HTTP server", () => {
  const directory = useSecurityDirectory();
  afterEach(() => vi.restoreAllMocks());

  // Raw HTTP paths are intentional: fetch/URL would normalize traversal before transmission.
  function request(port: number, rawPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get({ hostname: "127.0.0.1", port, path: rawPath, agent: false }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.once("error", reject);
        res.once("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.setTimeout(2000, () => req.destroy(new Error("HTTP request timed out")));
      req.once("error", reject);
    });
  }

  async function withServer(check: (port: number, root: string) => Promise<void>) {
    const root = path.join(directory(), "public");
    await atomicWrite(path.join(root, "index.html"), "SAFE_HOME");
    await atomicWrite(path.join(directory(), "secret.txt"), "PRIVATE_SENTINEL");
    const created = vi.spyOn(http, "createServer");
    const finished = new Error("transport assertions finished");
    vi.mocked(chromium.launch).mockImplementationOnce(async () => {
      const server = created.mock.results[0].value as http.Server;
      const address = server.address();
      expect(address).toMatchObject({ address: "127.0.0.1" });
      if (!address || typeof address === "string") throw new Error("Missing TCP address");
      await check(address.port, root);
      throw finished;
    });
    await expect(
      runLiveGeometryProbe({ cwd: directory(), staticDir: root, port: 0, routes: ["/"] }),
    ).rejects.toBe(finished);
    const server = created.mock.results[0].value as http.Server;
    expect(server.listening).toBe(false);
  }

  it.each([
    "/../secret.txt",
    "/../../secret.txt",
    "/%2e%2e/secret.txt",
    "/..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
    "/%252e%252e%252fsecret.txt",
    "/..%5csecret.txt",
    "/%2e%2e%5csecret.txt",
    "/assets/../../../secret.txt",
    "/../public-other/secret.txt",
  ])("never discloses an outside file for %s", async (payload) => {
    await withServer(async (port) => {
      const response = await request(port, payload);
      expect([200, 400, 403, 404]).toContain(response.status);
      expect(response.body).not.toContain("PRIVATE_SENTINEL");
      // SPA fallback is allowed, but an unrelated successful response must not pass.
      if (response.status === 200) expect(response.body).toBe("SAFE_HOME");
    });
  });

  it.each(["/%", "/%GG", "/%C0%AF", "/%E0%A4%A", "/%ED%A0%80"])(
    "rejects malformed URI %s and remains available",
    async (payload) => {
      await withServer(async (port) => {
        expect((await request(port, payload)).status).toBe(400);
        expect(await request(port, "/")).toEqual({ status: 200, body: "SAFE_HOME" });
      });
    },
  );

  it("does not treat query parameters as filesystem paths", async () => {
    await withServer(async (port) => {
      expect(await request(port, "/?file=../../secret.txt")).toEqual({
        status: 200,
        body: "SAFE_HOME",
      });
    });
  });

  it.skipIf(process.platform === "win32")(
    "blocks file and directory symlinks escaping the web root",
    async () => {
      await withServer(async (port, root) => {
        await fs.symlink(path.join(directory(), "secret.txt"), path.join(root, "leak.txt"));
        await fs.symlink(directory(), path.join(root, "linked"));
        for (const target of ["/leak.txt", "/linked/secret.txt"]) {
          const response = await request(port, target);
          expect(response.body).not.toContain("PRIVATE_SENTINEL");
          expect([403, 404]).toContain(response.status);
        }
      });
    },
  );

  it("does not disclose filesystem paths on file read errors", async () => {
    await withServer(async (port, root) => {
      await fs.mkdir(path.join(root, "broken", "index.html"), { recursive: true });
      const response = await request(port, "/broken/");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain(root);
      expect(response.body).not.toMatch(/EISDIR|Error:|node:fs/);
      expect((await request(port, "/")).status).toBe(200);
    });
  });
});
