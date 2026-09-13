import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import prompts from "prompts";
import { serverManager } from "../server/manager.js";
import { exists, findProjectRoot, findPrototypeRoot } from "../utils/fs.js";
import { CLI_VERSION } from "../version.js";
import { doctorCommand } from "./doctor.js";
import { getProjectPhaseStatus, phaseCommand } from "./phase.js";
import { repomapCommand } from "./repomap.js";
import { verifyCommand } from "./verify.js";

export interface UiOptions {
  cwd?: string;
  interactive?: boolean;
}

function renderBoxHeader(title: string, width = 74): string {
  const prefix = `┌─ ${title} `;
  const fill = Math.max(0, width - prefix.length - 1);
  return `${prefix}${"─".repeat(fill)}┐`;
}

function renderBoxFooter(width = 74): string {
  return `└${"─".repeat(width - 2)}┘`;
}

function renderBoxLine(content: string, width = 74): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: standard ANSI escape sequence stripper
  const clean = content.replace(/\u001b\[[0-9;]*m/g, "");
  const pad = Math.max(0, width - clean.length - 4);
  return `│  ${content}${" ".repeat(pad)}│`;
}

export async function uiCommand(options: UiOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const protoRoot = await findPrototypeRoot(cwd);
  let projectRoot = await findProjectRoot(cwd);
  if (projectRoot === protoRoot) projectRoot = null;

  let activeProject = projectRoot ? path.basename(projectRoot) : null;
  const isWorkspace = Boolean(protoRoot);

  if (!projectRoot && protoRoot) {
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
        if (choice?.project) {
          activeProject = choice.project;
          projectRoot = path.join(projectsDir, choice.project);
        }
      }
    }
  }

  const isTest = Boolean(process.env.VITEST || options.interactive === false);

  while (true) {
    let currentPhase = "--";
    const targetPath = projectRoot ?? cwd;

    if (projectRoot) {
      try {
        const status = await getProjectPhaseStatus(projectRoot);
        currentPhase = status.currentPhase;
      } catch {}
    }

    const runningServer = activeProject ? serverManager.getServer(activeProject) : undefined;

    if (!isTest) {
      console.clear();
      console.log(pc.cyan(renderBoxHeader(`MOZOLE COCKPIT // DEV ENGINE v${CLI_VERSION}`)));
      if (protoRoot) {
        console.log(renderBoxLine(`${pc.dim("WORKSPACE :")} ${pc.white(protoRoot)}`));
      }
      console.log(
        renderBoxLine(
          `${pc.dim("PROJECT   :")} ${activeProject ? pc.bold(pc.green(activeProject)) : pc.yellow("None (Root)")}`,
        ),
      );
      console.log(
        renderBoxLine(
          `${pc.dim("PHASE     :")} ${currentPhase !== "--" ? pc.bold(pc.yellow(`Phase ${currentPhase}`)) : pc.dim("No active phase")}`,
        ),
      );
      if (runningServer) {
        console.log(
          renderBoxLine(
            `${pc.dim("SERVER    :")} ${pc.green("● RUNNING")} ${pc.cyan(runningServer.url)} ${pc.dim(`(PID ${runningServer.process.pid})`)}`,
          ),
        );
      } else {
        console.log(renderBoxLine(`${pc.dim("SERVER    :")} ${pc.dim("○ STOPPED")}`));
      }
      console.log(pc.cyan(renderBoxFooter()));
      console.log();
    }

    const choices: prompts.Choice[] = [
      { title: "[01] Phase Status & Checklist", value: "phase-status" },
      { title: "[02] Advance to Next Phase", value: "phase-next" },
      { title: "[03] Run Full Verification (verify)", value: "verify" },
    ];

    if (activeProject && projectRoot) {
      if (runningServer) {
        choices.push(
          { title: "[04] Stop Development Server", value: "server-stop" },
          { title: "[05] View Live Server Logs", value: "server-logs" },
        );
      } else {
        choices.push({ title: "[04] Start Development Server", value: "server-start" });
      }
    }

    choices.push(
      { title: "[06] Sync Repomap Index", value: "repomap" },
      { title: "[07] Run System Doctor Diagnostics", value: "doctor" },
    );

    if (isWorkspace && protoRoot) {
      choices.push({ title: "[08] Switch Active Project", value: "switch-project" });
    }

    choices.push({ title: "[00] Exit", value: "exit" });

    const promptRes = await prompts({
      type: "select",
      name: "action",
      message: "Select operation:",
      choices,
    });

    const action = promptRes?.action;

    if (!action || action === "exit") {
      if (!isTest) {
        console.log(pc.dim("\n[cockpit] Session terminated.\n"));
      }
      break;
    }

    try {
      switch (action) {
        case "phase-status":
          await phaseCommand({ action: "status", cwd: targetPath });
          break;
        case "phase-next":
          await phaseCommand({ action: "next", cwd: targetPath });
          break;
        case "verify":
          await verifyCommand({ cwd: targetPath });
          break;
        case "server-start":
          if (activeProject && projectRoot) {
            console.log(pc.cyan(`\n[server] Starting local dev server for ${activeProject}...`));
            const srv = await serverManager.startServer(activeProject, projectRoot);
            console.log(
              pc.green(
                `[server] ✓ Server running at ${srv.url} (Port ${srv.port}, PID ${srv.process.pid})`,
              ),
            );
          }
          break;
        case "server-stop":
          if (activeProject) {
            serverManager.stopServer(activeProject);
            console.log(pc.yellow(`\n[server] ✓ Server stopped for ${activeProject}.`));
          }
          break;
        case "server-logs":
          if (runningServer) {
            console.log(
              pc.cyan(`\n┌─ LIVE LOGS (${runningServer.projectName}) ────────────────────┐`),
            );
            if (runningServer.recentLogs.length === 0) {
              console.log(pc.dim("│  (No log entries captured yet)"));
            } else {
              for (const l of runningServer.recentLogs.slice(-25)) {
                console.log(`│  ${l}`);
              }
            }
            console.log(pc.cyan("└───────────────────────────────────────────────────────┘"));
          }
          break;
        case "repomap":
          await repomapCommand({ action: "sync", cwd: targetPath });
          break;
        case "doctor":
          await doctorCommand();
          break;
        case "switch-project":
          if (protoRoot) {
            const projectsDir = path.join(protoRoot, "projects");
            if (await exists(projectsDir)) {
              const entries = await fs.readdir(projectsDir, { withFileTypes: true });
              const projects = entries.filter((e) => e.isDirectory()).map((e) => e.name);
              const switchChoice = await prompts({
                type: "select",
                name: "project",
                message: "Select client project:",
                choices: projects.map((p) => ({ title: p, value: p })),
              });
              if (switchChoice?.project) {
                activeProject = switchChoice.project;
                projectRoot = path.join(projectsDir, switchChoice.project);
              }
            }
          }
          break;
      }
    } catch (err: unknown) {
      console.log(pc.red("\n┌─ OPERATION ERROR ──────────────────────────────────────────┐"));
      const errMsg = err instanceof Error ? err.message : String(err);
      for (const line of errMsg.split("\n")) {
        console.log(pc.red(`│ [!] ${line}`));
      }
      console.log(pc.red("└────────────────────────────────────────────────────────────┘"));
    }

    if (!isTest) {
      console.log();
      await prompts({
        type: "text",
        name: "continue",
        message: "Press Enter to return to cockpit...",
      });
    }
  }
}
