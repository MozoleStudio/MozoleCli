export interface Sizes {
  raw: number;
  gzip: number;
  brotli: number;
}
export type AssetKind = "js" | "css" | "html" | "media" | "font" | "other";
export interface AssetMeasurement extends Sizes {
  file: string;
  kind: AssetKind;
}
export interface RouteMeasurement {
  route: string;
  html: Sizes;
  js: Sizes;
  css: Sizes;
  resources: string[];
  deferred: string[];
}
export interface PerformanceConfig {
  budgets: {
    jsGzip: number;
    cssGzip: number;
    htmlGzip: number;
    mediaRaw: number;
    fontRaw: number;
    totalRaw: number;
  };
  regression: { percent: number; bytes: number };
}
export interface PerformanceFinding {
  rule: string;
  target: string;
  severity: "error" | "warning";
  message: string;
  actual?: number;
  limit?: number;
}
export interface PerformanceReport {
  kind: "mozole-performance";
  schemaVersion: 1;
  measurement: "static-transfer-v1";
  base: string;
  source: string;
  built: boolean;
  config: PerformanceConfig;
  assets: AssetMeasurement[];
  routes: RouteMeasurement[];
  totals: Sizes;
  excluded: string[];
  findings: PerformanceFinding[];
}
export const DEFAULT_CONFIG: PerformanceConfig = {
  budgets: {
    jsGzip: 150 * 1024,
    cssGzip: 50 * 1024,
    htmlGzip: 50 * 1024,
    mediaRaw: 512 * 1024,
    fontRaw: 150 * 1024,
    totalRaw: 10 * 1024 * 1024,
  },
  regression: { percent: 10, bytes: 4 * 1024 },
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseConfig(value: unknown): PerformanceConfig {
  if (!object(value) || Object.keys(value).some((key) => !["budgets", "regression"].includes(key)))
    throw new Error("Performance config accepts only budgets and regression objects.");
  const result = structuredClone(DEFAULT_CONFIG);
  for (const section of ["budgets", "regression"] as const) {
    const supplied = value[section];
    if (supplied === undefined) continue;
    if (!object(supplied)) throw new Error(`Invalid ${section} configuration.`);
    for (const [key, amount] of Object.entries(supplied)) {
      if (
        !Object.hasOwn(result[section], key) ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        (key !== "percent" && !Number.isSafeInteger(amount))
      )
        throw new Error(`Invalid performance setting: ${section}.${key}`);
      (result[section] as Record<string, number>)[key] = amount;
    }
  }
  return result;
}

export interface Baseline {
  kind: "mozole-performance";
  schemaVersion: 1;
  measurement: "static-transfer-v1";
  base: string;
  routes: RouteMeasurement[];
  totals: Sizes;
}
export function parseBaseline(value: unknown, base: string): Baseline {
  const validSizes = (item: unknown): item is Sizes =>
    object(item) &&
    ["raw", "gzip", "brotli"].every(
      (key) =>
        typeof item[key] === "number" &&
        Number.isSafeInteger(item[key]) &&
        (item[key] as number) >= 0,
    );
  if (
    !object(value) ||
    value.kind !== "mozole-performance" ||
    value.schemaVersion !== 1 ||
    value.measurement !== "static-transfer-v1" ||
    value.base !== base ||
    !validSizes(value.totals) ||
    !Array.isArray(value.routes) ||
    value.routes.length === 0
  )
    throw new Error("Invalid or incompatible performance baseline.");
  const routes = new Set<string>();
  for (const route of value.routes) {
    if (
      !object(route) ||
      typeof route.route !== "string" ||
      !route.route.startsWith("/") ||
      routes.has(route.route) ||
      !validSizes(route.js) ||
      !validSizes(route.css) ||
      !validSizes(route.html)
    )
      throw new Error("Invalid or duplicate baseline route.");
    routes.add(route.route);
  }
  return value as unknown as Baseline;
}

export function evaluate(report: PerformanceReport, baseline?: Baseline): void {
  const budget = (target: string, rule: string, actual: number, limit: number) => {
    if (actual > limit)
      report.findings.push({
        target,
        rule,
        actual,
        limit,
        severity: "error",
        message: `${actual} bytes exceeds ${limit} bytes.`,
      });
  };
  const limits = report.config.budgets;
  for (const route of report.routes) {
    budget(route.route, "initial-js-gzip", route.js.gzip, limits.jsGzip);
    budget(route.route, "initial-css-gzip", route.css.gzip, limits.cssGzip);
    budget(route.route, "html-gzip", route.html.gzip, limits.htmlGzip);
  }
  for (const asset of report.assets) {
    if (asset.kind === "media") budget(asset.file, "media-raw", asset.raw, limits.mediaRaw);
    if (asset.kind === "font") budget(asset.file, "font-raw", asset.raw, limits.fontRaw);
  }
  budget("build", "total-raw", report.totals.raw, limits.totalRaw);
  if (!baseline) return;
  const regression = (target: string, rule: string, current: number, previous: number) => {
    const limit =
      previous +
      Math.max(report.config.regression.bytes, (previous * report.config.regression.percent) / 100);
    budget(target, rule, current, Math.floor(limit));
  };
  regression("build", "total-raw-regression", report.totals.raw, baseline.totals.raw);
  const previousRoutes = new Map(baseline.routes.map((route) => [route.route, route]));
  const currentRoutes = new Set(report.routes.map((route) => route.route));
  for (const route of report.routes) {
    const previous = previousRoutes.get(route.route);
    if (!previous) {
      report.findings.push({
        target: route.route,
        rule: "new-route",
        severity: "warning",
        message: "New route has no baseline; absolute budgets still apply.",
      });
      continue;
    }
    for (const kind of ["js", "css", "html"] as const)
      regression(route.route, `${kind}-gzip-regression`, route[kind].gzip, previous[kind].gzip);
  }
  for (const previous of baseline.routes) {
    if (!currentRoutes.has(previous.route))
      report.findings.push({
        target: previous.route,
        rule: "removed-route",
        severity: "warning",
        message: "Baseline route is absent from this build.",
      });
  }
}
