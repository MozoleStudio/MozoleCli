import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { PHASES, generatePhasesStatusMd } from "../scaffold/phases.js";
import { atomicWrite, exists, findProjectRoot } from "../utils/fs.js";
import { formatPhaseCommitMessage, isGitRepo, stageAndCommit } from "../utils/git.js";

export interface PhaseCommandOptions {
  action?: "status" | "next" | "reopen";
  phaseId?: string;
  cwd?: string;
}

export async function getProjectPhaseStatus(
  projectRoot: string,
): Promise<{ currentPhase: string; content: string }> {
  const statusPath = path.join(projectRoot, "docs", "phases", "status.md");
  if (!(await exists(statusPath))) {
    throw new Error(
      `Phase status file not found: ${statusPath}. Run 'mozole adopt' or 'mozole new'.`,
    );
  }

  const content = await fs.readFile(statusPath, "utf8");
  const match = content.match(/\*\*Current Phase:\*\*\s*Phase\s*(\d{2})/i);
  const currentPhase = match ? match[1] : "00";

  return { currentPhase, content };
}

export async function phaseCommand(options: PhaseCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = (await findProjectRoot(cwd)) ?? cwd;

  const { currentPhase } = await getProjectPhaseStatus(projectRoot);
  const action = options.action ?? "status";

  if (action === "status") {
    console.log(
      pc.cyan(`\n📋 Mozole 10-Step Development Phases: ${pc.bold(`Phase ${currentPhase}`)}`),
    );
    console.log(pc.gray("═".repeat(65)));

    for (const p of PHASES) {
      const num = Number(p.id);
      const currentNum = Number(currentPhase);
      let badge = pc.gray("[PENDING]");
      if (num < currentNum) badge = pc.green("[COMPLETED]");
      else if (num === currentNum) badge = pc.yellow(pc.bold("[IN PROGRESS]"));

      console.log(`\n  Phase ${p.id}: ${pc.bold(p.name)} ${badge}`);
      console.log(`  ${pc.dim(p.description)}`);
      for (const item of p.checklist) {
        const mark =
          num < currentNum ? pc.green("✓") : num === currentNum ? pc.yellow("○") : pc.gray("•");
        console.log(`    ${mark} ${item}`);
      }
    }
    console.log(pc.gray(`\n${"═".repeat(65)}`));
    console.log(`Run ${pc.cyan("mozole phase next")} when current phase criteria are fulfilled.\n`);
    return;
  }

  if (action === "next") {
    const currentNum = Number(currentPhase);
    if (currentNum >= 10) {
      console.log(pc.green("\n🎉 All 10 phases completed! Project is production launched."));
      console.log(
        `For post-launch modifications, use ${pc.cyan("mozole phase reopen <number>")}.\n`,
      );
      return;
    }

    const currentDef = PHASES.find((p) => p.id === currentPhase);
    const nextNum = currentNum + 1;
    const nextPhase = String(nextNum).padStart(2, "0");
    const nextDef = PHASES.find((p) => p.id === nextPhase);

    console.log(pc.cyan(`\nAdvancing from Phase ${currentPhase} to Phase ${nextPhase}...`));

    // Update status.md
    const newStatusMd = generatePhasesStatusMd(nextPhase);
    const statusPath = path.join(projectRoot, "docs", "phases", "status.md");
    await atomicWrite(statusPath, newStatusMd);

    // Commit if git repository
    if (await isGitRepo(projectRoot)) {
      const commitMsg = formatPhaseCommitMessage(
        currentPhase,
        `complete ${currentDef?.name ?? "phase"} and advance to phase ${nextPhase}`,
      );
      const commitRes = await stageAndCommit(projectRoot, commitMsg);
      if (commitRes.success) {
        console.log(pc.green(`  ✓ Git commit created: ${commitMsg}`));
      }
    }

    console.log(pc.green(`\n✓ Advanced to Phase ${nextPhase}: ${nextDef?.name}`));
    console.log(`  ${nextDef?.description}`);
    console.log(pc.cyan("\nUpcoming Checklist:"));
    for (const item of nextDef?.checklist ?? []) {
      console.log(`  ○ ${item}`);
    }
    console.log();
    return;
  }

  if (action === "reopen") {
    const targetPhaseId = options.phaseId ? String(options.phaseId).padStart(2, "0") : undefined;
    if (!targetPhaseId) {
      throw new Error("Specify a phase ID to reopen, e.g. 'mozole phase reopen 02'");
    }

    const targetDef = PHASES.find((p) => p.id === targetPhaseId);
    if (!targetDef) {
      throw new Error(`Invalid phase ID '${targetPhaseId}'. Valid phases are 00 through 10.`);
    }

    console.log(pc.yellow(`\nReopening Phase ${targetPhaseId} for post-launch maintenance...`));
    const newStatusMd = generatePhasesStatusMd(targetPhaseId);
    const statusPath = path.join(projectRoot, "docs", "phases", "status.md");
    await atomicWrite(statusPath, newStatusMd);

    if (await isGitRepo(projectRoot)) {
      const commitMsg = `chore(phase-${targetPhaseId}): reopen phase for post-launch maintenance`;
      await stageAndCommit(projectRoot, commitMsg);
    }

    console.log(pc.green(`✓ Reopened Phase ${targetPhaseId}: ${targetDef.name}\n`));
  }
}
