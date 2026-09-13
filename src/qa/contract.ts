import postcss, { CssSyntaxError } from "postcss";

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

const LITERAL_COLOR_REGEX = /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch|lab|lch|hwb|color|color-mix)a?\(/i;
const FIXED_FRAME_REGEX = /^(?:375|390|414|768|810|834|1024|1280|1440|1920)px$/i;

function auditRoot(
  file: string,
  root: postcss.Root,
  declaredTokens: Set<string>,
): { errors: ContractFinding[]; warnings: ContractFinding[] } {
  const errors: ContractFinding[] = [];
  const warnings: ContractFinding[] = [];
  const isCanonicalTokenFile = file.replaceAll("\\", "/") === "src/styles/tokens.css";

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

    const isExempt = inFontFace || (isCanonicalTokenFile && inThemeAtRule);

    if (!isExempt) {
      // 1. Literal color check
      if (LITERAL_COLOR_REGEX.test(decl.value)) {
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
    if (
      /^(?:transition|transition-property)$/i.test(decl.prop) &&
      /(?:^|[\s,])all(?:$|[\s,])/i.test(decl.value)
    ) {
      addError(
        "transition-all",
        decl.value,
        `'transition: all' degrades GPU performance. Declare explicit transition properties (e.g. transition-colors, transition-transform).`,
      );
    }
  });

  return { errors, warnings };
}

export async function auditCssContractsAsync(sources: CssSource[]): Promise<ContractAuditResult> {
  const errors: ContractFinding[] = [];
  const warnings: ContractFinding[] = [];

  const parsedRoots = await Promise.all(
    sources.map(async ({ file, css }) => {
      try {
        return { file, root: postcss.parse(css, { from: file }), syntaxError: null };
      } catch (error) {
        return { file, root: postcss.root(), syntaxError: error };
      }
    }),
  );

  const declaredTokens = new Set<string>();
  for (const item of parsedRoots) {
    if (item.syntaxError) {
      errors.push({
        file: item.file,
        line: item.syntaxError instanceof CssSyntaxError ? (item.syntaxError.line ?? 1) : 1,
        selector: "<stylesheet>",
        rule: "css-syntax",
        severity: "error",
        value: "",
        message:
          item.syntaxError instanceof Error ? item.syntaxError.message : String(item.syntaxError),
      });
    }
    item.root.walkDecls(/^--/, (decl) => {
      declaredTokens.add(decl.prop);
    });
  }

  const auditResults = await Promise.all(
    parsedRoots.map(async ({ file, root }) => auditRoot(file, root, declaredTokens)),
  );

  for (const res of auditResults) {
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }

  return {
    errors,
    warnings,
    totalViolations: errors.length + warnings.length,
  };
}

export function auditCssContracts(sources: CssSource[]): ContractAuditResult {
  const errors: ContractFinding[] = [];
  const warnings: ContractFinding[] = [];
  const parsedRoots = sources.map(({ file, css }) => {
    try {
      return { file, root: postcss.parse(css, { from: file }) };
    } catch (error) {
      errors.push({
        file,
        line: error instanceof CssSyntaxError ? (error.line ?? 1) : 1,
        selector: "<stylesheet>",
        rule: "css-syntax",
        severity: "error",
        value: "",
        message: error instanceof Error ? error.message : String(error),
      });
      return { file, root: postcss.root() };
    }
  });

  const declaredTokens = new Set<string>();
  for (const { root } of parsedRoots) {
    root.walkDecls(/^--/, (decl) => {
      declaredTokens.add(decl.prop);
    });
  }

  for (const { file, root } of parsedRoots) {
    const res = auditRoot(file, root, declaredTokens);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }

  return {
    errors,
    warnings,
    totalViolations: errors.length + warnings.length,
  };
}
