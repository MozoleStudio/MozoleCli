import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditPerformance, performanceCommand } from "../../src/commands/performance.js";
import {
  cssImports,
  documentResources,
  localReference,
  moduleDependencies,
  routeUrl,
} from "../../src/performance/graph.js";
import { measure, normalizeBase } from "../../src/performance/index.js";
import { DEFAULT_CONFIG, parseBaseline, parseConfig } from "../../src/performance/model.js";
import { atomicWrite, exists } from "../../src/utils/fs.js";
import { run } from "../../src/utils/process.js";

const roots: string[] = [];
async function project(
  files: Record<string, string | Buffer> = {
    "dist/index.html": "<!doctype html><title>Home</title>",
  },
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mozole-performance-"));
  roots.push(root);
  for (const [file, content] of Object.entries(files))
    await atomicWrite(path.join(root, file), content);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) =>
        rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
      ),
  );
});

describe("performance graph and measurement", () => {
  it("follows static imports, re-exports and CSS imports once despite cycles and preloads", async () => {
    const root = await project({
      "dist/index.html":
        '<link rel="modulepreload" href="/assets/shared.js"><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">',
      "dist/assets/main.js":
        'import "./shared.js"; export { value } from "./shared.js"; import("./lazy.js");',
      "dist/assets/shared.js": 'import "./main.js"; export const value = 42;',
      "dist/assets/lazy.js": "export const lazy = true;",
      "dist/assets/main.css": '@import url("./base.css") layer(base); body { margin: 0; }',
      "dist/assets/base.css": '@import "./main.css"; html { display: block; }',
    });
    const report = await auditPerformance({ cwd: root });
    const route = report.routes[0];
    expect(route.resources).toEqual([
      "assets/base.css",
      "assets/main.css",
      "assets/main.js",
      "assets/shared.js",
    ]);
    expect(route.deferred).toEqual(["assets/lazy.js"]);
    const initial = report.assets.filter((item) =>
      ["assets/main.js", "assets/shared.js"].includes(item.file),
    );
    expect(route.js.gzip).toBe(initial.reduce((sum, item) => sum + item.gzip, 0));
    expect(report.findings).toEqual([]);
    expect(await auditPerformance({ cwd: root })).toEqual(report);
  });
  it("resolves nested SSG routes, deployment base, HTML base tags, URL encoding and query fragments", async () => {
    const root = await project({
      "build/client/index.html": '<script src="/client/assets/app.js?v=1&amp;x=2#entry"></script>',
      "build/client/about/index.html":
        '<base href="/client/"><script src="assets/app.js"></script><script src="assets/my%20module.js"></script>',
      "build/client/assets/app.js": "export const app = 1;",
      "build/client/assets/my module.js": "export const other = 2;",
    });
    const report = await auditPerformance({ cwd: root, base: "/client" });
    expect(report.routes.map((item) => item.route)).toEqual(["/client/about/", "/client/"]);
    expect(report.routes[0].resources).toEqual(["assets/app.js", "assets/my module.js"]);
    expect(report.findings).toEqual([]);
    expect(routeUrl("myindex.html", "/")).toBe("/myindex.html");
    expect(routeUrl("news/story.html", "/client/")).toBe("/client/news/story.html");
  });
  it("uses the HTML parser to ignore comments, templates, JSON scripts and fallback scripts", async () => {
    const root = await project({
      "dist/index.html": `<!-- <script src="/missing.js"></script> -->
      <template><script src="/inert.js"></script></template>
      <script type="application/ld+json">{"import": "./missing.js"}</script>
      <script nomodule src="/fallback.js"></script>
      <script type="module">import "./app.js";</script><style>body { display: block; }</style>`,
      "dist/app.js": 'const text = "import(\\"./fake.js\\")"; export { text };',
    });
    const report = await auditPerformance({ cwd: root });
    expect(report.routes[0].resources).toEqual(["app.js"]);
    expect(report.routes[0].css.raw).toBeGreaterThan(0);
    expect(report.findings).toEqual([]);
  });
  it("counts inline scripts, inline styles and module preloads but excludes disabled styles", () => {
    const doc = documentResources(
      '<link rel="alternate stylesheet" href="alternate.css"><link rel="stylesheet" disabled href="disabled.css"><link rel="preload" as="style" href="main.css"><script>window.ready = true;</script><style>html { margin: 0; }</style>',
      "https://mozole.invalid/",
      [],
    );
    expect(doc.css).toEqual(["main.css"]);
    expect(doc.inlineJs).toEqual(["window.ready = true;"]);
    expect(doc.inlineCss).toEqual(["html { margin: 0; }"]);
  });
  it("reports missing resources as errors and external/bare/computed dependencies as warnings without fetching", async () => {
    const root = await project({
      "dist/index.html":
        '<script type="module" src="https://cdn.invalid/external.js"></script><script type="module" src="/app.js"></script><link rel="stylesheet" href="/missing.css">',
      "dist/app.js": 'import "bare-package"; import("./missing-lazy.js"); import(window.target);',
    });
    const report = await auditPerformance({ cwd: root });
    expect(report.findings.map((item) => item.rule)).toEqual(
      expect.arrayContaining([
        "external-resource",
        "bare-import",
        "computed-import",
        "missing-resource",
      ]),
    );
    expect(await performanceCommand({ cwd: root, log: () => {} })).toBe(1);
  });
  it("returns accurate deterministic compression sizes and accounts for unreferenced assets", async () => {
    const buffer = Buffer.from("repeated-content-".repeat(2000));
    const sizes = await measure(buffer);
    expect(sizes.raw).toBe(buffer.length);
    expect(sizes.gzip).toBeLessThan(sizes.raw);
    expect(sizes.brotli).toBeLessThan(sizes.raw);
    expect(await measure(buffer)).toEqual(sizes);
    const root = await project({
      "dist/index.html": "<title>Home</title>",
      "dist/orphan.js": buffer,
      "dist/source.js.map": "{}",
      "dist/.vite/manifest.json": "{}",
      "dist/orphan.js.gz": "compressed",
    });
    const report = await auditPerformance({ cwd: root });
    expect(report.routes[0].js.raw).toBe(0);
    expect(report.totals.raw).toBe(buffer.length + Buffer.byteLength("<title>Home</title>"));
    expect(report.excluded).toEqual([".vite/manifest.json", "orphan.js.gz", "source.js.map"]);
  });
  it("enforces JS/CSS/HTML, media/font and total byte budgets and preserves exact boundary", async () => {
    const root = await project({
      "dist/index.html": '<script src="/app.js"></script><link rel="stylesheet" href="/app.css">',
      "dist/app.js": "export {};",
      "dist/app.css": "html {}",
      "dist/photo.avif": Buffer.alloc(30),
      "dist/text.woff2": Buffer.alloc(20),
    });
    const original = await auditPerformance({ cwd: root });
    const route = original.routes[0];
    await atomicWrite(
      path.join(root, "performance.config.json"),
      JSON.stringify({
        budgets: {
          jsGzip: route.js.gzip,
          cssGzip: route.css.gzip,
          htmlGzip: route.html.gzip,
          mediaRaw: 30,
          fontRaw: 20,
          totalRaw: original.totals.raw,
        },
      }),
    );
    expect((await auditPerformance({ cwd: root })).findings).toEqual([]);
    await atomicWrite(
      path.join(root, "performance.config.json"),
      JSON.stringify({
        budgets: { jsGzip: 0, cssGzip: 0, htmlGzip: 0, mediaRaw: 0, fontRaw: 0, totalRaw: 0 },
      }),
    );
    expect((await auditPerformance({ cwd: root })).findings.map((item) => item.rule)).toEqual([
      "initial-js-gzip",
      "initial-css-gzip",
      "html-gzip",
      "media-raw",
      "font-raw",
      "total-raw",
    ]);
  });
  it("compares stable route identities across hashed filenames and detects real regressions", async () => {
    const root = await project({
      "dist/index.html": '<script src="/app-old.js"></script>',
      "dist/app-old.js": "export {};",
    });
    await auditPerformance({ cwd: root, saveBaseline: "baseline.json" });
    await atomicWrite(path.join(root, "dist/index.html"), '<script src="/app-new.js"></script>');
    await atomicWrite(path.join(root, "dist/app-new.js"), "export {};");
    await rm(path.join(root, "dist/app-old.js"));
    expect((await auditPerformance({ cwd: root, baseline: "baseline.json" })).findings).toEqual([]);
    await atomicWrite(
      path.join(root, "performance.config.json"),
      JSON.stringify({ regression: { bytes: 0, percent: 0 } }),
    );
    await atomicWrite(
      path.join(root, "dist/app-new.js"),
      `export const values = ${JSON.stringify(Array.from({ length: 1000 }, (_, index) => `unique-value-${index * 1777}`))};`,
    );
    const report = await auditPerformance({ cwd: root, baseline: "baseline.json" });
    expect(report.findings.map((item) => item.rule)).toContain("js-gzip-regression");
    expect(report.findings.map((item) => item.rule)).not.toContain("new-route");
    await atomicWrite(path.join(root, "dist/new/index.html"), "<title>New</title>");
    await rm(path.join(root, "dist/index.html"));
    expect(
      (await auditPerformance({ cwd: root, baseline: "baseline.json" })).findings.map(
        (item) => item.rule,
      ),
    ).toEqual(expect.arrayContaining(["new-route", "removed-route"]));
  });
  it("validates config and baseline schemas and rejects invalid options", async () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
    for (const input of [
      null,
      [],
      { unknown: 1 },
      { budgets: { jsGzip: -1 } },
      { budgets: { jsGzip: "10kb" } },
      { regression: { bytes: 0.5 } },
      { budgets: { typo: 10 } },
      { regression: { percent: Number.NaN } },
    ])
      expect(() => parseConfig(input)).toThrow();
    for (const base of [
      "https://site.test",
      "//cdn.test",
      "/../",
      "/client?x",
      "/%2e/",
      "/client\\folder/",
    ])
      expect(() => normalizeBase(base)).toThrow();
    const root = await project();
    const report = await auditPerformance({ cwd: root });
    expect(parseBaseline(report, "/").totals).toEqual(report.totals);
    for (const value of [
      { ...report, schemaVersion: 9 },
      { ...report, base: "/other/" },
      { ...report, routes: [...report.routes, ...report.routes] },
      { ...report, totals: { raw: -1, gzip: 0, brotli: 0 } },
    ])
      expect(() => parseBaseline(value, "/")).toThrow();
  });
  it("handles CSS imports with media/layer clauses and distinguishes import.meta", async () => {
    expect(cssImports('@import "base.css" layer(base); @import url(other.css) screen;')).toEqual([
      "base.css",
      "other.css",
    ]);
    expect(() => cssImports('@import "escaped\\20name.css";')).toThrow("Unsupported CSS");
    expect(
      await moduleDependencies(
        'import.meta.url; export * from "./shared.js"; import("./lazy.js");',
      ),
    ).toEqual({ static: ["./shared.js"], dynamic: ["./lazy.js"], unresolvedDynamic: false });
  });
});

