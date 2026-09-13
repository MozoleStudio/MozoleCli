import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
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
        await rm(targetPath, { force: true }).catch(() => {});
        await rename(tempFile, targetPath);
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

export async function findPrototypeRoot(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const configPath = path.join(current, "mozole.config.json");
    if (await exists(configPath)) {
      return current;
    }
    const manifestPath = path.join(current, "package.json");
    if (await exists(manifestPath)) {
      try {
        const pkg = JSON.parse(await readFile(manifestPath, "utf8"));
        if (pkg.mozolePrototype === true || pkg["mozole-prototype"] === true) {
          return current;
        }
      } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export async function findProjectRoot(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const configPath = path.join(current, ".mozole", "project.json");
    const agentsPath = path.join(current, "AGENTS.md");
    if ((await exists(configPath)) || (await exists(agentsPath))) {
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
