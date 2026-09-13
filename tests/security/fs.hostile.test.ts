import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite, isSafeProjectName, writeFiles } from "../../src/utils/fs.js";
import { useSecurityDirectory } from "./helpers.js";

describe("security: utils/fs", () => {
  const directory = useSecurityDirectory();

  it.each([
    "",
    ".",
    "..",
    "../escape",
    "a/../../escape",
    "a\\..\\escape",
    "/tmp/escape",
    "C:\\escape",
    "\\\\host\\share",
    "name\0suffix",
    "name\n",
    "name\r",
    " name",
    "name ",
    "-option",
    "$(id)",
    "`id`",
    "a;id",
    "a|id",
    "a&b",
    "a>b",
    "a<b",
    "a\tb",
    "a:b",
    "a?b",
    "a*b",
    'a"b',
    "a'b",
    "a\u202eb",
    "a\u200bb",
    "node_modules",
    "dist",
    "build",
    "public",
    "src",
    "package.json",
    "package-lock.json",
    "CON",
    "con.txt",
    "PRN",
    "aux.log",
    "nul",
    "NUL.json",
    ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
    ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}.txt`),
  ])("rejects unsafe project name %j", (name) => {
    expect(isSafeProjectName(name)).toBe(false);
  });

  it.each(["client-app", "flagship_experience", "client.v2", "app123"])(
    "accepts legitimate name %s",
    (name) => expect(isSafeProjectName(name)).toBe(true),
  );

  it.each(["../secret", "nested/../../secret", "nested\\..\\..\\secret", "/secret"])(
    "rejects traversal before touching the filesystem: %s",
    async (file) => {
      const root = path.join(directory(), "project");
      const secret = path.join(directory(), "secret");
      await atomicWrite(secret, "original");
      await expect(writeFiles(root, { [file]: "attacker" }, true)).rejects.toThrow(/Unsafe/);
      expect(await fs.readFile(secret, "utf8")).toBe("original");
      await expect(fs.stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("does not overwrite existing files without explicit overwrite", async () => {
    await atomicWrite(path.join(directory(), "config.json"), "original");
    expect(await writeFiles(directory(), { "config.json": "attacker" })).toEqual([]);
    expect(await fs.readFile(path.join(directory(), "config.json"), "utf8")).toBe("original");
  });

  it("concurrent atomic writes leave one complete payload and no temporary files", async () => {
    const payloads = Array.from({ length: 16 }, (_, i) => `${i}:`.repeat(8192));
    const target = path.join(directory(), "state.json");
    await Promise.all(payloads.map((payload) => atomicWrite(target, payload)));
    expect(payloads).toContain(await fs.readFile(target, "utf8"));
    expect(await fs.readdir(directory())).toEqual(["state.json"]);
  });

  it("cleans temporary files after a failed rename", async () => {
    const target = path.join(directory(), "occupied");
    await fs.mkdir(target);
    await atomicWrite(path.join(target, "sentinel"), "original");
    await expect(atomicWrite(target, "replacement")).rejects.toThrow();
    expect(await fs.readdir(directory())).toEqual(["occupied"]);
    expect(await fs.readFile(path.join(target, "sentinel"), "utf8")).toBe("original");
  });

  it.skipIf(process.platform === "win32")(
    "preserves explicit secret file permissions",
    async () => {
      const target = path.join(directory(), "secret");
      await atomicWrite(target, "secret", { mode: 0o600 });
      expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === "win32")(
    "atomic replacement does not follow a leaf symlink",
    async () => {
      const secret = path.join(directory(), "secret");
      const link = path.join(directory(), "link");
      await atomicWrite(secret, "original");
      await fs.symlink(secret, link);
      await atomicWrite(link, "replacement");
      expect(await fs.readFile(secret, "utf8")).toBe("original");
      expect((await fs.lstat(link)).isSymbolicLink()).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects writes through a parent symlink outside the project",
    async () => {
      const root = path.join(directory(), "project");
      const outside = path.join(directory(), "outside");
      await fs.mkdir(root);
      await fs.mkdir(outside);
      await atomicWrite(path.join(outside, "secret"), "original");
      await fs.symlink(outside, path.join(root, "linked"));
      await expect(writeFiles(root, { "linked/secret": "attacker" }, true)).rejects.toThrow();
      expect(await fs.readFile(path.join(outside, "secret"), "utf8")).toBe("original");
    },
  );
});
