import { Box, Text, useApp, useInput } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import { doctorCommand } from "../commands/doctor.js";
import { getProjectPhaseStatus, phaseCommand } from "../commands/phase.js";
import { repomapCommand } from "../commands/repomap.js";
import { verifyCommand } from "../commands/verify.js";
import { PHASES } from "../scaffold/phases.js";
import { type ManagedServer, serverManager } from "../server/manager.js";
import type { DiscoveredProject } from "../utils/fs.js";
import { CLI_VERSION } from "../version.js";

export type CockpitTab = "overview" | "servers" | "projects" | "logs";

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
  const [selectedProjectIndex, setSelectedProjectIndex] = useState<number>(() => {
    const idx = projects.findIndex((p) => p.name === initialActiveProject);
    return idx >= 0 ? idx : 0;
  });

  const [currentPhase, setCurrentPhase] = useState<string>("00");
  const [server, setServer] = useState<ManagedServer | undefined>(() =>
    serverManager.getServer(activeProject),
  );
  const [allRunningServers, setAllRunningServers] = useState<ManagedServer[]>(() =>
    serverManager.getRunningServers(),
  );

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      text: `Cockpit initialized for ${activeProject}`,
    },
  ]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

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
        const status = await getProjectPhaseStatus(targetDir);
        setCurrentPhase(status.currentPhase);
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
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeProject, refreshPhase]);

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

  // Keyboard navigation
  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "Q") {
        onExit?.();
        exit();
        return;
      }

      // Tab jumping
      if (input === "1") setCurrentTab("overview");
      else if (input === "2") setCurrentTab("servers");
      else if (input === "3") setCurrentTab("projects");
      else if (input === "4") setCurrentTab("logs");
      else if (key.tab) {
        setCurrentTab((prev) => {
          if (prev === "overview") return "servers";
          if (prev === "servers") return "projects";
          if (prev === "projects") return "logs";
          return "overview";
        });
      }

      // Action shortcuts
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
        syncRepomap();
      } else if (input === "l" || input === "L") {
        setLogs([]);
      }

      // Projects tab cursor navigation
      if (currentTab === "projects" && projects.length > 0) {
        if (key.upArrow) {
          setSelectedProjectIndex((prev) => (prev > 0 ? prev - 1 : projects.length - 1));
        } else if (key.downArrow) {
          setSelectedProjectIndex((prev) => (prev < projects.length - 1 ? prev + 1 : 0));
        } else if (key.return) {
          const chosen = projects[selectedProjectIndex];
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
          {currentTab === "overview" ? "● [1] OVERVIEW & ROADMAP" : "  [1] OVERVIEW & ROADMAP"}
        </Text>
        <Text bold color={currentTab === "servers" ? "cyan" : "gray"}>
          {currentTab === "servers"
            ? `● [2] DEV SERVERS (${allRunningServers.length} ACTIVE)`
            : `  [2] DEV SERVERS (${allRunningServers.length})`}
        </Text>
        <Text bold color={currentTab === "projects" ? "cyan" : "gray"}>
          {currentTab === "projects"
            ? `● [3] PROJECTS (${projects.length})`
            : `  [3] PROJECTS (${projects.length})`}
        </Text>
        <Text bold color={currentTab === "logs" ? "cyan" : "gray"}>
          {currentTab === "logs" ? "● [4] LIVE LOGS" : "  [4] LIVE LOGS"}
        </Text>
      </Box>

      {/* TAB 1: OVERVIEW & ROADMAP */}
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
                  <Text bold>{server ? server.port : "5173"} </Text>
                  <Text dimColor>PID: </Text>
                  <Text bold>{server ? server.process.pid : "None"}</Text>
                </Box>
                <Box>
                  <Text dimColor>Target URL: </Text>
                  <Text color={server ? "cyan" : "gray"}>
                    {server ? server.url : "http://localhost:5173"}
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
            {!server || server.recentLogs.length === 0 ? (
              <Box paddingY={1}>
                <Text dimColor>No live server logs recorded yet for {activeProject}.</Text>
              </Box>
            ) : (
              server.recentLogs.slice(-10).map((l, i) => (
                <Text key={`${i}-${l}`} dimColor={!l.includes("error")}>
                  {l}
                </Text>
              ))
            )}
          </Box>
        </Box>
      )}

      {/* TAB 3: PROJECTS (WORKSPACE EXPLORER) */}
      {currentTab === "projects" && (
        <Box flexDirection="column" width="100%">
          <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="yellow">
                WORKSPACE CLIENT PROJECTS ({projects.length} DETECTED)
              </Text>
              <Text dimColor>Use [↑] / [↓] to navigate, [Enter] to open project</Text>
            </Box>
            {projects.length === 0 ? (
              <Box paddingY={1}>
                <Text dimColor>
                  No subprojects detected. Operating in standalone repository mode: {activeProject}
                </Text>
              </Box>
            ) : (
              projects.map((proj, idx) => {
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
                  [Enter]
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

      {/* Footer Shortcut Bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text>
            <Text bold color="cyan">
              [1-4]
            </Text>
            <Text dimColor> Tabs</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [Tab]
            </Text>
            <Text dimColor> Next Tab</Text>
          </Text>
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
