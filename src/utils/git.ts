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
  initialCommitMessage = "feat: initial project scaffold by mozole",
): Promise<boolean> {
  if (!(await isGitInstalled())) {
    return false;
  }

  const initResult = await run("git", ["init"], { cwd });
  if (initResult.exitCode !== 0) return false;

  await run("git", ["add", "."], { cwd });

  const commitResult = await run("git", ["commit", "-m", initialCommitMessage], {
    cwd,
    env: {
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "Mozole Studio",
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "studio@mozole.com",
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "Mozole Studio",
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "studio@mozole.com",
    },
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

  const addResult = await run("git", ["add", "."], { cwd });
  if (addResult.exitCode !== 0) {
    return { success: false, output: addResult.stderr };
  }

  const commitResult = await run("git", ["commit", "-m", message], { cwd });
  return {
    success: commitResult.exitCode === 0,
    output: commitResult.stdout || commitResult.stderr,
  };
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
