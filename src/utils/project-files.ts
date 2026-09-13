import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { findProjectRoot } from "./fs.js";

export async function projectDirectory(cwd?: string): Promise<string> {
  const root = await realpath(
    cwd ? path.resolve(cwd) : ((await findProjectRoot()) ?? process.cwd()),
  );
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (!pkg.dependencies?.react && !pkg.devDependencies?.react)
    throw new Error("Select a React project directory.");
  if (pkg.mozolePrototype) throw new Error("Select a customer project, not the prototype root.");
  return root;
}

export async function projectPath(root: string, relative: string): Promise<string> {
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith(`..${path.sep}`) || rel === ".." || path.isAbsolute(rel)) {
    throw new Error(`Path must be inside the project: ${relative}`);
  }
  let current = root;
  for (const segment of rel.split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Symlinks are not supported: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}

export async function regularFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in input: ${rel}`);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) files.push(rel);
    }
  }
  await walk(root);
  return files.sort();
}