describe("performance command safety and exit codes", () => {
  it("writes reports atomically, protects source/config/baselines and does not snapshot a failing audit", async () => {
    const root = await project();
    const report = await auditPerformance({
      cwd: root,
      output: "reports/current.json",
      saveBaseline: "baseline.json",
    });
    expect(JSON.parse(await readFile(path.join(root, "reports/current.json"), "utf8"))).toEqual(
      report,
    );
    await expect(auditPerformance({ cwd: root, saveBaseline: "baseline.json" })).rejects.toThrow(
      "already exists",
    );
    await expect(
      auditPerformance({ cwd: root, output: "performance.config.json" }),
    ).rejects.toThrow("distinct");
    await expect(auditPerformance({ cwd: root, output: "dist/report.json" })).rejects.toThrow(
      "outside",
    );
    await expect(auditPerformance({ cwd: root, output: "../outside.json" })).rejects.toThrow(
      "inside",
    );
    await atomicWrite(path.join(root, "data.json"), '{"keep":true}');
    await expect(auditPerformance({ cwd: root, output: "data.json" })).rejects.toThrow("unrelated");
    await atomicWrite(path.join(root, "performance.config.json"), '{"budgets":{"htmlGzip":0}}');
    await auditPerformance({
      cwd: root,
      saveBaseline: "failed-baseline.json",
      output: "reports/current.json",
    });
    expect(await exists(path.join(root, "failed-baseline.json"))).toBe(false);
    expect(await readFile(path.join(root, "data.json"), "utf8")).toBe('{"keep":true}');
  });
  it("refuses absent/ambiguous build output and unsafe resource paths", async () => {
    const root = await project({ "dist/only.js": "export {};" });
    await expect(auditPerformance({ cwd: root })).rejects.toThrow("No built HTML");
    await atomicWrite(path.join(root, "build/client/index.html"), "<title>Home</title>");
    await expect(auditPerformance({ cwd: root })).rejects.toThrow("--from");
    expect((await auditPerformance({ cwd: root, from: "build/client" })).routes).toHaveLength(1);
    for (const reference of ["/%00.js", "/%2e%2e%2fsecret.js", "/bad%zz.js", "/a\\b.js"])
      expect(() => localReference(reference, "https://mozole.invalid/", "/", false)).toThrow();
    expect(() =>
      localReference("/outside.js", "https://mozole.invalid/client/", "/client/", false),
    ).toThrow("escapes");
  });
  it.skipIf(process.platform === "win32")(
    "rejects symlinks in output and report destinations",
    async () => {
      const root = await project();
      const outside = await project({ "secret.js": "export {};" });
      await symlink(path.join(outside, "secret.js"), path.join(root, "dist/link.js"));
      await expect(auditPerformance({ cwd: root })).rejects.toThrow("Symlink");
      await rm(path.join(root, "dist/link.js"));
      await symlink(outside, path.join(root, "escaped"));
      await expect(auditPerformance({ cwd: root, output: "escaped/report.json" })).rejects.toThrow(
        "Symlink",
      );
      expect(await exists(path.join(outside, "report.json"))).toBe(false);
    },
  );
  it("enforces input size limits without silently skipping oversized media", async () => {
    const root = await project({
      "dist/index.html": "<title>Home</title>",
      "dist/movie.mp4": Buffer.alloc(32 * 1024 * 1024 + 1),
    });
    await expect(auditPerformance({ cwd: root })).rejects.toThrow("32 MiB");
  });
  it("protects reports changed by the requested build", async () => {
    const root = await project({
      "package.json": '{"scripts":{"build":"node build.mjs"}}',
      "dist/index.html": "<title>Home</title>",
      "build.mjs":
        'import { writeFileSync } from "node:fs"; writeFileSync("report.json", JSON.stringify({ keep: true }));',
    });
    await expect(
      auditPerformance({ cwd: root, build: true, output: "report.json" }),
    ).rejects.toThrow("Report changed");
    expect(JSON.parse(await readFile(path.join(root, "report.json"), "utf8"))).toEqual({
      keep: true,
    });
  });

  it("runs a requested build and reports build failures", async () => {
    const root = await project({
      "package.json": '{"scripts":{"build":"node build.mjs"}}',
      "build.mjs":
        'import { mkdirSync, writeFileSync } from "node:fs"; mkdirSync("dist", { recursive: true }); writeFileSync("dist/index.html", "<title>Built</title>");',
    });
    expect((await auditPerformance({ cwd: root, build: true })).built).toBe(true);
    await atomicWrite(path.join(root, "build.mjs"), "process.exit(3);");
    await expect(auditPerformance({ cwd: root, build: true })).rejects.toThrow("Build failed");
  });
  it("audits real Vite output with a subpath, extracted CSS and a deferred chunk", async () => {
    const root = await project({
      "index.html":
        '<html><head><title>Site</title></head><body><script type="module" src="/main.js"></script></body></html>',
      "main.js":
        'import "./style.css"; document.addEventListener("click", () => import("./lazy.js"));',
      "style.css": ":root { --space: 0; } body { margin: var(--space); }",
      "lazy.js": 'console.log("lazy route");',
    });
    const build = await run(
      process.execPath,
      [path.resolve("node_modules/vite/bin/vite.js"), "build", root, "--base", "/client/"],
      { timeoutMs: 15000 },
    );
    expect(build.exitCode, build.stderr).toBe(0);
    const report = await auditPerformance({ cwd: root, base: "/client/" });
    expect(report.findings).toEqual([]);
    expect(report.routes[0].js.raw).toBeGreaterThan(0);
    expect(report.routes[0].css.raw).toBeGreaterThan(0);
    expect(report.routes[0].deferred).toHaveLength(1);
  });

  it("emits standalone JSON and real CLI statuses 0, 1 and 2", async () => {
    const root = await project();
    const cli = path.resolve("src/cli.ts");
    const invoke = (...args: string[]) =>
      run(
        process.execPath,
        ["--import", "tsx", cli, "performance", "--path", root, "--json", ...args],
        { timeoutMs: 15000 },
      );
    const clean = await invoke();
    expect(clean.exitCode).toBe(0);
    expect(clean.stdout, JSON.stringify(clean)).not.toBe("");
    expect(JSON.parse(clean.stdout).kind).toBe("mozole-performance");
    await atomicWrite(path.join(root, "performance.config.json"), '{"budgets":{"htmlGzip":0}}');
    expect((await invoke()).exitCode).toBe(1);
    const invalid = await invoke("--config", "missing.json");
    expect(invalid.exitCode).toBe(2);
    expect(JSON.parse(invalid.stdout).error).toBeDefined();
  });
});
