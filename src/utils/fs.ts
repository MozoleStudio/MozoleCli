import { randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const s = await stat(targetPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function atomicWrite(
  targetPath: string,
  content: string | Buffer,
  options: { mode?: number } = {},
): Promise<void> {
  const dir = path.dirname(targetPath);
  await ensureDir(dir);

  const tempFile = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempFile, content, {
      encoding: typeof content === "string" ? "utf8" : undefined,
      mode: options.mode,
    });
    try {
      await rename(tempFile, targetPath);
    } catch (renameErr) {
      const code = (renameErr as NodeJS.ErrnoException).code;
      if (
        process.platform === "win32" &&
        (code === "EPERM" || code === "EBUSY" || code === "EEXIST")
      ) {
        const targetStat = await stat(targetPath).catch(() => null);
        if (targetStat?.isDirectory()) {
          throw renameErr;
        }

        let renamed = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            await rm(targetPath, { force: true }).catch(() => {});
            await rename(tempFile, targetPath);
            renamed = true;
            break;
          } catch (retryErr) {
            const retryCode = (retryErr as NodeJS.ErrnoException).code;
            if (retryCode !== "EPERM" && retryCode !== "EBUSY" && retryCode !== "EEXIST") {
              throw retryErr;
            }
            const delay = Math.floor(Math.random() * 20) + 10 * (attempt + 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
        if (!renamed) {
          try {
            await copyFile(tempFile, targetPath);
            await rm(tempFile, { force: true }).catch(() => {});
          } catch {
            throw renameErr;
          }
        }
      } else {
        throw renameErr;
      }
    }
  } catch (error) {
    await rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeFiles(
  rootDir: string,
  files: Record<string, string | Buffer>,
  overwrite = false,
): Promise<string[]> {
  const resolvedRootDir = await realpath(rootDir).catch(() => path.resolve(rootDir));
  const resolvedRootPrefix = resolvedRootDir.endsWith(path.sep)
    ? resolvedRootDir
    : resolvedRootDir + path.sep;

  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe relative path specified: ${relativePath}`);
    }

    const segments = relativePath.split(/[\\/]/);
    let current = path.resolve(rootDir);
    for (let i = 0; i < segments.length - 1; i++) {
      current = path.join(current, segments[i]);
      try {
        const real = await realpath(current);
        if (real !== resolvedRootDir && !real.startsWith(resolvedRootPrefix)) {
          throw new Error(`Unsafe relative path specified (symlink escape): ${relativePath}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          break;
        }
        throw error;
      }
    }

    const fullPath = path.join(rootDir, ...segments);
    if (!overwrite && (await exists(fullPath))) {
      continue;
    }
    await atomicWrite(fullPath, content);
    written.push(relativePath);
  }
  return written;
}

const RESERVED_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "public",
  "src",
  "package.json",
  "package-lock.json",
  "favicon.ico",
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function isSafeProjectName(name: string): boolean {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    return false;
  }
  const normalized = name.toLowerCase().trim();
  const baseWithoutExt = normalized.split(".")[0];
  if (RESERVED_NAMES.has(normalized) || RESERVED_NAMES.has(baseWithoutExt)) {
    return false;
  }
  return /^[a-z0-9][a-z0-9._-]*$/i.test(name);
}

export async function isPrototypeRoot(dir: string): Promise<boolean> {
  const configPath = path.join(dir, "mozole.config.json");
  if (await exists(configPath)) {
    try {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      if (!config.projectsDir || config.projectsDir === "projects") return true;
    } catch {
      return true;
    }
  }
  const manifestPath = path.join(dir, "package.json");
  if (await exists(manifestPath)) {
    try {
      const pkg = JSON.parse(await readFile(manifestPath, "utf8"));
      if (
        pkg.mozolePrototype === true ||
        pkg["mozole-prototype"] === true ||
        Array.isArray(pkg.workspaces) ||
        Boolean(pkg.workspaces?.packages)
      ) {
        return true;
      }
    } catch {}
  }
  const projectsPath = path.join(dir, "projects");
  if ((await exists(projectsPath)) && (await isDirectory(projectsPath))) {
    return true;
  }
  return false;
}

