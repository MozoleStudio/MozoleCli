import { describe, expect, it } from "vitest";
import { auditHtmlA11y } from "../../src/qa/a11y.js";
import { extractBreakpointBoundaries } from "../../src/qa/breakpoints.js";
import { auditCssContracts } from "../../src/qa/contract.js";
import { PROBE_DOM_FN_STRING } from "../../src/qa/probe.js";

describe("auditCssContracts", () => {
  it("passes clean CSS with tokens and semantic utilities", () => {
    const css = `
      @theme {
        --color-primary: #ff0055;
        --font-display: Inter, sans-serif;
        --text-base: 1rem;
      }
      .card {
        color: var(--color-primary);
        font-family: var(--font-display);
        font-size: var(--text-base);
        transition: color 0.2s ease, transform 0.2s ease;
      }
    `;
    const result = auditCssContracts([{ file: "test.css", css }]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("detects literal colors, transition all, and undefined tokens", () => {
    const css = `
      .broken {
        color: #ff0000;
        background: rgb(20, 30, 40);
        transition: all 0.3s ease;
        border-color: var(--missing-token);
      }
    `;
    const result = auditCssContracts([{ file: "broken.css", css }]);
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain("literal-color");
    expect(rules).toContain("transition-all");
    expect(rules).toContain("undefined-token");
  });

  it("flags fixed canvas dimensions as warnings (not fatal errors)", () => {
    const css = `
      .canvas {
        width: 1440px;
        height: 800px;
      }
    `;
    const result = auditCssContracts([{ file: "mockup.css", css }]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].rule).toBe("fixed-frame-dimension");
    expect(result.warnings[0].severity).toBe("warn");
  });
});

describe("extractBreakpointBoundaries", () => {
  it("extracts boundary points with +/-1px deltas", () => {
    const css = `
      @media (min-width: 768px) { .box { display: flex; } }
      @media (max-width: 64rem) { .col { flex: 1; } }
    `;
    const boundaries = extractBreakpointBoundaries([css]);
    // 768px -> 767, 768, 769
    expect(boundaries).toContain(767);
    expect(boundaries).toContain(768);
    expect(boundaries).toContain(769);
    // 64rem * 16 = 1024px -> 1023, 1024, 1025
    expect(boundaries).toContain(1023);
    expect(boundaries).toContain(1024);
    expect(boundaries).toContain(1025);
  });
});

describe("auditHtmlA11y", () => {
  it("validates accessible markup with landmarks and skip-link", () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Test</title></head>
        <body>
          <a class="skip-link" href="#main-content">Skip to content</a>
          <main id="main-content">
            <h1>Accessible Header</h1>
            <p>Content</p>
            <img src="test.jpg" alt="A descriptive landscape" />
            <button type="button">Click</button>
          </main>
        </body>
      </html>
    `;
    const result = auditHtmlA11y([{ file: "index.html", html }]);
    expect(result.errors).toEqual([]);
  });

  it("detects missing lang, missing h1, duplicate IDs, and inline styles", () => {
    const html = `
      <html>
        <body>
          <main id="main">
            <div id="duplicate-id">One</div>
            <div id="duplicate-id" style="color: red;">Two</div>
            <img src="broken.jpg" />
            <a target="_blank" href="https://example.com">External</a>
          </main>
        </body>
      </html>
    `;
    const result = auditHtmlA11y([{ file: "bad.html", html }]);
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain("html-lang");
    expect(rules).toContain("single-h1");
    expect(rules).toContain("unique-id");
    expect(rules).toContain("img-alt");
    expect(rules).toContain("link-rel-noopener");
    expect(rules).toContain("no-inline-style");
  });
});

describe("probeDOM", () => {
  it("exports valid probeDOM function and fn string", () => {
    expect(typeof PROBE_DOM_FN_STRING).toBe("string");
    expect(PROBE_DOM_FN_STRING).toContain("function probeDOM()");
    expect(PROBE_DOM_FN_STRING).toContain("scrollWidth");
  });
});
