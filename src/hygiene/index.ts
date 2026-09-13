import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { type Finding, inspectContent, isToolArtifact, replacement } from "./rules.js";

export interface HygieneOptions {
  cwd?: string;
  fix?: boolean;
  strict?: boolean;
  history?: number;
}
export interface HygieneReport {
  schemaVersion: number;
  repository: string;
  findings: Finding[];
  changed: string[];
  skipped: { file: string; reason: string }[];
  scanned: number;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await run("git", args, { cwd, timeoutMs: 30_000 });
  if (result.exitCode !== 0) throw new Error(`Repository operation failed: ${args[0]}`);
  return result.stdout;
}

export function isOrganizationRemote(remote: string): boolean {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)mozolestudio\/[a-z0-9_.-]+(?:\.git)?$/i.test(
    remote.trim(),
  );
}

export async function checkRepository(options: HygieneOptions = {}): Promise<HygieneReport> {
  const cwd = await realpath(options.cwd ?? process.cwd());
  const root = await realpath((await git(cwd, ["rev-parse", "--show-toplevel"])).trim());
  if (root !== cwd) throw new Error("Select the repository root with --path.");
  const count = options.history ?? 0;
  if (!Number.isSafeInteger(count) || count < 0 || count > 10000)
    throw new Error("History must be an integer from 0 to 10000.");
  if (options.fix) {
    const remote = await git(root, ["remote", "get-url", "origin"]);
    if (!isOrganizationRemote(remote))
      throw new Error("Cleanup requires an origin in github.com/mozolestudio.");
    if ((await git(root, ["status", "--porcelain", "--untracked-files=all"])).trim())
      throw new Error("Cleanup requires a clean working tree. Commit or stash changes first.");
  }
  const files = [
    ...new Set(
      (await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]))
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const report: HygieneReport = {
    schemaVersion: 1,
    repository: path.basename(root),
    findings: [],
    changed: [],
    skipped: [],
    scanned: 0,
  };
  const edits: { file: string; before: string; after: string; mode: number }[] = [];
  for (const file of files) {
    const segments = file.split("/");
    if (
      segments.some((part) =>
        ["node_modules", ".git", "vendor", "dist", "build", "coverage"].includes(part),
      )
    ) {
      report.skipped.push({ file, reason: "dependency-or-output" });
      continue;
    }
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe repository path.");
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      report.skipped.push({ file, reason: "missing" });
      continue;
    }
    if (!info.isFile() || info.isSymbolicLink()) {
      report.skipped.push({ file, reason: "non-regular-or-external" });
      continue;
    }
    const canonical = await realpath(absolute);
    if (canonical !== absolute) {
      report.skipped.push({ file, reason: "non-regular-or-external" });
      continue;
    }
    if (info.size > 2 * 1024 * 1024) {
      report.skipped.push({ file, reason: "size-limit" });
      continue;
    }
    const bytes = await readFile(absolute);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      report.skipped.push({ file, reason: "non-utf8" });
      continue;
    }
    if (content.includes("\0")) {
      report.skipped.push({ file, reason: "binary" });
      continue;
    }
    report.scanned++;
    if (isToolArtifact(file))
      report.findings.push({ file, line: 1, rule: "tool-artifact", fixable: false });
    const findings = inspectContent(content, file, options.strict);
    const lines = content.split(/(?<=\n)/);
    if (options.fix) {
      for (const finding of findings.filter((item) => item.fixable)) {
        const original = lines[finding.line - 1];
        const ending = original.endsWith("\r\n") ? "\r\n" : original.endsWith("\n") ? "\n" : "";
        lines[finding.line - 1] =
          replacement(original.replace(/\r?\n$/, ""), file, finding.rule) + ending;
      }
      const after = lines.join("");
      if (after !== content) edits.push({ file, before: content, after, mode: info.mode });
      report.findings.push(...inspectContent(after, file, options.strict));
    } else report.findings.push(...findings);
  }
  if (count > 0) {
    const history = await git(root, [
      "log",
      `-${count}`,
      "--format=%H%x00%B%x00",
      "--no-show-signature",
    ]);
    const parts = history.split("\0");
    for (let i = 0; i + 1 < parts.length; i += 2) {
      report.findings.push(
        ...inspectContent(parts[i + 1], `commit:${parts[i].trim()}`, options.strict).map(
          (finding) => ({ ...finding, fixable: false }),
        ),
      );
    }
  }
  for (const edit of edits) {
    const absolute = path.join(root, edit.file);
    if ((await realpath(absolute)) !== absolute || !(await lstat(absolute)).isFile())
      throw new Error(`File path changed during cleanup: ${edit.file}`);
    if ((await readFile(absolute, "utf8")) !== edit.before)
      throw new Error(`File changed during cleanup: ${edit.file}`);
    await atomicWrite(absolute, edit.after, { mode: edit.mode });
    report.changed.push(edit.file);
  }
  return report;
}
