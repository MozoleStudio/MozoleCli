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
  const match = content.match(/^\*\*Current Phase:\*\*\s*Phase\s*([^\r\n]+)$/im);
  const phaseRaw = match?.[1]?.trim() ?? "";
  if (!match || !PHASES.some((phase) => phase.id === phaseRaw)) {
    throw new Error(`Invalid current phase in ${statusPath}; expected Phase 00 through 10.`);
  }
  const currentPhase = phaseRaw;

  return { currentPhase, content };
}

export async function phaseCommand(options: PhaseCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = (await findProjectRoot(cwd)) ?? cwd;

  const { currentPhase, content } = await getProjectPhaseStatus(projectRoot);
  const action = options.action ?? "status";
  if (!["status", "next", "reopen"].includes(action)) {
    throw new Error(`Invalid phase action '${action}'. Expected status, next, or reopen.`);
  }

  const persistPhase = async (phase: string, message: string) => {
    const statusPath = path.join(projectRoot, "docs", "phases", "status.md");
    await atomicWrite(statusPath, generatePhasesStatusMd(phase));
    if (await isGitRepo(projectRoot)) {
      try {
        const result = await stageAndCommit(projectRoot, message);
        if (!result.success) throw new Error(result.output);
      } catch (error) {
        await atomicWrite(statusPath, content);
        throw new Error(`Phase change not committed; status restored. ${String(error)}`);
      }
      console.log(pc.green(`  ✓ Git commit created: ${message}`));
    }
  };

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
        "Routine maintenance can continue here. Reopen a phase only for architectural changes.\n",
      );
      return;
    }

    const currentDef = PHASES.find((p) => p.id === currentPhase);
    const nextNum = currentNum + 1;
    const nextPhase = String(nextNum).padStart(2, "0");
    const nextDef = PHASES.find((p) => p.id === nextPhase);

    console.log(pc.cyan(`\nAdvancing from Phase ${currentPhase} to Phase ${nextPhase}...`));

    await persistPhase(
      nextPhase,
      formatPhaseCommitMessage(
        currentPhase,
        `complete ${currentDef?.name ?? "phase"} and advance to phase ${nextPhase}`,
      ),
    );

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
    if (Number(targetPhaseId) >= Number(currentPhase)) {
      throw new Error(
        "Only a completed phase can be reopened. Use 'mozole phase next' to advance.",
      );
    }

    console.log(pc.yellow(`\nReopening Phase ${targetPhaseId} for post-launch maintenance...`));
    await persistPhase(
      targetPhaseId,
      `chore(phase-${targetPhaseId}): reopen phase for maintenance`,
    );

    console.log(pc.green(`✓ Reopened Phase ${targetPhaseId}: ${targetDef.name}\n`));
  }
}
