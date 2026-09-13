import path from "node:path";
import { describe, expect, it } from "vitest";
import { isCliEntrypoint } from "../../src/cli.js";

describe("isCliEntrypoint - Cross-Platform CLI Entrypoint Resolution", () => {
  const currentModuleUrl = import.meta.url;

  it("detects Windows global npm shim (mozole.cmd)", () => {
    const windowsCmd = "C:\\Users\\alper\\AppData\\Roaming\\npm\\mozole.cmd";
    expect(isCliEntrypoint(windowsCmd, currentModuleUrl)).toBe(true);
  });

  it("detects Windows PowerShell shim (mozole.ps1)", () => {
    const windowsPs1 = "C:\\Users\\alper\\AppData\\Roaming\\npm\\mozole.ps1";
    expect(isCliEntrypoint(windowsPs1, currentModuleUrl)).toBe(true);
  });

  it("detects Windows dist/cli.js target with backslashes", () => {
    const windowsDist =
      "C:\\Users\\alper\\AppData\\Roaming\\npm\\node_modules\\@mozole\\cli\\dist\\cli.js";
    expect(isCliEntrypoint(windowsDist, currentModuleUrl)).toBe(true);
  });

  it("detects Windows local dev source (src\\cli.ts)", () => {
    const windowsDev = "D:\\Projects\\MozoleCli\\src\\cli.ts";
    expect(isCliEntrypoint(windowsDev, currentModuleUrl)).toBe(true);
  });

  it("detects Windows npx temporary cache path", () => {
    const npxCache =
      "C:\\Users\\alper\\AppData\\Local\\npm-cache\\_npx\\998877\\node_modules\\@mozole\\cli\\dist\\cli.js";
    expect(isCliEntrypoint(npxCache, currentModuleUrl)).toBe(true);
  });

  it("detects Linux / POSIX binary path (/usr/local/bin/mozole)", () => {
    expect(isCliEntrypoint("/usr/local/bin/mozole", currentModuleUrl)).toBe(true);
  });

  it("detects Linux node_modules path", () => {
    expect(
      isCliEntrypoint("/usr/local/lib/node_modules/@mozole/cli/dist/cli.js", currentModuleUrl),
    ).toBe(true);
  });

  it("detects bare command name mozole", () => {
    expect(isCliEntrypoint("mozole", currentModuleUrl)).toBe(true);
    expect(isCliEntrypoint("mozole.cmd", currentModuleUrl)).toBe(true);
    expect(isCliEntrypoint("mozole.exe", currentModuleUrl)).toBe(true);
  });

  it("matches when argv[1] path resolves to the current module path", () => {
    const resolvedPath = path.resolve(new URL(currentModuleUrl).pathname);
    expect(isCliEntrypoint(resolvedPath, currentModuleUrl)).toBe(true);
  });

  it("returns false for test runners and third-party modules", () => {
    expect(
      isCliEntrypoint("/home/alper/Dev/MozoleCli/node_modules/vitest/vitest.mjs", currentModuleUrl),
    ).toBe(false);
    expect(
      isCliEntrypoint(
        "C:\\Users\\alper\\AppData\\Roaming\\npm\\node_modules\\vite\\bin\\vite.js",
        currentModuleUrl,
      ),
    ).toBe(false);
    expect(isCliEntrypoint("", currentModuleUrl)).toBe(false);
    expect(isCliEntrypoint(undefined as unknown as string, currentModuleUrl)).toBe(false);
  });
});
