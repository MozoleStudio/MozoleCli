import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import pc from "picocolors";
import { exists } from "./fs.js";
import { run } from "./process.js";

export interface BrowserInfo {
  executablePath?: string;
  name: string;
  type: "system" | "playwright";
  version?: string;
}

const LINUX_CANDIDATES = [
  "/usr/bin/brave",
  "/usr/bin/brave-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/brave",
  "/snap/bin/chromium",
];

const DARWIN_CANDIDATES = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

function getWin32Candidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  const list = [
    path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  if (localAppData) {
    list.push(
      path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  }

  return list;
}

async function getWin32RegistryPaths(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const browserExeNames = ["chrome.exe", "msedge.exe", "brave.exe", "chromium.exe"];
  const paths: string[] = [];
  for (const exe of browserExeNames) {
    for (const hive of ["HKLM", "HKCU"]) {
      try {
        const res = await run(
          "reg.exe",
          [
            "query",
            `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`,
            "/ve",
          ],
          { timeoutMs: 1500 },
        );
        if (res.exitCode === 0 && res.stdout) {
          const match = res.stdout.match(/REG_SZ\s+(.+)$/m);
          if (match?.[1]) {
            const trimmed = match[1].trim().replace(/^"|"$/g, "");
            if (trimmed) paths.push(trimmed);
          }
        }
      } catch {}
    }
  }
  return paths;
}

export async function findLocalChromium(): Promise<BrowserInfo | null> {
  const envCandidates = [
    process.env.BRAVE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].filter(Boolean) as string[];

  const platformCandidates =
    process.platform === "darwin"
      ? DARWIN_CANDIDATES
      : process.platform === "win32"
        ? [...getWin32Candidates(), ...(await getWin32RegistryPaths())]
        : LINUX_CANDIDATES;

  const candidates = [...envCandidates, ...platformCandidates];

  for (const bin of candidates) {
    if (await exists(bin)) {
      try {
        await fs.access(bin, fs.constants.X_OK);
      } catch {
        // Not executable, skip
        continue;
      }

      let version: string | undefined;
      try {
        const res = await run(bin, ["--version"], { timeoutMs: 3000 });
        if (res.exitCode === 0 && res.stdout) {
          version = res.stdout.trim();
        }
      } catch {}

      if (!version && process.platform === "win32") {
        try {
          const ps = await run(
            "powershell.exe",
            [
              "-NoProfile",
              "-Command",
              `(Get-ItemProperty '${bin.replace(/'/g, "''")}').VersionInfo.ProductVersion`,
            ],
            { timeoutMs: 2000 },
          );
          if (ps.exitCode === 0 && ps.stdout.trim()) {
            version = ps.stdout.trim();
          }
        } catch {}
      }

      const base = path.basename(bin).toLowerCase();
      let name = "Chromium";
      if (base.includes("brave")) name = "Brave Browser";
      else if (base.includes("chrome")) name = "Google Chrome";
      else if (base.includes("edge")) name = "Microsoft Edge";

      return {
        executablePath: bin,
        name,
        type: "system",
        version,
      };
    }
  }

  return null;
}

export async function ensureChromiumBrowser(): Promise<BrowserInfo> {
  const local = await findLocalChromium();
  if (local) {
    return local;
  }

  console.log(
    pc.yellow("  ! No system Brave or Chromium found. Auto-provisioning Playwright Chromium..."),
  );

  // Per policy: test coverage takes precedence over disk space. Install playwright chromium
  const require = createRequire(import.meta.url);
  let playwrightCli: string | null = null;
  try {
    playwrightCli = require.resolve("playwright-core/cli.js");
  } catch {
    const candidate = path.resolve("node_modules/playwright-core/cli.js");
    if (await exists(candidate)) playwrightCli = candidate;
  }

  let installRes: Awaited<ReturnType<typeof run>> | null = null;
  if (playwrightCli && (await exists(playwrightCli))) {
    installRes = await run(process.execPath, [playwrightCli, "install", "chromium"], {
      timeoutMs: 120000,
    });
  }

  if (!installRes || installRes.exitCode !== 0) {
    // Fallback: try npx
    installRes = await run("npx", ["playwright-core", "install", "chromium"], {
      timeoutMs: 120000,
    });
  }

  if (installRes.exitCode !== 0) {
    throw new Error(
      `Failed to auto-provision Playwright Chromium.\n${installRes.stderr || installRes.stdout}`,
    );
  }

  console.log(pc.green("  ✓ Playwright Chromium successfully provisioned."));
  return {
    executablePath: undefined,
    name: "Playwright Chromium",
    type: "playwright",
  };
}

export function getBrowserLaunchArgs(): string[] {
  return [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-brave-extension",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--disable-gpu",
    "--mute-audio",
  ];
}
