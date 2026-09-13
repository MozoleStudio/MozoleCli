import { readFile } from "node:fs/promises";
import path from "node:path";
import { COMPONENTS } from "../scaffold/components.js";
import { scaffoldToolsGuide } from "../scaffold/tools-guide.js";
import { atomicWrite, exists, findPrototypeRoot, writeFiles } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { projectDirectory, projectPath } from "../utils/project-files.js";

export async function addComponents(
  options: {
    components?: string;
    cwd?: string;
    list?: boolean;
    log?: (message: string) => void;
  } = {},
): Promise<string[]> {
  const log = options.log ?? console.log;
  if (options.list) {
    for (const [name, entry] of Object.entries(COMPONENTS))
      log(`${name.padEnd(18)} ${entry.description}`);
    return Object.keys(COMPONENTS);
  }
  const names = [
    ...new Set(
      (options.components ?? "")
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    ),
  ];
  const selected = names.includes("all") ? Object.keys(COMPONENTS) : names;
  if (!selected.length)
    throw new Error("Choose a component, comma-separated names, or all. Use mozole add --list.");
  for (const name of names)
    if (name !== "all" && !Object.hasOwn(COMPONENTS, name))
      throw new Error(`Unknown component: ${name}. Use mozole add --list.`);
  const root = await projectDirectory(options.cwd);
  for (const file of [
    "package.json",
    "src/components/ui/index.ts",
    "src/library/index.ts",
    ".mozole/components.json",
  ])
    await projectPath(root, file);
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const written: string[] = [];
  const skipped: string[] = [];
  const registrationPath = path.join(root, ".mozole/components.json");
  const registry = (await exists(registrationPath))
    ? JSON.parse(await readFile(registrationPath, "utf8"))
    : {};
  const uiPath = path.join(root, "src/components/ui/index.ts");
  let barrel = (await exists(uiPath)) ? await readFile(uiPath, "utf8") : "";
  for (const name of selected) {
    const entry = COMPONENTS[name];
    const file = `src/components/ui/${entry.file}.tsx`;
    await projectPath(root, file);
    if (await exists(path.join(root, file))) {
      skipped.push(name);
      continue;
    }
    written.push(...(await writeFiles(root, { [file]: entry.source })));
    for (const [dependency, version] of Object.entries(entry.dependencies)) {
      if (!pkg.dependencies?.[dependency] && !pkg.devDependencies?.[dependency]) {
        pkg.dependencies = { ...pkg.dependencies, [dependency]: version };
      }
    }
    const exportLine = `export * from "./${entry.file}";`;
    if (!barrel.includes(exportLine)) barrel += `\n${exportLine}\n`;
    registry[name] = { file, ownership: "project", description: entry.description };
  }
  if (written.length) {
    await scaffoldToolsGuide(root);
    await atomicWrite(pkgPath, JSON.stringify(pkg, null, 2));
    await atomicWrite(uiPath, barrel);
    const library = path.join(root, "src/library/index.ts");
    const content = (await exists(library)) ? await readFile(library, "utf8") : "";
    if (!/from\s+["']\.\.\/components\/ui["']/.test(content))
      await atomicWrite(library, `${content}\nexport * from "../components/ui";\n`);
    await atomicWrite(registrationPath, JSON.stringify(registry, null, 2));
    try {
      await run("npx", ["@biomejs/biome", "format", "--write", "src/components/ui"], {
        cwd: root,
      });
    } catch {
      // Non-fatal if biome is not yet available in the environment
    }
  }
  log(
    `Added ${written.length} component files. Preserved existing: ${skipped.join(", ") || "none"}.`,
  );
  if (written.length)
    log(
      `Run npm install in ${(await findPrototypeRoot(root)) ?? root}. No dependencies were installed by this command.`,
    );
  return written;
}
