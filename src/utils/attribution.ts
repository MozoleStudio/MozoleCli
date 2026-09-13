import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { inspectContent } from "../hygiene/rules.js";

export interface AttributionMatch {
  file: string;
  line: number;
  match: string;
}

const IGNORED_SEGMENTS = new Set(["node_modules", ".git", "dist", "archive", "coverage", "build"]);

const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".php",
  ".json",
  ".md",
]);

export function findAttributionInContent(content: string, filePath: string): AttributionMatch[] {
  const lines = content.split(/\r?\n/);
  return inspectContent(content, filePath)
    .filter((finding) =>
      [
        "generator-attribution",
        "synthetic-trailer",
        "generator-badge",
        "assistant-boilerplate",
        "tool-link",
      ].includes(finding.rule),
    )
    .map((finding) => ({
      file: finding.file,
      line: finding.line,
      match: lines[finding.line - 1].trim(),
    }));
}

export async function scanProjectAttribution(rootDir: string): Promise<AttributionMatch[]> {
  const matches: AttributionMatch[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_SEGMENTS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          try {
            const content = await readFile(fullPath, "utf8");
            const relPath = path.relative(rootDir, fullPath);
            matches.push(...findAttributionInContent(content, relPath));
          } catch {}
        }
      }
    }
  }

  await walk(rootDir);
  return matches;
}
