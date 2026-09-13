import fs from "node:fs/promises";
import path from "node:path";
import { render } from "ink";
import pc from "picocolors";
import prompts from "prompts";
import React from "react";
import { serverManager } from "../server/manager.js";
import { CockpitApp } from "../ui/CockpitApp.js";
import { exists, findProjectRoot, findPrototypeRoot } from "../utils/fs.js";
import { doctorCommand } from "./doctor.js";
import { phaseCommand } from "./phase.js";
import { repomapCommand } from "./repomap.js";
import { verifyCommand } from "./verify.js";

export interface UiOptions {
  action?: string;
  cwd?: string;
  interactive?: boolean;
  project?: string;
}

export async function uiCommand(options: UiOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const protoRoot = await findPrototypeRoot(cwd);
  let projectRoot = await findProjectRoot(cwd);
  if (projectRoot === protoRoot) projectRoot = null;

  let activeProject = options.project ?? (projectRoot ? path.basename(projectRoot) : null);
  const projects: string[] = [];

  if (protoRoot) {
    const projectsDir = path.join(protoRoot, "projects");
    if (await exists(projectsDir)) {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) projects.push(e.name);
      }
    }
  }

  // If in prototype workspace and no project specified, prompt for selection if available
  if (!projectRoot && protoRoot && projects.length > 0) {
    if (options.project && projects.includes(options.project)) {
      activeProject = options.project;
      projectRoot = path.join(protoRoot, "projects", options.project);
    } else if (process.env.VITEST || options.interactive === false) {
      // In tests/headless, default to first project or prompt mock
      const choice = await prompts({
        type: "select",
        name: "project",
        message: "Select an active client project:",
        choices: projects.map((p) => ({ title: p, value: p })),
      });
      if (choice?.project) {
        activeProject = choice.project;
        projectRoot = path.join(protoRoot, "projects", choice.project);
      } else {
        activeProject = projects[0];
        projectRoot = path.join(protoRoot, "projects", projects[0]);
      }
    } else {
      const choice = await prompts({
        type: "select",
        name: "project",
        message: "Select an active client project:",
        choices: projects.map((p) => ({ title: p, value: p })),
      });
      if (choice?.project) {
        activeProject = choice.project;
        projectRoot = path.join(protoRoot, "projects", choice.project);
      }
    }
  }

  const targetPath = projectRoot ?? cwd;
  const projectName = activeProject ?? path.basename(targetPath);

  // If programmatic action was requested (or prompted during non-interactive test)
  let requestedAction = options.action;
  if (!requestedAction && (process.env.VITEST || options.interactive === false)) {
    const promptRes = await prompts({
      type: "select",
      name: "action",
      message: "Select operation:",
      choices: [
        { title: "[01] Phase Status", value: "phase-status" },
        { title: "[02] Phase Next", value: "phase-next" },
        { title: "[03] Verify", value: "verify" },
        { title: "[04] Server Start", value: "server-start" },
        { title: "[05] Server Stop", value: "server-stop" },
        { title: "[06] Repomap", value: "repomap" },
        { title: "[07] Doctor", value: "doctor" },
      ],
    });
    requestedAction = promptRes?.action;
  }

  if (requestedAction) {
    try {
      switch (requestedAction) {
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
          await serverManager.startServer(projectName, targetPath);
          break;
        case "server-stop":
          serverManager.stopServer(projectName);
          break;
        case "repomap":
          await repomapCommand({ action: "sync", cwd: targetPath });
          break;
        case "doctor":
          await doctorCommand();
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
    return;
  }

  // Fullscreen Ink TUI Mode (Alternate Screen Buffer)
  const isTTY = Boolean(process.stdout.isTTY);
  if (isTTY) {
    process.stdout.write("\x1b[?1049h\x1b[H");
  }

  const restore = () => {
    if (isTTY) {
      process.stdout.write("\x1b[?1049l\x1b[?25h");
    }
  };

  process.once("SIGINT", restore);
  process.once("SIGTERM", restore);

  try {
    const instance = render(
      React.createElement(CockpitApp, {
        projectRoot: targetPath,
        activeProject: projectName,
        protoRoot,
        projects,
        onExit: restore,
      }),
    );

    await instance.waitUntilExit();
  } finally {
    restore();
    process.removeListener("SIGINT", restore);
    process.removeListener("SIGTERM", restore);
  }
}
