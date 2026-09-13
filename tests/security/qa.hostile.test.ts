import { describe, expect, it } from "vitest";
import { auditHtmlA11y } from "../../src/qa/a11y.js";
import { extractBreakpointBoundaries } from "../../src/qa/breakpoints.js";
import { auditCssContracts } from "../../src/qa/contract.js";

describe("security: qa/contract bypass resistance", () => {
  it.each([
    "#fff",
    "#11223344",
    "rgb(1 2 3)",
    "rgba(1,2,3,.5)",
    "hsl(0 0% 0%)",
    "oklch(0.6 0.2 120)",
    "lab(50% 40 59)",
    "lch(70% 45 30)",
    "hwb(120 10% 20%)",
    "color(display-p3 1 0 0)",
    "color-mix(in srgb, red, blue)",
    "RGB(1 2 3)",
  ])("detects literal color %s inside nested rules", (value) => {
    const result = auditCssContracts([
      { file: "src/rogue.css", css: `@media (width > 1px) { .card { color: ${value}; } }` },
    ]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "literal-color", file: "src/rogue.css", value }),
      ]),
    );
  });

  it.each([
    "tokens.css",
    "vendor/tokens.css",
    "src/styles/tokens.css.evil",
    "src/styles/../styles/tokens.css",
  ])("does not grant canonical token exemption to %s", (file) => {
    expect(auditCssContracts([{ file, css: "@theme { --color-rogue: #fff; }" }]).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "literal-color" })]),
    );
  });

  it("allows canonical declarations but still rejects transition all in the same file", () => {
    const result = auditCssContracts([
      { file: "src/styles/tokens.css", css: "@theme { --color-safe: #fff; transition: all 1s; }" },
    ]);
    expect(result.errors.map((finding) => finding.rule)).toEqual(["transition-all"]);
  });

  it.each(["all 1s", "opacity 1s, all 2s", "ALL", "all, transform"])(
    "detects transition wildcard %s",
    (value) => {
      expect(
        auditCssContracts([{ file: "app.css", css: `.x { transition: ${value}; }` }]).errors,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "transition-all" })]));
    },
  );

  it("fails closed for malformed CSS while continuing to audit other sources", () => {
    const result = auditCssContracts([
      { file: "broken.css", css: ".x { color:" },
      { file: "rogue.css", css: ".x { color: var(--missing); background: #fff; }" },
    ]);
    expect(result.errors.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["css-syntax", "undefined-token", "literal-color"]),
    );
    expect(result.totalViolations).toBe(result.errors.length + result.warnings.length);
  });

  it("does not count declarations hidden in comments as defined tokens", () => {
    const result = auditCssContracts([
      { file: "app.css", css: "/* --secret: red; */ .x { color: var(--secret); }" },
    ]);
    expect(result.errors.map((finding) => finding.rule)).toContain("undefined-token");
  });
});

describe("security: qa/a11y hostile markup", () => {
  it.each([
    "<!-- <main><h1>Fake</h1></main> -->",
    "<script>const fake = '<main><h1>Fake</h1></main>';</script>",
    "<style>/* <main><h1>Fake</h1></main> */</style>",
  ])("ignores inert landmarks: %s", (markup) => {
    const result = auditHtmlA11y([
      { file: "page.html", html: `<html lang="en"><body>${markup}</body></html>` },
    ]);
    expect(result.errors.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["main-landmark", "single-h1"]),
    );
  });

  it.each(["", 'rel="opener"', 'title="noopener"'])(
    "detects unsafe new-tab link %s",
    (attribute) => {
      const result = auditHtmlA11y([
        {
          file: "link.html",
          html: `<a target="_blank" ${attribute} href="https://example.com">Link</a>`,
        },
      ]);
      expect(result.errors.map((finding) => finding.rule)).toContain("link-rel-noopener");
    },
  );

  it.each(["noopener", "noreferrer", "external noopener"])(
    "accepts explicit safe relationship %s",
    (rel) => {
      expect(
        auditHtmlA11y([{ file: "link.html", html: `<a target="_blank" rel="${rel}">Link</a>` }])
          .errors,
      ).toEqual([]);
    },
  );

  it("reports duplicate attacker-controlled IDs including prototype property names", () => {
    for (const id of ["__proto__", "constructor", "toString"]) {
      expect(
        auditHtmlA11y([{ file: "page.html", html: `<div id="${id}"></div><input id="${id}">` }])
          .errors,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: "unique-id", element: `#${id}` })]),
      );
    }
  });

  it("preserves real finding line numbers after stripping malicious raw text", () => {
    const result = auditHtmlA11y([
      { file: "page.html", html: '<script>\n"<img>"\n</script>\n<img src="real.png">' },
    ]);
    expect(result.errors.filter((finding) => finding.rule === "img-alt")).toEqual([
      expect.objectContaining({ line: 4, file: "page.html" }),
    ]);
  });
});

describe("security: qa/breakpoints hostile input bounds", () => {
  it("bounds huge and duplicate breakpoints without expanding a numeric range", () => {
    const css = "@media (width > 999999999999999999999999px) {} @media (width > 48rem) {}";
    const result = extractBreakpointBoundaries(
      Array.from({ length: 100 }, () => css),
      { minWidth: 320, maxWidth: 1440 },
    );
    expect(result).toEqual([...new Set(result)].sort((a, b) => a - b));
    expect(result.every((width) => Number.isFinite(width) && width >= 320 && width <= 1440)).toBe(
      true,
    );
    expect(result).toEqual(expect.arrayContaining([767, 768, 769]));
    expect(result.length).toBeLessThan(20);
  });

  it("continues after a malformed stylesheet", () => {
    expect(extractBreakpointBoundaries([".x {", "@media (width >= 901px) {}"])).toEqual(
      expect.arrayContaining([900, 901, 902]),
    );
  });
});