export async function findPrototypeRoot(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    if (await isPrototypeRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export interface DiscoveredProject {
  name: string;
  path: string;
  relative: string;
}

export async function discoverWorkspaceProjects(
  workspaceRoot: string,
): Promise<DiscoveredProject[]> {
  const root = path.resolve(workspaceRoot);
  const projects = new Map<string, DiscoveredProject>();

  // 1. Check package.json workspaces if present
  const manifestPath = path.join(root, "package.json");
  if (await exists(manifestPath)) {
    try {
      const pkg = JSON.parse(await readFile(manifestPath, "utf8"));
      const ws = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : Array.isArray(pkg.workspaces?.packages)
          ? pkg.workspaces.packages
          : [];

      await Promise.all(
        ws.map(async (pattern: unknown) => {
          if (typeof pattern !== "string") return;
          if (pattern.includes("*")) {
            const base = pattern.replace(/\/\*.*$/, "");
            const baseDir = path.join(root, base);
            if (await exists(baseDir)) {
              const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  const sub = path.join(baseDir, entry.name);
                  const rel = path.relative(root, sub).split(path.sep).join("/");
                  projects.set(rel, { name: rel, path: sub, relative: rel });
                }
              }
            }
          } else {
            const target = path.join(root, pattern);
            if ((await exists(target)) && (await isDirectory(target))) {
              const rel = path.relative(root, target).split(path.sep).join("/");
              projects.set(rel, { name: rel, path: target, relative: rel });
            }
          }
        }),
      );
    } catch {}
  }

  // 2. Check projects/ directory
  const projectsDir = path.join(root, "projects");
  if (await exists(projectsDir)) {
    const entries = await readdir(projectsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = path.join(projectsDir, entry.name);
        const rel = path.relative(root, sub).split(path.sep).join("/");
        projects.set(entry.name, { name: entry.name, path: sub, relative: rel });
      }
    }
  }

  // 3. Fallback: scan 1-2 levels deep for folders with package.json or AGENTS.md
  if (projects.size === 0) {
    const ignored = new Set([
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      "archive",
      "reports",
      "screenshots",
      "tests",
      "scripts",
      "docs",
      "elements",
    ]);

    const topEntries = await readdir(root, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      topEntries.map(async (top) => {
        if (!top.isDirectory() || ignored.has(top.name) || top.name.startsWith(".")) return;
        const topPath = path.join(root, top.name);
        const [pkgExists, agentsExists] = await Promise.all([
          exists(path.join(topPath, "package.json")),
          exists(path.join(topPath, "AGENTS.md")),
        ]);
        if (pkgExists || agentsExists) {
          const rel = top.name;
          projects.set(rel, { name: rel, path: topPath, relative: rel });
          return;
        }

        const subEntries = await readdir(topPath, { withFileTypes: true }).catch(() => []);
        await Promise.all(
          subEntries.map(async (sub) => {
            if (!sub.isDirectory() || ignored.has(sub.name) || sub.name.startsWith(".")) return;
            const subPath = path.join(topPath, sub.name);
            const [subPkgExists, subAgentsExists] = await Promise.all([
              exists(path.join(subPath, "package.json")),
              exists(path.join(subPath, "AGENTS.md")),
            ]);
            if (subPkgExists || subAgentsExists) {
              const rel = `${top.name}/${sub.name}`;
              projects.set(rel, { name: rel, path: subPath, relative: rel });
            }
          }),
        );
      }),
    );
  }

  return Array.from(projects.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findProjectRoot(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const configPath = path.join(current, ".mozole", "project.json");
    if (await exists(configPath)) {
      return current;
    }
    const agentsPath = path.join(current, "AGENTS.md");
    if (await exists(agentsPath)) {
      if (!(await isPrototypeRoot(current))) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export async function findNodeModulesFile(
  startDir: string,
  relativeSubpath: string,
): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, "node_modules", relativeSubpath);
    if (await exists(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}
