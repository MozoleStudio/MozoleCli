import path from "node:path";
import { render } from "ink";
import pc from "picocolors";
import prompts from "prompts";
import React from "react";
import { serverManager } from "../server/manager.js";
import { CockpitApp, type CockpitTab } from "../ui/CockpitApp.js";
import {
  type DiscoveredProject,
  discoverWorkspaceProjects,
  findProjectRoot,
  findPrototypeRoot,
} from "../utils/fs.js";
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

  const discoveredProjects: DiscoveredProject[] = protoRoot
    ? await discoverWorkspaceProjects(protoRoot)
    : [];

  let activeProject = options.project ?? null;
  if (!activeProject && projectRoot) {
    const matched = discoveredProjects.find((p) => p.path === projectRoot);
    activeProject = matched ? matched.name : path.basename(projectRoot);
  }

  let initialTab: CockpitTab = "overview";

  // If in prototype / monorepo workspace and no project specified
  if (!projectRoot && protoRoot && discoveredProjects.length > 0) {
    if (options.project) {
      const matched = discoveredProjects.find(
        (p) =>
          p.name === options.project ||
          p.relative === options.project ||
          path.basename(p.path) === options.project,
      );
      if (matched) {
        activeProject = matched.name;
        projectRoot = matched.path;
      } else {
        activeProject = options.project;
        projectRoot = path.join(protoRoot, options.project);
      }
    } else if (process.env.VITEST || options.interactive === false) {
      // In automated tests or headless programmatic mode, prompt for selection if available
      const choice = await prompts({
        type: "select",
        name: "project",
        message: "Select an active client project:",
        choices: discoveredProjects.map((p) => ({ title: p.name, value: p.name })),
      });
      if (choice?.project) {
        const found = discoveredProjects.find((p) => p.name === choice.project);
        activeProject = choice.project;
        projectRoot = found ? found.path : path.join(protoRoot, choice.project);
      } else {
        activeProject = discoveredProjects[0].name;
        projectRoot = discoveredProjects[0].path;
      }
    } else {
      // In interactive terminal at monorepo root: default to first project and open projects explorer tab!
      activeProject = discoveredProjects[0].name;
      projectRoot = discoveredProjects[0].path;
      initialTab = "projects";
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
        projects: discoveredProjects,
        initialTab,
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
