import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLiveGeometryProbe } from "../../src/qa/runner.js";
import { atomicWrite } from "../../src/utils/fs.js";
import { run } from "../../src/utils/process.js";

describe("Headless Live DOM Geometry & Trace Runner", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-probe-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("verifies clean accessible HTML with zero defects using local browser", async () => {
    const cleanHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Clean Studio</title>
        <style>
          :root {
            --font-body: system-ui, sans-serif;
            --font-display: system-ui, sans-serif;
            --font-interface: system-ui, sans-serif;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: #111; background: #fff; overflow-wrap: break-word; }
          .skip-link { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
          .skip-link:focus { position: fixed; top: 1rem; left: 1rem; width: auto; height: auto; padding: 0.5rem 1rem; background: #000; color: #fff; z-index: 9999; clip: auto; }
          header, main, footer { width: 100%; max-width: 1200px; margin: 0 auto; padding: 1rem; }
          h1 { font-size: 24px; }
          button { font-family: inherit; min-height: 44px; min-width: 44px; padding: 0.5rem 1rem; font-size: 16px; cursor: pointer; }
        </style>
      </head>
      <body>
        <a href="#main" class="skip-link">Skip to main content</a>
        <header>
          <nav aria-label="Main Navigation">
            <a href="/">Home</a>
          </nav>
        </header>
        <main id="main">
          <h1>Clean Modern Architecture</h1>
          <p>This layout is fully responsive and reflows seamlessly across any viewport.</p>
          <button type="button">Accessible Action</button>
        </main>
        <footer>
          <p>© 2026 Mozole Studio.</p>
        </footer>
      </body>
      </html>
    `;

    await atomicWrite(path.join(tmpDir, "index.html"), cleanHtml);

    const result = await runLiveGeometryProbe({
      staticDir: tmpDir,
      routes: ["/"],
      viewports: [
        { width: 320, height: 600, name: "Mobile Small (320px)" },
        { width: 768, height: 1024, name: "Tablet (768px)" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.browserName).toMatch(/(Brave|Chrome|Chromium|Edge)/i);
  }, 30_000);

  it("detects overflow and tiny touch targets, producing a zero-screenshot trace", async () => {
    const defectiveHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Defective Site</title>
        <style>
          :root {
            --font-body: system-ui, sans-serif;
            --font-display: system-ui, sans-serif;
          }
          body { margin: 0; font-family: system-ui, sans-serif; }
          #wide-box { width: 800px; height: 100px; background: red; }
          #tiny-btn { width: 12px; height: 12px; padding: 0; }
        </style>
      </head>
      <body>
        <a href="#main" class="skip-link">Skip</a>
        <main id="main">
          <h1>Defects Present</h1>
          <div id="wide-box">Causing horizontal overflow on mobile viewports</div>
          <button id="tiny-btn" type="button">x</button>
        </main>
      </body>
      </html>
    `;

    await atomicWrite(path.join(tmpDir, "index.html"), defectiveHtml);
    const tracePath = path.join(tmpDir, "trace.zip");

    const result = await runLiveGeometryProbe({
      staticDir: tmpDir,
      routes: ["/"],
      viewports: [{ width: 320, height: 600, name: "Mobile Small (320px)" }],
      tracePath,
      saveTraceOnFailure: true,
    });

    expect(result.success).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);

    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain("overflow");
    expect(rules).toContain("targets");

    // Verify trace file was created
    const traceStat = await fs.stat(tracePath);
    expect(traceStat.size).toBeGreaterThan(0);

    // Verify ZERO screenshots inside the trace zip using unzip -l
    const zipListing = await run("unzip", ["-l", tracePath]);
    if (zipListing.exitCode === 0) {
      expect(zipListing.stdout).not.toMatch(/\.(png|jpg|jpeg|webp)/i);
    }
  }, 30_000);
});
