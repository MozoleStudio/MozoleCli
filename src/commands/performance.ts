import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectBuild, normalizeBase, selectBuild } from "../performance/index.js";
import { type PerformanceReport, parseBaseline, parseConfig } from "../performance/model.js";
import { atomicWrite, exists } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { projectPath } from "../utils/project-files.js";

export interface PerformanceOptions {
  cwd?: string;
  from?: string;
  base?: string;
  config?: string;
  baseline?: string;
  saveBaseline?: string;
  output?: string;
  build?: boolean;
  json?: boolean;
  log?: (message: string) => void;
}

async function validateDestination(root: string, destination: string): Promise<void> {
  await projectPath(root, path.relative(root, destination));
  let current = destination;
  while (current !== root) {
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (info?.isSymbolicLink()) throw new Error("Report paths must not contain symlinks.");
    current = path.dirname(current);
  }
}

export async function auditPerformance(
  options: PerformanceOptions = {},
): Promise<PerformanceReport> {
  const root = await realpath(path.resolve(options.cwd ?? process.cwd()));
  const base = normalizeBase(options.base);
  const configPath = await projectPath(root, options.config ?? "performance.config.json");
  const config = parseConfig(
    options.config || (await exists(configPath))
      ? JSON.parse(await readFile(configPath, "utf8"))
      : {},
  );
  const baselinePath = options.baseline ? await projectPath(root, options.baseline) : undefined;
  const baseline = baselinePath
    ? parseBaseline(JSON.parse(await readFile(baselinePath, "utf8")), base)
    : undefined;
  const destinations = new Map<string, "report" | "baseline">();
  const originalReports = new Map<string, string | null>();
  for (const [relative, type] of [
    [options.output, "report"],
    [options.saveBaseline, "baseline"],
  ] as const) {
    if (!relative) continue;
    const destination = await projectPath(root, relative);
    if (
      !destination.endsWith(".json") ||
      destination === configPath ||
      destination === baselinePath ||
      destinations.has(destination)
    )
      throw new Error("Use distinct JSON paths for report, config and baseline.");
    await validateDestination(root, destination);
    const original = await readFile(destination, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    originalReports.set(destination, original);
    if (original !== null) {
      if (type === "baseline")
        throw new Error("Baseline already exists; choose a new snapshot path.");
      const previous = JSON.parse(original);
      if (previous?.kind !== "mozole-performance" || previous.schemaVersion !== 1)
        throw new Error("Refusing to overwrite an unrelated JSON file.");
    }
    destinations.set(destination, type);
  }
  if (options.build) {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (typeof pkg.scripts?.build !== "string") throw new Error("No build script found.");
    const result = await run("npm", ["run", "build"], { cwd: root, timeoutMs: 300_000 });
    if (result.exitCode !== 0) throw new Error(`Build failed:\n${result.stdout}\n${result.stderr}`);
  }
  const source = await selectBuild(root, options.from);
  for (const destination of destinations.keys()) {
    if (
      destination.startsWith(source + path.sep) ||
      source.startsWith(destination + path.sep) ||
      source === destination
    )
      throw new Error("Reports and baselines must be outside the build output.");
  }
  const report = await inspectBuild({ root, source, base, config, baseline, built: options.build });
  for (const [destination, type] of destinations) {
    if (type === "baseline" && report.findings.some((finding) => finding.severity === "error"))
      continue;
    await validateDestination(root, destination);
    const current = await readFile(destination, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (current !== originalReports.get(destination))
      throw new Error("Report changed during analysis.");
    await atomicWrite(destination, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export function formatPerformance(report: PerformanceReport): string[] {
  const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
  const errors = report.findings.filter((finding) => finding.severity === "error").length;
  const warnings = report.findings.length - errors;
  return [
    `Performance: ${report.routes.length} routes, ${report.assets.length} assets, ${errors} errors, ${warnings} warnings.`,
    `Build: ${kib(report.totals.raw)} raw; ${kib(report.totals.gzip)} gzip; ${kib(report.totals.brotli)} Brotli (estimated).`,
    ...report.routes.map(
      (route) =>
        `${route.route} | JS ${kib(route.js.gzip)} | CSS ${kib(route.css.gzip)} | HTML ${kib(route.html.gzip)} gzip | ${route.deferred.length} deferred modules`,
    ),
    ...report.findings.map(
      (finding) =>
        `${finding.severity.toUpperCase()} ${finding.target} [${finding.rule}] ${finding.message}`,
    ),
    ...(report.excluded.length ? [`Excluded: ${report.excluded.join(", ")}`] : []),
    "Static size audit only; runtime loading, third-party transfers and Core Web Vitals are not measured.",
  ];
}

export async function performanceCommand(options: PerformanceOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  try {
    const report = await auditPerformance(options);
    if (options.json) log(JSON.stringify(report, null, 2));
    else for (const message of formatPerformance(report)) log(message);
    const failed = report.findings.some((finding) => finding.severity === "error");
    if (failed && options.saveBaseline && !options.json)
      log("Baseline not saved because the audit contains errors.");
    return failed ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json)
      log(JSON.stringify({ kind: "mozole-performance", schemaVersion: 1, error: message }));
    else log(`Performance error: ${message}`);
    return 2;
  }
}
