import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import pc from "picocolors";
import { chromium } from "playwright-core";
import { findAvailablePort } from "../server/manager.js";
import { ensureChromiumBrowser, getBrowserLaunchArgs } from "../utils/browser.js";
import { exists, findProjectRoot } from "../utils/fs.js";
import { extractBreakpointBoundaries } from "./breakpoints.js";
import { type ProbeIssue, type ProbeResult, probeDOM } from "./probe.js";

export interface ViewportConfig {
  height: number;
  name?: string;
  width: number;
}

export interface LiveProbeOptions {
  cwd?: string;
  port?: number;
  routes?: string[];
  saveTraceOnFailure?: boolean;
  staticDir?: string;
  tracePath?: string;
  viewports?: ViewportConfig[];
}

export interface LiveProbeFinding {
  issue: ProbeIssue;
  route: string;
  rule: string;
  viewport: ViewportConfig;
}

export interface LiveProbeSummary {
  browserName: string;
  durationMs: number;
  findings: LiveProbeFinding[];
  routesChecked: string[];
  success: boolean;
  traceSavedTo?: string;
  viewportsChecked: ViewportConfig[];
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

async function createStaticServer(
  rootDirectory: string,
  port: number,
): Promise<{ close: () => Promise<void>; serverUrl: string }> {
  const realRoot = await fs.realpath(rootDirectory).catch(() => path.resolve(rootDirectory));
  const realRootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      let reqPath: string;
      try {
        reqPath = decodeURIComponent(parsedUrl.pathname);
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request");
        return;
      }

      const normalizedRoot = path.resolve(rootDirectory);
      let filePath = path.resolve(normalizedRoot, `.${path.normalize(reqPath)}`);

      // Prevent directory traversal attacks escaping rootDirectory
      if (!filePath.startsWith(normalizedRoot + path.sep) && filePath !== normalizedRoot) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: Access denied outside web root");
        return;
      }

      let stat = await fs.stat(filePath).catch(() => null);

      if (stat?.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        stat = await fs.stat(filePath).catch(() => null);
      }

      // Route fallback: /about -> /about.html
      if (!stat && !path.extname(reqPath)) {
        const withHtml = path.resolve(normalizedRoot, `.${path.normalize(reqPath)}.html`);
        if (withHtml.startsWith(normalizedRoot + path.sep)) {
          stat = await fs.stat(withHtml).catch(() => null);
          if (stat) filePath = withHtml;
        }
      }

      // SPA fallback to index.html
      if (!stat) {
        const spaFallback = path.join(normalizedRoot, "index.html");
        stat = await fs.stat(spaFallback).catch(() => null);
        if (stat) filePath = spaFallback;
      }

      if (!stat || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const realTarget = await fs.realpath(filePath).catch(() => null);
      if (!realTarget || (realTarget !== realRoot && !realTarget.startsWith(realRootPrefix))) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: Access denied outside web root");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      const content = await fs.readFile(filePath);

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": content.length,
        "Cache-Control": "no-cache",
      });
      res.end(content);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  return {
    serverUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function discoverRoutesAndDirectory(
  projectRoot: string,
  explicitStaticDir?: string,
): Promise<{ routes: string[]; staticDir: string }> {
  let staticDir = explicitStaticDir;
  if (!staticDir) {
    const candidates = [
      path.join(projectRoot, "build", "client"),
      path.join(projectRoot, "dist"),
      projectRoot,
    ];
    for (const dir of candidates) {
      if (await exists(dir)) {
        const indexHtml = path.join(dir, "index.html");
        if (await exists(indexHtml)) {
          staticDir = dir;
          break;
        }
      }
    }
  }

  if (!staticDir || !(await exists(staticDir))) {
    throw new Error(
      `No built static directory found in ${projectRoot}. Run 'npm run build' before running live DOM probe.`,
    );
  }

  const routes = new Set<string>(["/"]);

  async function scanHtmlRoutes(dir: string, base: string) {
    if (!(await exists(dir))) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanHtmlRoutes(full, `${base}/${entry.name}`);
        } else if (entry.isFile() && entry.name.endsWith(".html")) {
          if (entry.name === "__spa-fallback.html") return;
          if (entry.name === "index.html") {
            routes.add(base || "/");
          } else {
            const routeName = entry.name.replace(/\.html$/, "");
            routes.add(`${base}/${routeName}`);
          }
        }
      }),
    );
  }

  await scanHtmlRoutes(staticDir, "");
  return { staticDir, routes: Array.from(routes) };
}

