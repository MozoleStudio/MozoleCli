import postcss from "postcss";

export type FindingSeverity = "error" | "warn";

export interface ContractFinding {
  file: string;
  line: number;
  selector: string;
  rule: string;
  severity: FindingSeverity;
  value: string;
  message: string;
}

export interface ContractAuditResult {
  errors: ContractFinding[];
  warnings: ContractFinding[];
  totalViolations: number;
}

export interface CssSource {
  file: string;
  css: string;
}

const LITERAL_COLOR_REGEX = /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i;
const FIXED_FRAME_REGEX = /^(?:375|390|414|768|810|834|1024|1280|1440|1920)px$/i;

export function auditCssContracts(sources: CssSource[]): ContractAuditResult {
  const parsedRoots = sources.map(({ file, css }) => {
    try {
      return { file, root: postcss.parse(css, { from: file }) };
    } catch {
      return { file, root: postcss.root() };
    }
  });

  const declaredTokens = new Set<string>();
  for (const { root } of parsedRoots) {
    root.walkDecls(/^--/, (decl) => {
      declaredTokens.add(decl.prop);
    });
  }

  const errors: ContractFinding[] = [];
  const warnings: ContractFinding[] = [];

  for (const { file, root } of parsedRoots) {
    const isCanonicalTokenFile = file.endsWith("tokens.css") || file.endsWith("theme.css");

    root.walkDecls((decl) => {
      const line = decl.source?.start?.line ?? 1;
      const selector =
        decl.parent?.type === "rule"
          ? (decl.parent as { selector: string }).selector
          : `@${(decl.parent as { name?: string }).name ?? "at-rule"}`;

      const addError = (rule: string, value: string, message: string) => {
        errors.push({
          file,
          line,
          selector,
          rule,
          severity: "error",
          value,
          message,
        });
      };

      const addWarn = (rule: string, value: string, message: string) => {
        warnings.push({
          file,
          line,
          selector,
          rule,
          severity: "warn",
          value,
          message,
        });
      };

      // Check for undefined custom properties
      for (const match of decl.value.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
        const tokenName = match[1];
        const hasFallback = match[2] === ",";
        if (!declaredTokens.has(tokenName) && !hasFallback) {
          addError(
            "undefined-token",
            tokenName,
            `Undefined token '${tokenName}' consumed without fallback.`,
          );
        }
      }

      // Check at-rules
      let inFontFace = false;
      let inThemeAtRule = false;
      let p: { type: string; parent?: unknown; name?: string } | undefined = decl.parent;
      while (p) {
        if (p.type === "atrule") {
          if (p.name === "font-face") inFontFace = true;
          if (p.name === "theme") inThemeAtRule = true;
        }
        p = p.parent as { type: string; parent?: unknown; name?: string } | undefined;
      }

      const isExempt =
        isCanonicalTokenFile || inFontFace || inThemeAtRule || decl.prop.startsWith("--");

      if (!isExempt) {
        // 1. Literal color check
        if (
          /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow)$/i.test(
            decl.prop,
          ) &&
          LITERAL_COLOR_REGEX.test(decl.value)
        ) {
          addError(
            "literal-color",
            decl.value,
            "Literal color bypasses token palette. Define in src/styles/tokens.css and consume via semantic token or utility.",
          );
        }

        // 2. Font family check
        if (
          decl.prop === "font-family" &&
          !/^(?:var\(--font-[\w-]+\)|inherit|system-ui)$/i.test(decl.value.trim())
        ) {
          addError(
            "font-role",
            decl.value,
            "Use semantic font tokens (e.g. var(--font-display), var(--font-body)) instead of raw font families.",
          );
        }

        // 3. Font size scale check
        if (
          decl.prop === "font-size" &&
          selector !== "html" &&
          !/^(?:var\(--text-[\w-]+\)|inherit|0)$/i.test(decl.value.trim())
        ) {
          addError(
            "font-size-token",
            decl.value,
            `Hardcoded font size '${decl.value}'. Consume semantic fluid scale tokens (var(--text-*)).`,
          );
        }

        // 4. Fixed frame warning (WARN, not error, to accommodate device mockups)
        if (
          /^(?:width|max-width|min-width|height)$/i.test(decl.prop) &&
          FIXED_FRAME_REGEX.test(decl.value.trim())
        ) {
          addWarn(
            "fixed-frame-dimension",
            decl.value,
            `Fixed canvas/mockup dimension '${decl.value}'. Ensure this is a deliberate device frame/mockup and not an unsemantic design-tool transcription.`,
          );
        }
      }

      // 5. Transition all check (always prohibited for mobile performance)
      if (decl.prop === "transition" && /^all\b/i.test(decl.value.trim())) {
        addError(
          "transition-all",
          decl.value,
          `'transition: all' degrades GPU performance. Declare explicit transition properties (e.g. transition-colors, transition-transform).`,
        );
      }
    });
  }

  return {
    errors,
    warnings,
    totalViolations: errors.length + warnings.length,
  };
}
