import { Box, Text, useApp, useInput } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import { adoptProject } from "../commands/adopt.js";
import { doctorCommand } from "../commands/doctor.js";
import { createNewProject } from "../commands/new.js";
import { getProjectPhaseStatus, phaseCommand } from "../commands/phase.js";
import { prototypeInit } from "../commands/prototype.js";
import { repomapCommand } from "../commands/repomap.js";
import { verifyCommand } from "../commands/verify.js";
import { PHASES } from "../scaffold/phases.js";
import { type ManagedServer, detectProjectPort, serverManager } from "../server/manager.js";
import {
  type DiscoveredProject,
  discoverWorkspaceProjects,
  findPrototypeRoot,
} from "../utils/fs.js";
import { CLI_VERSION } from "../version.js";
import { ToolsPanel } from "./ToolsPanel.js";

export type CockpitTab = "overview" | "servers" | "projects" | "logs" | "workspace" | "tools";

export const COCKPIT_TAB_LABELS: Record<CockpitTab, string> = {
  overview: "[1] OVERVIEW",
  servers: "[2] SERVERS",
  projects: "[3] PROJECTS",
  logs: "[4] LOGS",
  workspace: "[5] WORKSPACE",
  tools: "[6] TOOLS",
};

export interface CockpitProps {
  projectRoot: string;
  activeProject: string;
  protoRoot?: string | null;
  projects?: DiscoveredProject[];
  initialTab?: CockpitTab;
  onExit?: () => void;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  text: string;
}

