import path from "node:path";
import { init, parse as parseModule } from "es-module-lexer";
import { type DefaultTreeAdapterMap, parse as parseHtml } from "parse5";
import postcss from "postcss";
import type { PerformanceFinding } from "./model.js";

export interface DocumentResources {
  js: string[];
  css: string[];
  inlineJs: string[];
  inlineCss: string[];
  base: string;
}
export interface Dependencies {
  static: string[];
  dynamic: string[];
  unresolvedDynamic: boolean;
}
export async function moduleDependencies(source: string): Promise<Dependencies> {
  await init;
  const [imports] = parseModule(source);
  return {
    static: imports
      .filter((item) => item.d === -1 && item.n !== undefined)
      .map((item) => item.n as string),
    dynamic: imports
      .filter((item) => item.d >= 0 && item.n !== undefined)
      .map((item) => item.n as string),
    unresolvedDynamic: imports.some((item) => item.d >= 0 && item.n === undefined),
  };
}

export function documentResources(
  source: string,
  url: string,
  findings: PerformanceFinding[],
): DocumentResources {
  const result: DocumentResources = { js: [], css: [], inlineJs: [], inlineCss: [], base: url };
  const document = parseHtml(source);
  let foundBase = false;
  const elements: DefaultTreeAdapterMap["element"][] = [];
  const pending: DefaultTreeAdapterMap["node"][] = [document];
  while (pending.length) {
    const node = pending.pop() as DefaultTreeAdapterMap["node"];
    if ("tagName" in node) elements.push(node);
    if ("childNodes" in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i]);
    }
  }
  for (const element of elements) {
    const attrs = Object.fromEntries(element.attrs.map((attr) => [attr.name, attr.value]));
    if (element.tagName === "base" && attrs.href !== undefined && !foundBase) {
      result.base = new URL(attrs.href, url).href;
      foundBase = true;
    }
  }
  for (const element of elements) {
    const attrs = Object.fromEntries(element.attrs.map((attr) => [attr.name, attr.value]));
    const text = element.childNodes
      .filter((node) => node.nodeName === "#text")
      .map((node) => (node as DefaultTreeAdapterMap["textNode"]).value)
      .join("");
    if (element.tagName === "script") {
      const type = (attrs.type ?? "").trim().toLowerCase();
      if (type === "importmap")
        findings.push({
          target: url,
          rule: "import-map",
          severity: "warning",
          message: "Import maps are not resolved; bare imports are reported separately.",
        });
      if (
        !["", "module", "text/javascript", "application/javascript"].includes(type) ||
        "nomodule" in attrs
      )
        continue;
      if (attrs.src) result.js.push(attrs.src);
      else if (text.trim()) result.inlineJs.push(text);
    }
    if (element.tagName === "style" && (!attrs.type || attrs.type.toLowerCase() === "text/css"))
      result.inlineCss.push(text);
    if (element.tagName !== "link" || !attrs.href) continue;
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("stylesheet") && !(rel.includes("alternate") || "disabled" in attrs))
      result.css.push(attrs.href);
    if (
      rel.includes("modulepreload") ||
      (rel.includes("preload") && attrs.as?.toLowerCase() === "script")
    )
      result.js.push(attrs.href);
    if (rel.includes("preload") && attrs.as?.toLowerCase() === "style") result.css.push(attrs.href);
  }
  return result;
}

export function cssImports(source: string): string[] {
  const imports: string[] = [];
  postcss.parse(source).walkAtRules(/^import$/i, (rule) => {
    const match =
      /^\s*(?:url\(\s*(?:"([^"\\]*)"|'([^'\\]*)'|([^\s)'"\\]+))\s*\)|"([^"\\]*)"|'([^'\\]*)')/i.exec(
        rule.params,
      );
    if (!match) throw new Error("Unsupported CSS import syntax; normalize the build output.");
    imports.push(match.slice(1).find((value) => value !== undefined) as string);
  });
  return imports;
}

export function routeUrl(file: string, base: string): string {
  const encoded = file.split("/").map(encodeURIComponent).join("/");
  return (
    base +
    (path.posix.basename(file) === "index.html" ? encoded.slice(0, -"index.html".length) : encoded)
  );
}

export function localReference(
  reference: string,
  importer: string,
  base: string,
  module: boolean,
): { file?: string; reason?: string } {
  if (module && !/^(?:\.{1,2}\/|\/|[a-z][a-z\d+.-]*:)/i.test(reference))
    return { reason: "bare-import" };
  if (reference.includes("\\")) throw new Error("Backslashes are not supported in asset URLs.");
  const url = new URL(reference, importer);
  if (url.origin !== "https://mozole.invalid") return { reason: "external-resource" };
  if (!url.pathname.startsWith(base))
    throw new Error("Resource URL escapes the configured deployment base.");
  let relative: string;
  try {
    relative = decodeURIComponent(url.pathname.slice(base.length));
  } catch {
    throw new Error("Malformed encoded asset URL.");
  }
  if (
    !relative ||
    relative.includes("\0") ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    relative.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("Unsafe asset URL.");
  return { file: relative };
}
