import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { constants, brotliCompress, gzip } from "node:zlib";
import { exists } from "../utils/fs.js";
import { projectPath } from "../utils/project-files.js";
import {
  cssImports,
  documentResources,
  localReference,
  moduleDependencies,
  routeUrl,
} from "./graph.js";
import {
  type AssetKind,
  type Baseline,
  type PerformanceConfig,
  type PerformanceReport,
  type Sizes,
  evaluate,
} from "./model.js";

const compressGzip = promisify(gzip);
const compressBrotli = promisify(brotliCompress);
const zero = (): Sizes => ({ raw: 0, gzip: 0, brotli: 0 });
function add(target: Sizes, value: Sizes) {
  for (const key of ["raw", "gzip", "brotli"] as const) target[key] += value[key];
}
export async function measure(content: Buffer | string): Promise<Sizes> {
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  const [gz, br] = await Promise.all([
    compressGzip(bytes, { level: 9 }),
    compressBrotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
  ]);
  return { raw: bytes.length, gzip: gz.length, brotli: br.length };
}
function kind(file: string): AssetKind {
  if (/\.(?:m?js|cjs)$/i.test(file)) return "js";
  if (/\.css$/i.test(file)) return "css";
  if (/\.html?$/i.test(file)) return "html";
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(file)) return "font";
  if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|mp3|wav|ogg|mov)$/i.test(file)) return "media";
  return "other";
}

