import { readFile } from "node:fs/promises";
import { type HygieneOptions, checkRepository } from "../hygiene/index.js";
import { inspectContent } from "../hygiene/rules.js";

export async function hygieneCommand(
  options: HygieneOptions & { json?: boolean; message?: string } = {},
): Promise<number> {
  try {
    const report = options.message
      ? {
          schemaVersion: 1,
          findings: inspectContent(await readFile(options.message, "utf8"), "commit-message", true),
          changed: [],
          skipped: [],
          scanned: 1,
        }
      : await checkRepository(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(
        `Repository hygiene: ${report.findings.length} findings, ${report.changed.length} files updated, ${report.skipped.length} files skipped.`,
      );
      for (const finding of report.findings)
        console.log(
          `${finding.file}:${finding.line} ${finding.rule} (${finding.fixable ? "cleanup available" : "review required"})`,
        );
      for (const skipped of report.skipped)
        console.log(`${skipped.file}: skipped (${skipped.reason})`);
    }
    return report.findings.length > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) console.log(JSON.stringify({ schemaVersion: 1, error: message }));
    else console.error(message);
    return 2;
  }
}
