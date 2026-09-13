export type A11ySeverity = "error" | "warn";

export interface A11yFinding {
  file: string;
  line: number;
  rule: string;
  severity: A11ySeverity;
  element: string;
  message: string;
}

export interface A11yAuditResult {
  errors: A11yFinding[];
  warnings: A11yFinding[];
  totalIssues: number;
}

export interface HtmlSource {
  file: string;
  html: string;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function isDecorativeImage(tag: string): boolean {
  return /\balt\s*=\s*["']\s*["']/i.test(tag) || /\baria-hidden\s*=\s*["']true["']/i.test(tag);
}

/**
 * Static accessibility and semantic landmark audit.
 * Enforces WCAG 2.1 AA landmark hierarchy, keyboard landmarks, and accessible forms.
 */
export function auditHtmlA11y(sources: HtmlSource[]): A11yAuditResult {
  const errors: A11yFinding[] = [];
  const warnings: A11yFinding[] = [];

  for (const { file, html: source } of sources) {
    // Ignore inert markup in comments and raw-text elements while preserving line numbers.
    const html = source.replace(
      /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      (match) => match.replace(/[^\n]/g, " "),
    );
    const addError = (rule: string, element: string, message: string, line = 1) => {
      errors.push({ file, line, rule, severity: "error", element, message });
    };

    const addWarn = (rule: string, element: string, message: string, line = 1) => {
      warnings.push({ file, line, rule, severity: "warn", element, message });
    };

    // 1. html lang attribute (for full pages)
    if (/<html\b/i.test(html)) {
      if (!/<html\s[^>]*\blang\s*=\s*["'][a-z]{2}(?:-[A-Za-z]{2,4})?["']/i.test(html)) {
        addError("html-lang", "<html>", "Missing or invalid lang attribute on <html> element.");
      }
    }

    // 2. Headings & Landmarks (exempt empty SPA root shells)
    const isSpaShell = /<div\s+id=["']root["']\s*>\s*<\/div>/i.test(html);
    const h1s = Array.from(html.matchAll(/<h1\b[^>]*>/gi));
    if (/<body\b|<main\b/i.test(html) && !isSpaShell) {
      if (h1s.length === 0) {
        addError("single-h1", "<h1>", "Page missing top-level <h1> landmark heading.");
      } else if (h1s.length > 1) {
        addError(
          "single-h1",
          "<h1>",
          `Page contains ${h1s.length} <h1> headings; exactly one landmark heading expected.`,
          lineOf(html, h1s[1].index ?? 0),
        );
      }
    }

    // 3. Main landmark
    const mains = Array.from(html.matchAll(/<main\b[^>]*>/gi));
    if (/<body\b/i.test(html) && !isSpaShell) {
      if (mains.length === 0) {
        addError("main-landmark", "<main>", "Page missing <main> primary content landmark.");
      } else if (mains.length > 1) {
        addError(
          "main-landmark",
          "<main>",
          `Page contains ${mains.length} <main> landmarks; exactly one expected.`,
          lineOf(html, mains[1].index ?? 0),
        );
      }

      // 4. Skip-to-content link
      const mainMatch = mains[0]?.[0];
      const mainId = mainMatch?.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      const skipLinkMatch = Array.from(html.matchAll(/<a\b[^>]*>/gi)).find((match) =>
        /\sclass\s*=\s*["'][^"']*\bskip-link\b[^"']*["']/i.test(match[0]),
      );

      if (mains.length === 1 && !skipLinkMatch) {
        addWarn(
          "skip-link",
          "<a class='skip-link'>",
          "Page lacks an accessible skip-to-content keyboard link before primary navigation.",
        );
      } else if (skipLinkMatch && mainId) {
        const skipHref = skipLinkMatch[0].match(/\shref\s*=\s*["']#([^"']+)["']/i)?.[1];
        if (skipHref !== mainId) {
          addError(
            "skip-link-target",
            "<a class='skip-link'>",
            `Skip link target '#${skipHref}' does not match <main> ID '#${mainId}'.`,
          );
        }
      }
    }

    // 5. Unique IDs
    const idMatches = Array.from(html.matchAll(/<[^>]+>/g)).flatMap((tag) =>
      Array.from(tag[0].matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)),
    );
    const seenIds = new Set<string>();
    const dupIds = new Set<string>();
    for (const match of idMatches) {
      const id = match[1];
      if (seenIds.has(id)) {
        dupIds.add(id);
      }
      seenIds.add(id);
    }
    for (const dup of dupIds) {
      addError(
        "unique-id",
        `#${dup}`,
        `Duplicate element ID '#${dup}' violates DOM uniqueness and a11y label associations.`,
      );
    }

    // 6. Image alt text
    const imgMatches = Array.from(html.matchAll(/<img\b[^>]*>/gi));
    for (const match of imgMatches) {
      const tag = match[0];
      const line = lineOf(html, match.index ?? 0);
      if (!/\balt\s*=/i.test(tag)) {
        addError(
          "img-alt",
          tag.slice(0, 60),
          "Image missing alt attribute. Provide descriptive alt text or empty alt='' for decorative graphics.",
          line,
        );
      } else if (!isDecorativeImage(tag)) {
        const altText = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
        if (/^(?:image|photo|picture|görsel|resim|fotoğraf)$/i.test(altText.trim())) {
          addWarn(
            "img-alt-quality",
            tag.slice(0, 60),
            `Uninformative alt text '${altText}'. Describe the image content or set alt='' if decorative.`,
            line,
          );
        }
      }
    }

    // 7. Button type attribute
    const buttonMatches = Array.from(html.matchAll(/<button\b[^>]*>/gi));
    for (const match of buttonMatches) {
      const tag = match[0];
      const line = lineOf(html, match.index ?? 0);
      if (!/\btype\s*=\s*["'](?:button|submit|reset)["']/i.test(tag)) {
        addWarn(
          "button-type",
          tag.slice(0, 60),
          "Button missing explicit type attribute ('button', 'submit', or 'reset'). Default is submit.",
          line,
        );
      }
    }

    // 8. New tab links target='_blank' rel='noopener'
    const blankLinks = Array.from(html.matchAll(/<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*>/gi));
    for (const match of blankLinks) {
      const tag = match[0];
      const line = lineOf(html, match.index ?? 0);
      if (!/\brel\s*=\s*["'][^"']*\b(?:noopener|noreferrer)\b[^"']*["']/i.test(tag)) {
        addError(
          "link-rel-noopener",
          tag.slice(0, 60),
          "Target='_blank' link missing rel='noopener' or rel='noreferrer'.",
          line,
        );
      }
    }

    // 9. Inline styles ban (enforcing atomic primitives)
    const inlineStyles = Array.from(html.matchAll(/\bstyle\s*=\s*["'][^"']*["']/gi));
    for (const match of inlineStyles) {
      const tag = match[0];
      const line = lineOf(html, match.index ?? 0);
      addError(
        "no-inline-style",
        tag.slice(0, 60),
        "Inline style attribute bypasses design token system and atomic primitives.",
        line,
      );
    }
  }

  return {
    errors,
    warnings,
    totalIssues: errors.length + warnings.length,
  };
}