export async function selectBuild(root: string, from?: string): Promise<string> {
  if (from) return projectPath(root, from);
  const candidates: string[] = [];
  for (const candidate of ["build/client", "dist"]) {
    if (await exists(path.join(root, candidate))) candidates.push(candidate);
  }
  if (candidates.length !== 1)
    throw new Error("Select a build directory with --from (expected dist or build/client).");
  return projectPath(root, candidates[0]);
}
export function normalizeBase(base = "/"): string {
  if (
    !base.startsWith("/") ||
    base.startsWith("//") ||
    /[\\?#%\s]/.test(base) ||
    base.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("Base must be a URL path such as / or /client/.");
  return base.endsWith("/") ? base : `${base}/`;
}

export async function inspectBuild(options: {
  root: string;
  source: string;
  base: string;
  config: PerformanceConfig;
  baseline?: Baseline;
  built?: boolean;
}): Promise<PerformanceReport> {
  const { root, source, base, config } = options;
  const report: PerformanceReport = {
    kind: "mozole-performance",
    schemaVersion: 1,
    measurement: "static-transfer-v1",
    source: path.relative(root, source).split(path.sep).join("/"),
    base,
    built: options.built ?? false,
    config,
    assets: [],
    routes: [],
    totals: zero(),
    excluded: [],
    findings: [],
  };
  if ((await realpath(source)) !== source)
    throw new Error("Symlink build directories are not supported.");
  const inventory: string[] = [];
  let bytesRead = 0;
  async function walk(dir: string, prefix = "", depth = 0) {
    if (depth > 64) throw new Error("Build exceeds the 64-level directory depth limit.");
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const file = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlink in build output: ${file}`);
      if (entry.name.includes("\\")) throw new Error("Unsupported build filename.");
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), `${file}/`, depth + 1);
      else if (entry.isFile()) inventory.push(file);
      else throw new Error(`Non-regular build file: ${file}`);
      if (inventory.length > 20000) throw new Error("Build exceeds the 20,000 file limit.");
    }
  }
  await walk(source);
  const contents = new Map<string, string>();
  const assets = new Map<string, PerformanceReport["assets"][number]>();
  for (const file of inventory.sort()) {
    if (/\.(?:map|gz|br)$/i.test(file) || file.split("/").some((part) => part.startsWith("."))) {
      report.excluded.push(file);
      continue;
    }
    const full = path.join(source, file);
    const stat = await lstat(full);
    if (!stat.isFile() || (await realpath(full)) !== full)
      throw new Error(`Build path changed: ${file}`);
    if (stat.size > 32 * 1024 * 1024) throw new Error(`Asset exceeds the 32 MiB limit: ${file}`);
    bytesRead += stat.size;
    if (bytesRead > 512 * 1024 * 1024)
      throw new Error("Build exceeds the 512 MiB measurement limit.");
    const bytes = await readFile(full);
    const type = kind(file);
    const asset = { file, kind: type, ...(await measure(bytes)) };
    report.assets.push(asset);
    assets.set(file, asset);
    add(report.totals, asset);
    if (["js", "css", "html"].includes(type))
      contents.set(file, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  const html = report.assets.filter((asset) => asset.kind === "html");
  if (!html.length)
    throw new Error("No built HTML found. Build the site or select its static output with --from.");
  const moduleCache = new Map<string, Awaited<ReturnType<typeof moduleDependencies>>>();
  const cssCache = new Map<string, string[]>();
  for (const page of html) {
    const route = routeUrl(page.file, base);
    const url = `https://mozole.invalid${route}`;
    const document = documentResources(contents.get(page.file) as string, url, report.findings);
    const js = zero();
    const css = zero();
    const visited = new Set<string>();
    const deferred = new Set<string>();
    const resolve = (reference: string, importer: string, module: boolean): string | undefined => {
      const resolved = localReference(reference, importer, base, module);
      if (resolved.reason)
        report.findings.push({
          target: route,
          rule: resolved.reason,
          severity: "warning",
          message: `${reference}: transfer size is not measured.`,
        });
      else if (!assets.has(resolved.file as string))
        report.findings.push({
          target: route,
          rule: "missing-resource",
          severity: "error",
          message: `Missing local resource: ${resolved.file}`,
        });
      else return resolved.file;
    };
    const dependencies = async (text: string, importer: string, key?: string) => {
      let deps = key ? moduleCache.get(key) : undefined;
      if (!deps) {
        deps = await moduleDependencies(text);
        if (key) moduleCache.set(key, deps);
      }
      for (const reference of deps.static) {
        const file = resolve(reference, importer, true);
        if (file) await visit(file);
      }
      for (const reference of deps.dynamic) {
        const file = resolve(reference, importer, true);
        if (file) deferred.add(file);
      }
      if (deps.unresolvedDynamic)
        report.findings.push({
          target: route,
          rule: "computed-import",
          severity: "warning",
          message: "Computed dynamic import targets cannot be resolved statically.",
        });
    };
    const styles = async (text: string, importer: string, key?: string) => {
      let imports = key ? cssCache.get(key) : undefined;
      if (!imports) {
        imports = cssImports(text);
        if (key) cssCache.set(key, imports);
      }
      for (const reference of imports) {
        const file = resolve(reference, importer, false);
        if (file) await visit(file);
      }
    };
    let activeDepth = 0;
    const visit = async (file: string): Promise<void> => {
      if (visited.has(file)) return;
      if (++activeDepth > 256)
        throw new Error("Resource graph exceeds the 256-level dependency depth limit.");
      visited.add(file);
      const asset = assets.get(file);
      if (!asset) return;
      const importer = `https://mozole.invalid${base}${file.split("/").map(encodeURIComponent).join("/")}`;
      if (asset.kind === "js") {
        add(js, asset);
        await dependencies(contents.get(file) as string, importer, file);
      } else if (asset.kind === "css") {
        add(css, asset);
        await styles(contents.get(file) as string, importer, file);
      } else
        report.findings.push({
          target: route,
          rule: "unsupported-import",
          severity: "error",
          message: `Expected JavaScript or CSS: ${file}`,
        });
      activeDepth--;
    };
    for (const reference of [...document.js, ...document.css]) {
      const file = resolve(reference, document.base, false);
      if (file) await visit(file);
    }
    for (const text of document.inlineJs) {
      add(js, await measure(text));
      await dependencies(text, document.base);
    }
    for (const text of document.inlineCss) {
      add(css, await measure(text));
      await styles(text, document.base);
    }
    report.routes.push({
      route,
      html: { raw: page.raw, gzip: page.gzip, brotli: page.brotli },
      js,
      css,
      resources: [...visited].sort(),
      deferred: [...deferred].filter((file) => !visited.has(file)).sort(),
    });
  }
  evaluate(report, options.baseline);
  report.findings = [
    ...new Map(report.findings.map((finding) => [JSON.stringify(finding), finding])).values(),
  ];
  return report;
}
