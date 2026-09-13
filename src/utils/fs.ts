import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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

  const tempFile = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempFile, content, {
      encoding: typeof content === "string" ? "utf8" : undefined,
      mode: options.mode,
    });
    await rename(tempFile, targetPath);
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
  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe relative path specified: ${relativePath}`);
    }
    const fullPath = path.join(rootDir, ...relativePath.split("/"));
    if (!overwrite && (await exists(fullPath))) {
      continue;
    }
    await atomicWrite(fullPath, content);
    written.push(relativePath);
  }
  return written;
}

export function isSafeProjectName(name: string): boolean {
  if (!name || name === "." || name.includes("/") || name.includes("\\")) {
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
