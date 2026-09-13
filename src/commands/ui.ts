import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import prompts from "prompts";
import { exists, findProjectRoot, findPrototypeRoot } from "../utils/fs.js";
import { CLI_VERSION } from "../version.js";
import { doctorCommand } from "./doctor.js";
import { getProjectPhaseStatus, phaseCommand } from "./phase.js";
import { verifyCommand } from "./verify.js";

export async function uiCommand(): Promise<void> {
  const cwd = process.cwd();
  console.clear();
  console.log(pc.bold(pc.cyan(`\n⚡ MOZOLE STUDIO COCKPIT (v${CLI_VERSION})`)));
  console.log(pc.dim("Mozole Studio Development & Verification Cockpit\n"));

  const protoRoot = await findPrototypeRoot(cwd);
  let projectRoot = await findProjectRoot(cwd);
  if (projectRoot === protoRoot) projectRoot = null;

  let activeProject = projectRoot ? path.basename(projectRoot) : null;
  let currentPhase = "00";

  if (projectRoot) {
    try {
      const status = await getProjectPhaseStatus(projectRoot);
      currentPhase = status.currentPhase;
    } catch {}
  } else if (protoRoot) {
    // List available projects in prototype root
    const projectsDir = path.join(protoRoot, "projects");
    if (await exists(projectsDir)) {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      const projects = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      if (projects.length > 0) {
        const choice = await prompts({
          type: "select",
          name: "project",
          message: "Select an active client project:",
          choices: projects.map((p) => ({ title: p, value: p })),
        });
        if (choice.project) {
          activeProject = choice.project;
          const chosenRoot = path.join(projectsDir, choice.project);
          projectRoot = chosenRoot;
          try {
            const status = await getProjectPhaseStatus(chosenRoot);
            currentPhase = status.currentPhase;
          } catch {}
        }
      }
    }
  }

  if (activeProject) {
    console.log(
      `Active Project: ${pc.bold(pc.green(activeProject))} | Current Phase: ${pc.bold(pc.yellow(`Phase ${currentPhase}`))}\n`,
    );
  }

  const { action } = await prompts({
    type: "select",
    name: "action",
    message: "Select an operation:",
    choices: [
      { title: "📋 View Phase Status & Checklist", value: "phase-status" },
      { title: "🚀 Advance to Next Phase", value: "phase-next" },
      { title: "🛡️  Run Full Verification (verify)", value: "verify" },
      { title: "🩺 Run System Doctor Diagnostics", value: "doctor" },
      { title: "🚪 Exit", value: "exit" },
    ],
  });

  if (!action || action === "exit") {
    console.log(pc.gray("\nGoodbye.\n"));
    return;
  }

  switch (action) {
    case "phase-status":
      await phaseCommand({ action: "status", cwd: projectRoot ?? cwd });
      break;
    case "phase-next":
      await phaseCommand({ action: "next", cwd: projectRoot ?? cwd });
      break;
    case "verify":
      if (!(await verifyCommand({ cwd: projectRoot ?? cwd }))) process.exitCode = 1;
      break;
    case "doctor":
      await doctorCommand();
      break;
  }
}