export async function runLiveGeometryProbe(
  options: LiveProbeOptions = {},
): Promise<LiveProbeSummary> {
  const startTime = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = (await findProjectRoot(cwd)) ?? cwd;

  console.log(pc.cyan(`\n🌐 Launching Headless DOM Geometry & Trace Runner in ${projectRoot}...`));

  // 1. Detect or provision Chromium/Brave
  const browserInfo = await ensureChromiumBrowser();
  console.log(
    pc.dim(
      `  • Using browser engine: ${browserInfo.name}${browserInfo.version ? ` (${browserInfo.version})` : ""}`,
    ),
  );

  // 2. Discover built static files & routes
  const { staticDir, routes: discoveredRoutes } = await discoverRoutesAndDirectory(
    projectRoot,
    options.staticDir,
  );
  const targetRoutes = options.routes ?? discoveredRoutes;

  // 3. Extract CSS breakpoints to populate boundary viewports
  const defaultViewports: ViewportConfig[] = [
    { width: 320, height: 600, name: "Mobile Small (320px)" },
    { width: 390, height: 844, name: "Mobile Standard (390px)" },
    { width: 768, height: 1024, name: "Tablet (768px)" },
    { width: 1280, height: 800, name: "Desktop (1280px)" },
  ];

  const cssList: string[] = [];
  async function collectCss(dir: string) {
    if (!(await exists(dir))) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !["node_modules", ".git"].includes(e.name)) {
        await collectCss(full);
      } else if (e.isFile() && e.name.endsWith(".css")) {
        cssList.push(await fs.readFile(full, "utf8"));
      }
    }
  }
  await collectCss(staticDir);
  const boundaryPoints = extractBreakpointBoundaries(cssList, { minWidth: 320, maxWidth: 1440 });
  for (const bp of boundaryPoints) {
    if (!defaultViewports.some((v) => v.width === bp)) {
      defaultViewports.push({ width: bp, height: 800, name: `Breakpoint boundary (${bp}px)` });
    }
  }
  defaultViewports.sort((a, b) => a.width - b.width);

  const viewportsToTest = options.viewports ?? defaultViewports;

  // 4. Start local static HTTP server
  const port = options.port ?? (await findAvailablePort(4173));
  const staticServer = await createStaticServer(staticDir, port);

  const findings: LiveProbeFinding[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let tracePath: string | undefined;

  try {
    browser = await chromium.launch({
      executablePath: browserInfo.executablePath,
      headless: true,
      args: getBrowserLaunchArgs(),
    });

    const context = await browser.newContext({
      serviceWorkers: "block",
    });

    // Zero-screenshot policy: snapshots = true, screenshots = false
    await context.tracing.start({
      screenshots: false,
      snapshots: true,
      sources: true,
    });

    const page = await context.newPage();

    for (const route of targetRoutes) {
      const url = `${staticServer.serverUrl}${route}`;
      for (const vp of viewportsToTest) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(50);

        // Run live probe in browser context
        const result = (await page.evaluate(probeDOM)) as ProbeResult;

        for (const [rule, issues] of Object.entries(result.issues)) {
          for (const issue of issues) {
            findings.push({
              rule,
              issue,
              route,
              viewport: vp,
            });
          }
        }

        // Stress test: 200% font size reflow check (capture sizes first to prevent compounding inheritance)
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll("body, body *"));
          const sizes = elements.map((el) =>
            Number.parseFloat(window.getComputedStyle(el).fontSize),
          );
          elements.forEach((el, i) => {
            if (sizes[i] > 0) {
              (el as HTMLElement).style.setProperty("font-size", `${sizes[i] * 2}px`, "important");
            }
          });
        });
        await page.waitForTimeout(50);

        const stressResult = (await page.evaluate(probeDOM)) as ProbeResult;
        for (const issue of stressResult.issues.overflow) {
          findings.push({
            rule: "stress-overflow-200",
            issue,
            route,
            viewport: vp,
          });
        }
        for (const issue of stressResult.issues.clipping) {
          findings.push({
            rule: "stress-clipping-200",
            issue,
            route,
            viewport: vp,
          });
        }
      }
    }

    if (findings.length > 0 && options.saveTraceOnFailure !== false) {
      const traceDir = path.join(projectRoot, "docs", "qa");
      await fs.mkdir(traceDir, { recursive: true });
      tracePath = options.tracePath ?? path.join(traceDir, "trace.zip");
      await context.tracing.stop({ path: tracePath });
    } else {
      await context.tracing.stop();
    }

    await context.close();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await staticServer.close().catch(() => {});
  }

  const durationMs = Date.now() - startTime;

  if (findings.length > 0) {
    console.log(
      pc.red(
        `\n  ✗ Found ${findings.length} live DOM geometry / accessibility defect(s) during probe:`,
      ),
    );
    for (const f of findings.slice(0, 15)) {
      console.log(
        pc.yellow(
          `    [${f.rule.toUpperCase()}] ${f.route} @ ${f.viewport.width}px (${f.viewport.name ?? ""})`,
        ),
      );
      console.log(pc.dim(`      Selector: ${f.issue.selector}`));
      if (f.issue.problem) console.log(pc.dim(`      Problem: ${f.issue.problem}`));
      if (f.issue.text) console.log(pc.dim(`      Text: "${f.issue.text}"`));
      if (f.issue.width || f.issue.height) {
        console.log(pc.dim(`      Size: ${f.issue.width ?? 0}x${f.issue.height ?? 0}px`));
      }
    }
    if (findings.length > 15) {
      console.log(pc.dim(`    ... and ${findings.length - 15} more findings.`));
    }
    if (tracePath) {
      console.log(pc.cyan(`\n  📦 Trace recording saved to: ${tracePath}`));
      console.log(
        pc.dim(
          "    Inspect trace online at https://trace.playwright.dev (zero screenshots, full DOM snapshots & network).",
        ),
      );
    }
  } else {
    console.log(
      pc.green(
        `  ✓ Live DOM geometry verified across ${targetRoutes.length} route(s) and ${viewportsToTest.length} viewport(s) with zero defects.`,
      ),
    );
    console.log(pc.dim(`  • Verified in ${durationMs}ms with zero raster screenshots.`));
  }

  return {
    success: findings.length === 0,
    browserName: browserInfo.name,
    findings,
    routesChecked: targetRoutes,
    viewportsChecked: viewportsToTest,
    durationMs,
    traceSavedTo: tracePath,
  };
}