export function CockpitApp({
  projectRoot: initialProjectRoot,
  activeProject: initialActiveProject,
  protoRoot,
  projects = [],
  initialTab = "overview",
  onExit,
}: CockpitProps) {
  const { exit } = useApp();
  const [currentTab, setCurrentTab] = useState<CockpitTab>(initialTab);
  const [activeProject, setActiveProject] = useState<string>(initialActiveProject);
  const [projectRoot, setProjectRoot] = useState<string>(initialProjectRoot);
  const [workspaceProjects, setWorkspaceProjects] = useState<DiscoveredProject[]>(projects);
  const [currentProtoRoot, setCurrentProtoRoot] = useState<string | null | undefined>(protoRoot);

  type WorkspaceMode = "menu" | "new_project" | "adopt_project" | "init_prototype";
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("menu");
  const [workspaceMenuIndex, setWorkspaceMenuIndex] = useState<number>(0);

  // New Project Form
  const [newProjectStep, setNewProjectStep] = useState<number>(0);
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [newProjectFlagship, setNewProjectFlagship] = useState<boolean>(false);
  const [newProjectBackend, setNewProjectBackend] = useState<"none" | "php" | "node">("none");

  // Adopt Form
  const [adoptPath, setAdoptPath] = useState<string>("");

  // Feedback/Error
  const [formError, setFormError] = useState<string | null>(null);
  const [toolsEditing, setToolsEditing] = useState<boolean>(false);

  const [selectedProjectIndex, setSelectedProjectIndex] = useState<number>(() => {
    const idx = projects.findIndex((p) => p.name === initialActiveProject);
    return idx >= 0 ? idx : 0;
  });

  const [currentPhase, setCurrentPhase] = useState<string>("00");
  const [projectPort, setProjectPort] = useState<number>(5173);
  const [server, setServer] = useState<ManagedServer | undefined>(() =>
    serverManager.getServer(initialActiveProject),
  );
  const [allRunningServers, setAllRunningServers] = useState<ManagedServer[]>(() =>
    serverManager.getRunningServers(),
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: `${Date.now()}-init`,
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      text: `Cockpit initialized for ${initialActiveProject} (Mozole v${CLI_VERSION})`,
    },
  ]);

  const addLog = useCallback((text: string, level: LogEntry["level"] = "info") => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      text,
    };
    setLogs((prev) => [...prev.slice(-60), entry]);
  }, []);

  const refreshPhase = useCallback(
    async (targetDir = projectRoot) => {
      try {
        const [status, detectedPort] = await Promise.all([
          getProjectPhaseStatus(targetDir),
          detectProjectPort(targetDir),
        ]);
        setCurrentPhase(status.currentPhase);
        setProjectPort(detectedPort);
      } catch {
        setCurrentPhase("00");
      }
    },
    [projectRoot],
  );

  // Project switch handler
  const switchProject = useCallback(
    (project: DiscoveredProject) => {
      setActiveProject(project.name);
      setProjectRoot(project.path);
      addLog(`Switched active workspace project to: ${project.name}`, "info");
      refreshPhase(project.path);
      setServer(serverManager.getServer(project.name));
      detectProjectPort(project.path)
        .then(setProjectPort)
        .catch(() => {});
    },
    [addLog, refreshPhase],
  );

  // Periodic poll for server states and logs
  useEffect(() => {
    refreshPhase();
    const interval = setInterval(() => {
      const srv = serverManager.getServer(activeProject);
      setServer(srv);
      setAllRunningServers(serverManager.getRunningServers());

      if (srv && srv.recentLogs.length > 0) {
        const latest = srv.recentLogs[srv.recentLogs.length - 1];
        setLogs((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].text === latest) return prev;
          return [
            ...prev.slice(-60),
            {
              id: `${Date.now()}-${Math.random()}`,
              timestamp: new Date().toLocaleTimeString(),
              level: "info",
              text: `[srv] ${latest}`,
            },
          ];
        });
      } else if (!srv) {
        const last = serverManager.getLastStoppedServer(activeProject);
        if (
          last &&
          last.exitCode !== null &&
          last.exitCode !== undefined &&
          last.exitCode !== 0 &&
          last.error
        ) {
          addLog(`Dev server for ${activeProject} exited: ${last.error}`, "error");
          last.error = null;
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeProject, refreshPhase, addLog]);

  // Toggle server for active project
  const toggleServer = useCallback(async () => {
    if (busyAction) return;
    if (server) {
      setBusyAction("Stopping Server");
      addLog(`Stopping dev server for ${activeProject}...`, "warn");
      serverManager.stopServer(activeProject);
      setServer(undefined);
      setAllRunningServers(serverManager.getRunningServers());
      addLog(`Dev server stopped for ${activeProject}`, "info");
      setBusyAction(null);
    } else {
      setBusyAction("Starting Server");
      addLog(`Starting dev server for ${activeProject}...`, "info");
      try {
        const newServer = await serverManager.startServer(activeProject, projectRoot);
        setServer(newServer);
        setAllRunningServers(serverManager.getRunningServers());
        addLog(
          `Dev server online at ${newServer.url} (Port ${newServer.port}, PID ${newServer.process.pid})`,
          "success",
        );
      } catch (err: unknown) {
        addLog(
          `Failed to start dev server: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      } finally {
        setBusyAction(null);
      }
    }
  }, [busyAction, server, activeProject, projectRoot, addLog]);

  // Stop all running servers
  const stopAllServers = useCallback(() => {
    addLog("Terminating all active development servers in workspace...", "warn");
    serverManager.stopAll();
    setServer(undefined);
    setAllRunningServers([]);
    addLog("All workspace development servers stopped.", "info");
  }, [addLog]);

  // Verify gate
  const runVerify = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Verifying");
    addLog(`Running deterministic verification on ${activeProject}...`, "info");
    try {
      const pass = await verifyCommand({ cwd: projectRoot });
      if (pass) {
        addLog(`Verification PASSED for ${activeProject}: Clean Biome, TS, Contracts.`, "success");
      } else {
        addLog(`Verification FAILED for ${activeProject}: Inspect defects above.`, "error");
      }
    } catch (err: unknown) {
      addLog(`Verification error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, activeProject, projectRoot, addLog]);

  // Phase advance
  const advancePhase = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Advancing Phase");
    addLog(`Advancing ${activeProject} to next atomic phase...`, "info");
    try {
      await phaseCommand({ action: "next", cwd: projectRoot });
      await refreshPhase();
      addLog("Successfully transitioned to next phase.", "success");
    } catch (err: unknown) {
      addLog(`Phase change failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, activeProject, projectRoot, refreshPhase, addLog]);

  // Doctor
  const runDoctor = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Diagnosing");
    addLog("Running system environment doctor diagnostics...", "info");
    try {
      await doctorCommand();
      addLog("Doctor diagnostics completed successfully.", "success");
    } catch (err: unknown) {
      addLog(
        `Doctor diagnostic error: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, addLog]);

  // Repomap
  const syncRepomap = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Syncing Repomap");
    addLog(`Synchronizing repomap index for ${activeProject}...`, "info");
    try {
      await repomapCommand({ action: "sync", cwd: projectRoot });
      addLog("Repomap index synchronized with current routes and tokens.", "success");
    } catch (err: unknown) {
      addLog(`Repomap sync error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, activeProject, projectRoot, addLog]);

  // Rescan Workspace Projects
  const rescanWorkspace = useCallback(async () => {
    try {
      const pRoot = currentProtoRoot ?? (await findPrototypeRoot(projectRoot));
      if (pRoot) {
        setCurrentProtoRoot(pRoot);
        const discovered = await discoverWorkspaceProjects(pRoot);
        setWorkspaceProjects(discovered);
        addLog(`Workspace rescan found ${discovered.length} client project(s).`, "info");
      } else {
        addLog("Rescan: Standalone repository mode, no prototype workspace root found.", "info");
      }
    } catch (err: unknown) {
      addLog(`Rescan error: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [currentProtoRoot, projectRoot, addLog]);

  // Create New Project
  const handleCreateProject = useCallback(async () => {
    const trimmedName = newProjectName.trim().toLowerCase();
    if (!trimmedName) {
      setFormError("Project name cannot be empty.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(trimmedName)) {
      setFormError("Project name must use lowercase alphanumeric characters and hyphens.");
      return;
    }

    setBusyAction("Scaffolding Project");
    addLog(`Scaffolding new client project: ${trimmedName}...`, "info");
    try {
      const target = await createNewProject({
        name: trimmedName,
        flagship: newProjectFlagship,
        backend: newProjectBackend,
        cwd: currentProtoRoot ?? projectRoot,
      });
      addLog(`Project generated successfully at: ${target}`, "success");
      setNewProjectName("");
      setNewProjectFlagship(false);
      setNewProjectBackend("none");
      setNewProjectStep(0);
      setWorkspaceMode("menu");
      setFormError(null);

      // Rescan and activate new project
      const pRoot = currentProtoRoot ?? (await findPrototypeRoot(projectRoot));
      if (pRoot) {
        setCurrentProtoRoot(pRoot);
        const discovered = await discoverWorkspaceProjects(pRoot);
        setWorkspaceProjects(discovered);
        const found = discovered.find((p) => p.name === trimmedName || p.path === target);
        if (found) {
          switchProject(found);
        }
      } else {
        setActiveProject(trimmedName);
        setProjectRoot(target);
        refreshPhase(target);
      }
      setCurrentTab("overview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
      addLog(`Project creation failed: ${msg}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [
    newProjectName,
    newProjectFlagship,
    newProjectBackend,
    currentProtoRoot,
    projectRoot,
    addLog,
    switchProject,
    refreshPhase,
  ]);

  // Adopt Project
  const handleAdoptProject = useCallback(async () => {
    const target = adoptPath.trim() || ".";
    setBusyAction("Adopting Project");
    addLog(`Adopting project at path: ${target}...`, "info");
    try {
      await adoptProject({ targetDir: target });
      addLog(`Successfully adopted project into Mozole governance: ${target}`, "success");
      setAdoptPath("");
      setWorkspaceMode("menu");
      setFormError(null);
      await rescanWorkspace();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
      addLog(`Project adoption failed: ${msg}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [adoptPath, addLog, rescanWorkspace]);

  // Init Prototype Workspace
  const handleInitPrototype = useCallback(async () => {
    setBusyAction("Initializing Prototype");
    addLog(`Initializing prototype workspace ecosystem in ${projectRoot}...`, "info");
    try {
      await prototypeInit({ cwd: projectRoot });
      setCurrentProtoRoot(projectRoot);
      addLog("Prototype workspace initialized successfully.", "success");
      setWorkspaceMode("menu");
      await rescanWorkspace();
    } catch (err: unknown) {
      addLog(
        `Prototype initialization failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setBusyAction(null);
    }
  }, [projectRoot, addLog, rescanWorkspace]);

  // Keyboard navigation
  useInput(
    (input, key) => {
      // Immediate global exit on Ctrl+C from anywhere in TUI
      if (key.ctrl && (input === "c" || input === "C" || input === "\x03")) {
        serverManager.stopAll();
        onExit?.();
        exit();
        if (!process.env.VITEST) {
          process.exit(0);
        }
        return;
      }

      if (currentTab === "tools" && toolsEditing) return;
      // Form interaction inside Workspace tab
      if (currentTab === "workspace" && workspaceMode !== "menu") {
        if (key.escape) {
          if (workspaceMode === "new_project" && newProjectStep > 0) {
            setNewProjectStep((prev) => prev - 1);
            setFormError(null);
          } else {
            setWorkspaceMode("menu");
            setFormError(null);
          }
          return;
        }

        if (workspaceMode === "new_project") {
          if (newProjectStep === 0) {
            if (key.return) {
              const name = newProjectName.trim();
              if (!name) {
                setFormError("Please enter a project name.");
                return;
              }
              if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
                setFormError("Alphanumeric characters, hyphens, and dots only.");
                return;
              }
              setFormError(null);
              setNewProjectStep(1);
            } else if (key.backspace || key.delete) {
              setNewProjectName((prev) => prev.slice(0, -1));
              setFormError(null);
            } else if (
              input &&
              input.length === 1 &&
              !key.ctrl &&
              !key.meta &&
              /[a-z0-9._-]/i.test(input)
            ) {
              setNewProjectName((prev) => prev + input.toLowerCase());
              setFormError(null);
            }
            return;
          }

          if (newProjectStep === 1) {
            if (key.return) {
              setNewProjectStep(2);
            } else if (key.leftArrow || key.rightArrow || key.tab || input === " ") {
              setNewProjectFlagship((prev) => !prev);
            }
            return;
          }

          if (newProjectStep === 2) {
            if (key.return) {
              handleCreateProject();
            } else if (key.leftArrow) {
              setNewProjectBackend((prev) =>
                prev === "none" ? "node" : prev === "php" ? "none" : "php",
              );
            } else if (key.rightArrow || key.tab || input === " ") {
              setNewProjectBackend((prev) =>
                prev === "none" ? "php" : prev === "php" ? "node" : "none",
              );
            }
            return;
          }
        }

        if (workspaceMode === "adopt_project") {
          if (key.return) {
            handleAdoptProject();
          } else if (key.backspace || key.delete) {
            setAdoptPath((prev) => prev.slice(0, -1));
            setFormError(null);
          } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
            setAdoptPath((prev) => prev + input);
            setFormError(null);
          }
          return;
        }

        if (workspaceMode === "init_prototype") {
          if (key.return || input === "y" || input === "Y") {
            handleInitPrototype();
          } else if (input === "n" || input === "N") {
            setWorkspaceMode("menu");
          }
          return;
        }

        return;
      }

      if (key.escape || input === "q" || input === "Q") {
        if (currentTab === "tools") {
          setCurrentTab("overview");
          return;
        }
        serverManager.stopAll();
        onExit?.();
        exit();
        if (!process.env.VITEST) {
          process.exit(0);
        }
        return;
      }

      // Tab jumping
      if (input === "1") {
        setToolsEditing(false);
        setCurrentTab("overview");
      } else if (input === "2") {
        setToolsEditing(false);
        setCurrentTab("servers");
      } else if (input === "3") {
        setToolsEditing(false);
        setCurrentTab("projects");
      } else if (input === "4") {
        setToolsEditing(false);
        setCurrentTab("logs");
      } else if (input === "5") {
        setToolsEditing(false);
        setCurrentTab("workspace");
      } else if (input === "6") {
        setToolsEditing(false);
        setCurrentTab("tools");
      } else if (key.tab) {
        setToolsEditing(false);
        setCurrentTab((prev) => {
          if (prev === "overview") return "servers";
          if (prev === "servers") return "projects";
          if (prev === "projects") return "logs";
          if (prev === "logs") return "workspace";
          if (prev === "workspace") return "tools";
          return "overview";
        });
      }

      if (currentTab === "tools") return;

      // Workspace menu navigation
      if (currentTab === "workspace" && workspaceMode === "menu") {
        if (key.upArrow) {
          setWorkspaceMenuIndex((prev) => (prev > 0 ? prev - 1 : 3));
          return;
        }
        if (key.downArrow) {
          setWorkspaceMenuIndex((prev) => (prev < 3 ? prev + 1 : 0));
          return;
        }
        if (key.return) {
          if (workspaceMenuIndex === 0) {
            setWorkspaceMode("new_project");
            setNewProjectStep(0);
            setFormError(null);
          } else if (workspaceMenuIndex === 1) {
            setWorkspaceMode("adopt_project");
            setAdoptPath("");
            setFormError(null);
          } else if (workspaceMenuIndex === 2) {
            setWorkspaceMode("init_prototype");
          } else if (workspaceMenuIndex === 3) {
            rescanWorkspace();
          }
          return;
        }
        if (input === "n" || input === "N") {
          setWorkspaceMode("new_project");
          setNewProjectStep(0);
          setFormError(null);
          return;
        }
        if (input === "a" || input === "A") {
          setWorkspaceMode("adopt_project");
          setAdoptPath("");
          setFormError(null);
          return;
        }
        if (input === "i" || input === "I") {
          setWorkspaceMode("init_prototype");
          return;
        }
        if (input === "r" || input === "R") {
          rescanWorkspace();
          return;
        }
      }

      // Action shortcuts (Global outside form modes)
      if (input === "s" || input === "S") {
        toggleServer();
      } else if (input === "k" || input === "K") {
        stopAllServers();
      } else if (input === "v" || input === "V") {
        runVerify();
      } else if (input === "p" || input === "P") {
        advancePhase();
      } else if (input === "d" || input === "D") {
        runDoctor();
      } else if (input === "r" || input === "R") {
        if (currentTab !== "workspace") {
          syncRepomap();
        }
      } else if (input === "l" || input === "L") {
        setLogs([]);
      }

      // Projects tab cursor navigation
      if (currentTab === "projects" && workspaceProjects.length > 0) {
        if (key.upArrow) {
          setSelectedProjectIndex((prev) => (prev > 0 ? prev - 1 : workspaceProjects.length - 1));
        } else if (key.downArrow) {
          setSelectedProjectIndex((prev) => (prev < workspaceProjects.length - 1 ? prev + 1 : 0));
        } else if (input === " ") {
          const chosen = workspaceProjects[selectedProjectIndex];
          if (chosen) {
            if (chosen.name !== activeProject) {
              switchProject(chosen);
            }
            setCurrentTab("overview");
          }
        }
      }
    },
    { isActive: Boolean(process.stdin.isTTY) },
  );

  const activePhaseNum = Number.parseInt(currentPhase, 10) || 0;
  const progressPercent = Math.round((activePhaseNum / 10) * 100);
  const progressBarWidth = 14;
  const filledBlocks = Math.round((activePhaseNum / 10) * progressBarWidth);
  const emptyBlocks = Math.max(0, progressBarWidth - filledBlocks);
  const progressBar = `[${"█".repeat(filledBlocks)}${"░".repeat(emptyBlocks)}] ${progressPercent}%`;

  return (
    <Box flexDirection="column" width="100%">
      {/* Top Header Bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text bold color="cyan">
            MOZOLE COCKPIT
          </Text>
          <Text dimColor>
            {"//"} v{CLI_VERSION}
          </Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>ACTIVE PROJECT:</Text>
          <Text bold color="green">
            {activeProject}
          </Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>SERVER:</Text>
          {server ? (
            <Text bold color="green">
              ● RUNNING ({server.url})
            </Text>
          ) : (
            <Text dimColor>○ STOPPED</Text>
          )}
        </Box>
      </Box>

      {/* Tab Navigation Strip (htop/k9s inspired) */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} gap={2}>
        <Text bold color={currentTab === "overview" ? "cyan" : "gray"}>
          {currentTab === "overview"
            ? `● ${COCKPIT_TAB_LABELS.overview}`
            : `  ${COCKPIT_TAB_LABELS.overview}`}
        </Text>
        <Text bold color={currentTab === "servers" ? "cyan" : "gray"}>
          {currentTab === "servers"
            ? `● ${COCKPIT_TAB_LABELS.servers}`
            : `  ${COCKPIT_TAB_LABELS.servers}`}
        </Text>
        <Text bold color={currentTab === "projects" ? "cyan" : "gray"}>
          {currentTab === "projects"
            ? `● ${COCKPIT_TAB_LABELS.projects}`
            : `  ${COCKPIT_TAB_LABELS.projects}`}
        </Text>
        <Text bold color={currentTab === "logs" ? "cyan" : "gray"}>
          {currentTab === "logs" ? `● ${COCKPIT_TAB_LABELS.logs}` : `  ${COCKPIT_TAB_LABELS.logs}`}
        </Text>
        <Text bold color={currentTab === "workspace" ? "cyan" : "gray"}>
          {currentTab === "workspace"
            ? `● ${COCKPIT_TAB_LABELS.workspace}`
            : `  ${COCKPIT_TAB_LABELS.workspace}`}
        </Text>
        <Text bold color={currentTab === "tools" ? "cyan" : "gray"}>
          {currentTab === "tools"
            ? `● ${COCKPIT_TAB_LABELS.tools}`
            : `  ${COCKPIT_TAB_LABELS.tools}`}
        </Text>
      </Box>

      {currentTab === "tools" && (
        <ToolsPanel
          projectRoot={projectRoot}
          activeProject={activeProject}
          onBack={() => {
            setToolsEditing(false);
            setCurrentTab("overview");
          }}
          onTabSelect={(tab) => {
            setToolsEditing(false);
            setCurrentTab(tab);
          }}
          onEditingChange={setToolsEditing}
          onLog={addLog}
          onExit={onExit}
        />
      )}

      {/* TAB 1: OVERVIEW */}
      {currentTab === "overview" && (
        <Box flexDirection="column" width="100%">
          <Box flexDirection="row" width="100%">
            {/* Left Column: 10-Step Phases Roadmap */}
            <Box
              flexDirection="column"
              width="52%"
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
            >
              <Box justifyContent="space-between" marginBottom={1}>
                <Text bold color="yellow">
                  ATOMIC ROADMAP & PHASES
                </Text>
                <Text bold color="cyan">
                  {progressBar}
                </Text>
              </Box>
              {PHASES.map((phase) => {
                const pNum = Number.parseInt(phase.id, 10);
                const isDone = pNum < activePhaseNum;
                const isCurrent = phase.id === currentPhase;

                if (isDone) {
                  return (
                    <Box key={phase.id}>
                      <Text color="green"> [✓] Phase {phase.id}: </Text>
                      <Text dimColor>{phase.name}</Text>
                    </Box>
                  );
                }
                if (isCurrent) {
                  return (
                    <Box key={phase.id}>
                      <Text bold color="cyan">
                        {" "}
                        [►] Phase {phase.id}:{" "}
                      </Text>
                      <Text bold color="white">
                        {phase.name}
                      </Text>
                      <Text bold color="yellow">
                        {" "}
                        [ACTIVE]
                      </Text>
                    </Box>
                  );
                }
                return (
                  <Box key={phase.id}>
                    <Text dimColor>
                      {" "}
                      [ ] Phase {phase.id}: {phase.name}
                    </Text>
                  </Box>
                );
              })}
            </Box>

            {/* Right Column: Server Summary & System Runtimes */}
            <Box flexDirection="column" width="48%">
              <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
                <Box justifyContent="space-between">
                  <Text bold color="yellow">
                    DEV SERVER
                  </Text>
                  {server ? (
                    <Text bold color="green">
                      ● ACTIVE
                    </Text>
                  ) : (
                    <Text dimColor>○ INACTIVE</Text>
                  )}
                </Box>
                <Box marginTop={1}>
                  <Text dimColor>Port: </Text>
                  <Text bold>{server ? server.port : projectPort} </Text>
                  <Text dimColor>PID: </Text>
                  <Text bold>{server ? server.process.pid : "None"}</Text>
                </Box>
                <Box>
                  <Text dimColor>Target URL: </Text>
                  <Text color={server ? "cyan" : "gray"}>
                    {server ? server.url : `http://localhost:${projectPort}`}
                  </Text>
                </Box>
                <Box marginTop={1}>
                  <Text dimColor>Action: Press </Text>
                  <Text bold color="magenta">
                    [S]
                  </Text>
                  <Text dimColor> to {server ? "stop" : "start"} server</Text>
                </Box>
              </Box>

              <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
                <Text bold color="yellow">
                  SYSTEM RUNTIMES & QUALITY
                </Text>
                <Box marginTop={1} justifyContent="space-between">
                  <Text dimColor>Node.js Runtime</Text>
                  <Text color="green">{process.version} (PASS)</Text>
                </Box>
                <Box justifyContent="space-between">
                  <Text dimColor>Biome Code Standards</Text>
                  <Text color="green">Strict & Clean</Text>
                </Box>
                <Box justifyContent="space-between">
                  <Text dimColor>Design Token CSS</Text>
                  <Text color="green">Tailwind v4 @theme</Text>
                </Box>
                <Box justifyContent="space-between">
                  <Text dimColor>DOM Geometry Probe</Text>
                  <Text color="cyan">Zero-Screenshot</Text>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Mini Activity Logs in Overview */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            height={7}
          >
            <Box justifyContent="space-between">
              <Text bold color="yellow">
                ACTIVITY STREAM
              </Text>
              {busyAction ? (
                <Text bold color="magenta">
                  RUNNING: {busyAction.toUpperCase()}...
                </Text>
              ) : (
                <Text dimColor>READY</Text>
              )}
            </Box>
            {logs.slice(-4).map((log) => (
              <Box key={log.id}>
                <Text dimColor>[{log.timestamp}] </Text>
                <Text
                  bold
                  color={log.level === "error" ? "red" : log.level === "success" ? "green" : "cyan"}
                >
                  [{log.level.toUpperCase()}]
                </Text>
                <Text color={log.level === "error" ? "red" : undefined}> {log.text}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* TAB 2: DEDICATED DEV SERVERS */}
      {currentTab === "servers" && (
        <Box flexDirection="column" width="100%">
          <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="yellow">
                WORKSPACE DEVELOPMENT SERVERS
              </Text>
              <Text dimColor>Total Active: {allRunningServers.length}</Text>
            </Box>
            {allRunningServers.length === 0 ? (
              <Box paddingY={1}>
                <Text dimColor>No dev servers currently running in this workspace.</Text>
                <Text>
                  {" "}
                  Press{" "}
                  <Text bold color="cyan">
                    [S]
                  </Text>{" "}
                  to start server for{" "}
                  <Text bold color="green">
                    {activeProject}
                  </Text>
                  .
                </Text>
              </Box>
            ) : (
              allRunningServers.map((srv) => (
                <Box key={srv.id} justifyContent="space-between">
                  <Box gap={1}>
                    <Text bold color="green">
                      ●
                    </Text>
                    <Text bold>{srv.projectName}</Text>
                    <Text dimColor>({srv.url})</Text>
                  </Box>
                  <Box gap={2}>
                    <Text dimColor>Port: {srv.port}</Text>
                    <Text dimColor>PID: {srv.process.pid}</Text>
                    {srv.projectName === activeProject && (
                      <Text bold color="cyan">
                        [ACTIVE PROJECT]
                      </Text>
                    )}
                  </Box>
                </Box>
              ))
            )}
            <Box marginTop={1} gap={2}>
              <Text dimColor>Shortcuts: </Text>
              <Text>
                <Text bold color="magenta">
                  [S]
                </Text>{" "}
                Toggle Active Server
              </Text>
              {allRunningServers.length > 0 && (
                <Text>
                  <Text bold color="red">
                    [K]
                  </Text>{" "}
                  Stop All Servers
                </Text>
              )}
            </Box>
          </Box>

          {/* Dedicated Server Logs Stream */}
          <Box
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            flexDirection="column"
            height={13}
          >
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="yellow">
                DEV SERVER LOG OUTPUT ({activeProject})
              </Text>
              {server ? (
                <Text bold color="green">
                  ● STREAMING ({server.port})
                </Text>
              ) : (
                <Text dimColor>○ SERVER INACTIVE</Text>
              )}
            </Box>
            {(() => {
              const displayLogs = server
                ? server.recentLogs
                : (serverManager.getLastStoppedServer(activeProject)?.recentLogs ?? []);
              if (displayLogs.length === 0) {
                return (
                  <Box paddingY={1}>
                    <Text dimColor>No server logs recorded yet for {activeProject}.</Text>
                  </Box>
                );
              }
              return displayLogs.slice(-10).map((l, i) => (
                <Text
                  key={`${i}-${l}`}
                  color={l.toLowerCase().includes("error") ? "red" : undefined}
                  dimColor={!l.toLowerCase().includes("error")}
                >
                  {l}
                </Text>
              ));
            })()}
          </Box>
        </Box>
      )}

      {/* TAB 3: PROJECTS (WORKSPACE EXPLORER) */}
      {currentTab === "projects" && (
        <Box flexDirection="column" width="100%">
          <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="yellow">
                WORKSPACE CLIENT PROJECTS ({workspaceProjects.length} DETECTED)
              </Text>
              <Text dimColor>Use [↑] / [↓] to navigate, [Space] to open project</Text>
            </Box>
            {workspaceProjects.length === 0 ? (
              <Box paddingY={1}>
                <Text dimColor>
                  No subprojects detected. Operating in standalone repository mode: {activeProject}
                </Text>
              </Box>
            ) : (
              workspaceProjects.map((proj, idx) => {
                const isSelected = idx === selectedProjectIndex;
                const isActive = proj.name === activeProject;
                const isRunning = Boolean(serverManager.getServer(proj.name));

                return (
                  <Box key={proj.name} justifyContent="space-between">
                    <Box gap={1}>
                      <Text bold color={isSelected ? "cyan" : "gray"}>
                        {isSelected ? "▶" : " "} [{idx + 1}]
                      </Text>
                      <Text
                        bold={isSelected}
                        color={isActive ? "green" : isSelected ? "white" : "gray"}
                      >
                        {proj.name}
                      </Text>
                      {isActive && (
                        <Text bold color="green">
                          [CURRENT]
                        </Text>
                      )}
                    </Box>
                    <Box gap={2}>
                      <Text color={isRunning ? "green" : "gray"}>
                        {isRunning ? "● DEV RUNNING" : "○ OFF"}
                      </Text>
                      <Text dimColor>{proj.path}</Text>
                    </Box>
                  </Box>
                );
              })
            )}
            <Box marginTop={1}>
              <Text dimColor>
                Press{" "}
                <Text bold color="cyan">
                  [Space]
                </Text>{" "}
                to activate selected project and load its roadmap and contracts.
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* TAB 4: FULLSCREEN LIVE LOGS */}
      {currentTab === "logs" && (
        <Box
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          flexDirection="column"
          height={19}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="yellow">
              FULL CONSOLE & PROCESS LOG STREAM
            </Text>
            <Text dimColor>Press [L] to clear stream</Text>
          </Box>
          {logs.slice(-16).map((log) => (
            <Box key={log.id}>
              <Text dimColor>[{log.timestamp}] </Text>
              <Text
                bold
                color={log.level === "error" ? "red" : log.level === "success" ? "green" : "cyan"}
              >
                [{log.level.toUpperCase()}]
              </Text>
              <Text color={log.level === "error" ? "red" : undefined}> {log.text}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* TAB 5: WORKSPACE & GENERATOR */}
      {currentTab === "workspace" && (
        <Box flexDirection="column" width="100%">
          {/* Top Status Box */}
          <Box
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            flexDirection="column"
            marginBottom={1}
          >
            <Box justifyContent="space-between">
              <Text bold color="yellow">
                WORKSPACE ECOSYSTEM & STATUS
              </Text>
              <Text dimColor>
                {currentProtoRoot ? "● PROTOTYPE MONOREPO ECOSYSTEM" : "○ STANDALONE PROJECT MODE"}
              </Text>
            </Box>
            <Box marginTop={1} gap={2}>
              <Box>
                <Text dimColor>Root: </Text>
                <Text bold color={currentProtoRoot ? "green" : "white"}>
                  {currentProtoRoot ?? projectRoot}
                </Text>
              </Box>
              <Box>
                <Text dimColor>Active Project: </Text>
                <Text bold color="cyan">
                  {activeProject}
                </Text>
              </Box>
              <Box>
                <Text dimColor>Detected Projects: </Text>
                <Text bold color="yellow">
                  {workspaceProjects.length}
                </Text>
              </Box>
            </Box>
          </Box>

          {/* Action or Form Container */}
          <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="column">
            {workspaceMode === "menu" && (
              <Box flexDirection="column">
                <Box justifyContent="space-between" marginBottom={1}>
                  <Text bold color="cyan">
                    WORKSPACE OPERATIONS & PROJECT ACTIONS
                  </Text>
                  <Text dimColor>Use [↑] / [↓] + [Enter] or press key</Text>
                </Box>

                {[
                  {
                    key: "N",
                    title: "GENERATE NEW CLIENT PROJECT",
                    desc: "Scaffold verified Standard (React Router 7 SSG) or Flagship (Wouter + Canvas) project",
                  },
                  {
                    key: "A",
                    title: "ADOPT EXISTING DIRECTORY",
                    desc: "Inject Mozole policies, 10-step atomic phases, canonical tokens, and repomap fihrist",
                  },
                  {
                    key: "I",
                    title: "INITIALIZE PROTOTYPE WORKSPACE",
                    desc: "Setup npm workspaces and shared dependencies with project-owned source code",
                  },
                  {
                    key: "R",
                    title: "RESCAN WORKSPACE PROJECTS",
                    desc: "Audit the filesystem and update all detected client projects in the cockpit",
                  },
                ].map((item, idx) => {
                  const isSelected = workspaceMenuIndex === idx;
                  return (
                    <Box key={item.key} flexDirection="column" marginY={0}>
                      <Box gap={1}>
                        <Text bold color={isSelected ? "cyan" : "gray"}>
                          {isSelected ? "▶" : " "} [{item.key}]
                        </Text>
                        <Text bold color={isSelected ? "white" : "gray"}>
                          {item.title}
                        </Text>
                      </Box>
                      <Box paddingLeft={6}>
                        <Text dimColor>{item.desc}</Text>
                      </Box>
                    </Box>
                  );
                })}

                <Box marginTop={1}>
                  <Text dimColor>
                    Press{" "}
                    <Text bold color="cyan">
                      [Enter]
                    </Text>{" "}
                    to select, or press{" "}
                    <Text bold color="yellow">
                      [N]
                    </Text>
                    ,{" "}
                    <Text bold color="yellow">
                      [A]
                    </Text>
                    ,{" "}
                    <Text bold color="yellow">
                      [I]
                    </Text>
                    ,{" "}
                    <Text bold color="yellow">
                      [R]
                    </Text>{" "}
                    directly.
                  </Text>
                </Box>
              </Box>
            )}

            {workspaceMode === "new_project" && (
              <Box flexDirection="column">
                <Box justifyContent="space-between" marginBottom={1}>
                  <Text bold color="yellow">
                    ⚡ SCAFFOLD NEW CLIENT PROJECT (Step {newProjectStep + 1} of 3)
                  </Text>
                  <Text dimColor>Press [Esc] to return</Text>
                </Box>

                {/* Field 1: Name */}
                <Box gap={1} marginY={0}>
                  <Text bold color={newProjectStep === 0 ? "cyan" : "gray"}>
                    {newProjectStep === 0 ? "▶ 1. Project Name:" : "  1. Project Name:"}
                  </Text>
                  <Text bold color="white">
                    {newProjectName || (newProjectStep === 0 ? "_" : "<not set>")}
                  </Text>
                  {newProjectStep === 0 && (
                    <Text dimColor>(Type name, press [Enter] to confirm)</Text>
                  )}
                </Box>

                {/* Field 2: Profile */}
                <Box gap={1} marginY={0} marginTop={1}>
                  <Text bold color={newProjectStep === 1 ? "cyan" : "gray"}>
                    {newProjectStep === 1 ? "▶ 2. Creative Profile:" : "  2. Creative Profile:"}
                  </Text>
                  <Box gap={2}>
                    <Text bold={!newProjectFlagship} color={!newProjectFlagship ? "green" : "gray"}>
                      {!newProjectFlagship ? "[● Standard (React Router 7 SSG)]" : "[○ Standard]"}
                    </Text>
                    <Text bold={newProjectFlagship} color={newProjectFlagship ? "magenta" : "gray"}>
                      {newProjectFlagship ? "[● Flagship (Wouter + Canvas)]" : "[○ Flagship]"}
                    </Text>
                  </Box>
                  {newProjectStep === 1 && (
                    <Text dimColor>(Press [Space]/[Tab] to switch, [Enter] to next)</Text>
                  )}
                </Box>

                {/* Field 3: Backend */}
                <Box gap={1} marginY={0} marginTop={1}>
                  <Text bold color={newProjectStep === 2 ? "cyan" : "gray"}>
                    {newProjectStep === 2 ? "▶ 3. Backend Runtime:" : "  3. Backend Runtime:"}
                  </Text>
                  <Box gap={2}>
                    <Text
                      bold={newProjectBackend === "none"}
                      color={newProjectBackend === "none" ? "green" : "gray"}
                    >
                      {newProjectBackend === "none" ? "[● None (Pure Frontend)]" : "[○ None]"}
                    </Text>
                    <Text
                      bold={newProjectBackend === "php"}
                      color={newProjectBackend === "php" ? "yellow" : "gray"}
                    >
                      {newProjectBackend === "php" ? "[● PHP 8.1+ Zero-Dep]" : "[○ PHP]"}
                    </Text>
                    <Text
                      bold={newProjectBackend === "node"}
                      color={newProjectBackend === "node" ? "yellow" : "gray"}
                    >
                      {newProjectBackend === "node" ? "[● Node.js API]" : "[○ Node]"}
                    </Text>
                  </Box>
                  {newProjectStep === 2 && (
                    <Text dimColor>(Press [Space]/[Tab] to switch, [Enter] to generate)</Text>
                  )}
                </Box>

                {/* Target Destination Preview */}
                <Box marginTop={1} paddingLeft={2}>
                  <Text dimColor>Target Path: </Text>
                  <Text color="cyan">
                    {newProjectName
                      ? currentProtoRoot
                        ? `${currentProtoRoot}/projects/${newProjectName}`
                        : `${projectRoot}/${newProjectName}`
                      : "<enter name above>"}
                  </Text>
                </Box>

                {formError && (
                  <Box marginTop={1}>
                    <Text bold color="red">
                      [!] {formError}
                    </Text>
                  </Box>
                )}

                <Box marginTop={1} gap={2}>
                  <Text dimColor>Navigation: </Text>
                  <Text>
                    <Text bold color="cyan">
                      [Enter]
                    </Text>{" "}
                    {newProjectStep === 2 ? "Generate Project" : "Next Field"}
                  </Text>
                  <Text>
                    <Text bold color="yellow">
                      [Esc]
                    </Text>{" "}
                    {newProjectStep > 0 ? "Back" : "Cancel"}
                  </Text>
                </Box>
              </Box>
            )}

            {workspaceMode === "adopt_project" && (
              <Box flexDirection="column">
                <Box justifyContent="space-between" marginBottom={1}>
                  <Text bold color="yellow">
                    📦 ADOPT EXISTING REPOSITORY INTO MOZOLE GOVERNANCE
                  </Text>
                  <Text dimColor>Press [Esc] to return</Text>
                </Box>

                <Box gap={1}>
                  <Text bold color="cyan">
                    ▶ Target Directory Path:
                  </Text>
                  <Text bold color="white">
                    {adoptPath || "."}
                  </Text>
                </Box>

                <Box marginTop={1} paddingLeft={2} flexDirection="column">
                  <Text dimColor>
                    Will inject: AGENTS.md, docs/phases/status.md, docs/repomap/, and tokens.css
                  </Text>
                  <Text dimColor>
                    Type directory path (e.g. ../another-project or . for current).
                  </Text>
                </Box>

                {formError && (
                  <Box marginTop={1}>
                    <Text bold color="red">
                      [!] {formError}
                    </Text>
                  </Box>
                )}

                <Box marginTop={1} gap={2}>
                  <Text>
                    <Text bold color="cyan">
                      [Enter]
                    </Text>{" "}
                    Adopt Directory
                  </Text>
                  <Text>
                    <Text bold color="yellow">
                      [Esc]
                    </Text>{" "}
                    Cancel
                  </Text>
                </Box>
              </Box>
            )}

            {workspaceMode === "init_prototype" && (
              <Box flexDirection="column">
                <Box justifyContent="space-between" marginBottom={1}>
                  <Text bold color="yellow">
                    🚀 INITIALIZE PROTOTYPE WORKSPACE ECOSYSTEM
                  </Text>
                  <Text dimColor>Press [Esc] to return</Text>
                </Box>

                <Box flexDirection="column" paddingLeft={2}>
                  <Text>Initialize a multi-project prototype workspace in:</Text>
                  <Text bold color="cyan">
                    {projectRoot}
                  </Text>
                  <Box marginTop={1} flexDirection="column">
                    <Text dimColor>• Creates mozole.config.json</Text>
                    <Text dimColor>• Creates projects/ folder for client projects</Text>
                    <Text dimColor>
                      • Shares npm dependencies; keeps UI, tokens and behaviors project-local
                    </Text>
                    <Text dimColor>• Injects AGENTS.md governance contract</Text>
                  </Box>
                </Box>

                <Box marginTop={1} gap={2}>
                  <Text>
                    <Text bold color="green">
                      [Enter / Y]
                    </Text>{" "}
                    Confirm Initialization
                  </Text>
                  <Text>
                    <Text bold color="yellow">
                      [Esc / N]
                    </Text>{" "}
                    Cancel
                  </Text>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Footer Shortcut Bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text>
            <Text bold color="cyan">
              [1-6]
            </Text>
            <Text dimColor> Tabs</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [Tab]
            </Text>
            <Text dimColor> Next Tab</Text>
          </Text>
          {currentTab === "tools" && !toolsEditing && (
            <>
              <Text>
                <Text bold color="yellow">
                  [C]
                </Text>
                <Text dimColor> Comp</Text>
              </Text>
              <Text>
                <Text bold color="yellow">
                  [O]
                </Text>
                <Text dimColor> Opt</Text>
              </Text>
              <Text>
                <Text bold color="yellow">
                  [R]
                </Text>
                <Text dimColor> Rel</Text>
              </Text>
              <Text>
                <Text bold color="cyan">
                  [Enter]
                </Text>
                <Text dimColor> Configure</Text>
              </Text>
            </>
          )}
          {currentTab === "projects" && (
            <Text>
              <Text bold color="cyan">
                [Space]
              </Text>
              <Text dimColor> Select</Text>
            </Text>
          )}
          {currentTab === "workspace" && workspaceMode === "menu" && (
            <>
              <Text>
                <Text bold color="yellow">
                  [N]
                </Text>
                <Text dimColor> New</Text>
              </Text>
              <Text>
                <Text bold color="yellow">
                  [A]
                </Text>
                <Text dimColor> Adopt</Text>
              </Text>
              <Text>
                <Text bold color="yellow">
                  [I]
                </Text>
                <Text dimColor> Init</Text>
              </Text>
            </>
          )}
          <Text>
            <Text bold color="cyan">
              [S]
            </Text>
            <Text dimColor> Server</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [V]
            </Text>
            <Text dimColor> Verify</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [P]
            </Text>
            <Text dimColor> Phase</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [D]
            </Text>
            <Text dimColor> Doctor</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [R]
            </Text>
            <Text dimColor> Repomap</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [Q]
            </Text>
            <Text dimColor> Quit</Text>
          </Text>
        </Box>
        <Box>
          {busyAction ? (
            <Text bold color="magenta">
              ● BUSY ({busyAction})
            </Text>
          ) : (
            <Text dimColor>READY</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
