export interface Finding {
  file: string;
  line: number;
  rule: string;
  fixable: boolean;
}

const vendors =
  /\b(?:ai|artificial intelligence|llm|claude|chatgpt|openai|anthropic|copilot|cursor|gemini|antigravity|codex|jules|gpt(?:-\w+)?|v0|bolt|lovable|replit|windsurf|aider|cline|roo code|tabnine|codeium|devin)\b/i;
const attribution =
  /\b(?:generated|authored|written|created|scaffolded|built|powered|assisted)\s+(?:by|with|using)\b/i;
const trailer = /^(?:\s*(?:\/\/|#|<!--|\*)?\s*)(?:co-authored-by|signed-off-by|generated-by):/i;
const bot = /(?:\[bot\]|\bbot\b|noreply@(?:anthropic|openai)\.com)/i;
const metadata =
  /\b(?:ai[-_](?:prompt|trace|instruction|generated)|model[-_ ]?(?:name|id)|prompt[-_ ]?(?:id|tokens)|conversation[-_ ]?id|session[-_ ]?id)\b/i;
const artifacts =
  /(?:^|\/)(?:\.cursor(?:rules|ignore)?|\.claude|\.codex|\.aider[^/]*|\.windsurf(?:rules)?|\.clinerules|\.roo|\.bolt|\.lovable|CLAUDE\.md|GEMINI\.md|copilot-instructions\.md)(?:\/|$)/i;

export function isToolArtifact(file: string): boolean {
  return artifacts.test(file);
}

export function inspectContent(content: string, file: string, strict = false): Finding[] {
  const findings: Finding[] = [];
  const multilineQuotes = content.split(/\r?\n/).some((line) => {
    const unescaped = line.replace(/\\./g, "");
    return ['"', "'"].some((quote) => unescaped.split(quote).length % 2 === 0);
  });
  const ambiguous =
    multilineQuotes ||
    /<<|^=begin/m.test(content) ||
    /`|"""|'''|\\\r?\n|<script\b|<style\b/i.test(content) ||
    /\.(?:ya?ml|toml|svg|xml|vue|svelte)$/i.test(file);
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    let rule: string | undefined;
    if (trailer.test(line) && (vendors.test(line) || bot.test(line))) rule = "synthetic-trailer";
    else if (attribution.test(line) && vendors.test(line)) rule = "generator-attribution";
    else if (/!\[.*\]\(|<img\b/i.test(line) && vendors.test(line)) rule = "generator-badge";
    else if (
      /\b(?:as an? (?:ai|language model)|i am an? (?:ai|language model)|begin (?:ai|assistant) (?:response|output)|end (?:ai|assistant) (?:response|output))\b/i.test(
        line,
      )
    )
      rule = "assistant-boilerplate";
    else if (
      /https?:\/\/(?:www\.)?(?:chatgpt\.com|claude\.ai|v0\.dev|lovable\.dev|bolt\.new)\//i.test(
        line,
      )
    )
      rule = "tool-link";
    else if (metadata.test(line)) rule = "generator-metadata";
    else if (strict && vendors.test(line)) rule = "vendor-reference";
    if (rule)
      findings.push({
        file,
        line: index + 1,
        rule,
        fixable: !ambiguous && replacement(line, file, rule) !== null,
      });
  }
  return findings;
}

// Only complete, single-line attribution comments are mechanically neutralized.
// General prose, executable strings, legal notices and human trailers require review.
export function replacement(line: string, file: string, rule: string): string | null {
  if (rule !== "generator-attribution") return null;
  if (/(?:copyright|licen[cs]e|SPDX|@preserve|@license)/i.test(line)) return null;
  if (/(?:^|\/)(?:AGENTS\.md|LICENSE[^/]*|NOTICE[^/]*|COPYING[^/]*)$/i.test(file)) return null;
  const sentence =
    /^(?:generated|authored|written|created|scaffolded|built|powered|assisted)\s+(?:by|with|using)\s+(?:an?\s+)?[\w .-]+[.!]?$/i;
  const match = /^(\s*)(\/\/|#|<!--|\/\*)\s*(.*?)\s*$/.exec(line);
  if (!match) return null;
  const [, indent, marker, raw] = match;
  const ext = file.split(".").pop()?.toLowerCase();
  if (
    marker === "//" &&
    !["ts", "tsx", "js", "jsx", "mjs", "cjs", "java", "go", "rs", "c", "cpp", "h", "cs"].includes(
      ext ?? "",
    )
  )
    return null;
  if (marker === "#" && !["py", "sh", "bash", "rb", "yaml", "yml", "toml"].includes(ext ?? ""))
    return null;
  if (
    marker === "<!--" &&
    !["html", "htm", "md", "svg", "xml", "vue", "svelte"].includes(ext ?? "")
  )
    return null;
  if (
    marker === "/*" &&
    !["ts", "tsx", "js", "jsx", "css", "scss", "c", "cpp", "h", "java", "cs"].includes(ext ?? "")
  )
    return null;
  const body =
    marker === "<!--"
      ? raw.replace(/-->$/, "").trim()
      : marker === "/*"
        ? raw.replace(/\*\/$/, "").trim()
        : raw;
  if ((marker === "<!--" && !raw.endsWith("-->")) || (marker === "/*" && !raw.endsWith("*/")))
    return null;
  if (!sentence.test(body) || !vendors.test(body)) return null;
  // Require the entire payload to be a known signature, not explanatory prose.
  const author = body
    .replace(attribution, "")
    .trim()
    .replace(/^(?:an?\s+)/i, "")
    .replace(/[.!]$/, "");
  const vendorMatch = vendors.exec(author);
  if (!vendorMatch || vendorMatch[0].length !== author.length) return null;
  if (marker === "<!--") return `${indent}<!-- Project maintenance. -->`;
  if (marker === "/*") return `${indent}/* Project maintenance. */`;
  return `${indent}${marker} Project maintenance.`;
}
