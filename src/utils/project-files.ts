import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { findProjectRoot } from "./fs.js";

export async function projectDirectory(cwd?: string): Promise<string> {
  const resolved = cwd ? path.resolve(cwd) : ((await findProjectRoot()) ?? process.cwd());
  const root = await realpath(resolved).catch(() => resolved);
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (!pkg.dependencies?.react && !pkg.devDependencies?.react)
    throw new Error("Select a React project directory.");
  if (pkg.mozolePrototype) throw new Error("Select a customer project, not the prototype root.");
  return root;
}

export async function projectPath(root: string, relative: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);

  const isWindows = process.platform === "win32";
  const normRoot = isWindows ? resolvedRoot.toLowerCase() : resolvedRoot;
  const normTarget = isWindows ? target.toLowerCase() : target;
  const normRootPrefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;

  const isInside = normTarget === normRoot || normTarget.startsWith(normRootPrefix);
  const rel = path.relative(resolvedRoot, target);
  if (
    !isInside ||
    !rel ||
    rel.startsWith(`..${path.sep}`) ||
    rel === ".." ||
    path.isAbsolute(rel)
  ) {
    throw new Error(`Path must be inside the project: ${relative}`);
  }

  const resolvedRealRoot = await realpath(resolvedRoot).catch(() => resolvedRoot);
  const normRealRoot = isWindows ? resolvedRealRoot.toLowerCase() : resolvedRealRoot;
  const normRealRootPrefix = normRealRoot.endsWith(path.sep)
    ? normRealRoot
    : normRealRoot + path.sep;

  let current = resolvedRoot;
  for (const segment of rel.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink()) {
        const real = await realpath(current).catch(() => null);
        const normReal = isWindows ? real?.toLowerCase() : real;
        if (!normReal || (normReal !== normRealRoot && !normReal.startsWith(normRealRootPrefix))) {
          throw new Error(`Symlinks are not supported: ${current}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}

export async function regularFiles(root: string): Promise<string[]> {
  const resolvedRoot = path.resolve(root);
  const resolvedRealRoot = await realpath(resolvedRoot).catch(() => resolvedRoot);
  const isWindows = process.platform === "win32";
  const normRealRoot = isWindows ? resolvedRealRoot.toLowerCase() : resolvedRealRoot;
  const normRealRootPrefix = normRealRoot.endsWith(path.sep)
    ? normRealRoot
    : normRealRoot + path.sep;

  const files: string[] = [];
  async function walk(dir: string, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const real = await realpath(full).catch(() => null);
        const normReal = isWindows ? real?.toLowerCase() : real;
        if (!normReal || (normReal !== normRealRoot && !normReal.startsWith(normRealRootPrefix))) {
          throw new Error(`Symlink not allowed in input: ${rel}`);
        }
      }
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) files.push(rel);
    }
  }
  await walk(resolvedRoot);
  return files.sort();
}
