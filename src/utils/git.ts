import path from "node:path";
import { exists } from "./fs.js";
import { run } from "./process.js";

export async function isGitInstalled(): Promise<boolean> {
  try {
    const res = await run("git", ["--version"]);
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  return exists(path.join(cwd, ".git"));
}

export async function initGit(
  cwd: string,
  initialCommitMessage = "feat: initialize project scaffold",
): Promise<boolean> {
  if (!(await isGitInstalled())) {
    return false;
  }

  const initResult = await run("git", ["init"], { cwd });
  if (initResult.exitCode !== 0) return false;

  const addResult = await run("git", ["add", "."], { cwd });
  if (addResult.exitCode !== 0) return false;

  const commitResult = await run("git", ["commit", "-m", initialCommitMessage], {
    cwd,
  });

  return commitResult.exitCode === 0;
}

export async function stageAndCommit(
  cwd: string,
  message: string,
): Promise<{ success: boolean; output: string }> {
  if (!(await isGitRepo(cwd))) {
    return { success: false, output: "Not a git repository" };
  }

  const snapshot = await run("git", ["write-tree"], { cwd });
  if (snapshot.exitCode !== 0) return { success: false, output: snapshot.stderr };
  let outcome: { success: boolean; output: string };
  try {
    const addResult = await run("git", ["add", "."], { cwd });
    if (addResult.exitCode !== 0) {
      outcome = { success: false, output: addResult.stderr };
    } else {
      const result = await run("git", ["commit", "-m", message], { cwd });
      outcome = { success: result.exitCode === 0, output: result.stdout + result.stderr };
    }
  } catch (error) {
    outcome = { success: false, output: String(error) };
  }
  if (!outcome.success) {
    const restored = await run("git", ["read-tree", snapshot.stdout.trim()], { cwd });
    if (restored.exitCode !== 0) {
      throw new Error(`Unable to restore Git index: ${restored.stderr}`);
    }
  }
  return outcome;
}

export function formatPhaseCommitMessage(phaseNumber: number | string, phaseTitle: string): string {
  const num = String(phaseNumber).padStart(2, "0");
  const normalizedTitle = phaseTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `feat(phase-${num}): ${normalizedTitle}`;
}
