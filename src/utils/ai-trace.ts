import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface AiTraceMatch {
  file: string;
  line: number;
  match: string;
}

const AI_PATTERNS = [
  /\b(?:generated|authored|written|created|scaffolded)\s+(?:by|with|using)\s+(?:an?\s+)?(?:ai|claude|chatgpt|openai|cursor|copilot|gemini|antigravity|v0|bolt|lovable)\b/i,
  /\bco-authored-by:\s*(?:claude|cursor|copilot|assistant|gpt|chatgpt|bot|ai)\b/i,
  /\bauto-generated\s+(?:by|with)\s+(?:claude|cursor|ai|copilot)\b/i,
  /\b\/\*\s*ai-(?:prompt|trace|instruction)\b/i,
];

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

export function findAiTracesInContent(content: string, filePath: string): AiTraceMatch[] {
  const matches: AiTraceMatch[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of AI_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        matches.push({
          file: filePath,
          line: i + 1,
          match: match[0],
        });
        break;
      }
    }
  }

  return matches;
}

export async function scanProjectForAiTraces(rootDir: string): Promise<AiTraceMatch[]> {
  const matches: AiTraceMatch[] = [];

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
            matches.push(...findAiTracesInContent(content, relPath));
          } catch {}
        }
      }
    }
  }

  await walk(rootDir);
  return matches;
}
