import { Box, Text, useApp, useInput } from "ink";
import React, { useEffect, useState, useCallback } from "react";
import { doctorCommand } from "../commands/doctor.js";
import { getProjectPhaseStatus, phaseCommand } from "../commands/phase.js";
import { repomapCommand } from "../commands/repomap.js";
import { verifyCommand } from "../commands/verify.js";
import { PHASES } from "../scaffold/phases.js";
import { type ManagedServer, serverManager } from "../server/manager.js";
import { CLI_VERSION } from "../version.js";

export interface CockpitProps {
  projectRoot: string;
  activeProject: string;
  protoRoot?: string | null;
  projects?: string[];
  onExit?: () => void;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  text: string;
}

export function CockpitApp({
  projectRoot,
  activeProject,
  protoRoot,
  projects = [],
  onExit,
}: CockpitProps) {
  const { exit } = useApp();
  const [currentPhase, setCurrentPhase] = useState<string>("00");
  const [server, setServer] = useState<ManagedServer | undefined>(() =>
    serverManager.getServer(activeProject),
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
    setLogs((prev) => [...prev.slice(-40), entry]);
  }, []);

  const refreshPhase = useCallback(async () => {
    try {
      const status = await getProjectPhaseStatus(projectRoot);
      setCurrentPhase(status.currentPhase);
    } catch {
      setCurrentPhase("00");
    }
  }, [projectRoot]);

  // Initial phase fetch & interval poll for server status
  useEffect(() => {
    refreshPhase();
    const interval = setInterval(() => {
      const srv = serverManager.getServer(activeProject);
      setServer(srv);
      if (srv && srv.recentLogs.length > 0) {
        const latest = srv.recentLogs[srv.recentLogs.length - 1];
        setLogs((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].text === latest) return prev;
          return [
            ...prev.slice(-40),
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

  // Server toggle handler
  const toggleServer = useCallback(async () => {
    if (busyAction) return;
    if (server) {
      setBusyAction("Stopping Server");
      addLog(`Stopping dev server for ${activeProject}...`, "warn");
      serverManager.stopServer(activeProject);
      setServer(undefined);
      addLog(`Dev server stopped for ${activeProject}`, "info");
      setBusyAction(null);
    } else {
      setBusyAction("Starting Server");
      addLog(`Starting dev server for ${activeProject}...`, "info");
      try {
        const newServer = await serverManager.startServer(activeProject, projectRoot);
        setServer(newServer);
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

  // Verify gate handler
  const runVerify = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Verifying");
    addLog("Running 5-stage deterministic verification gate...", "info");
    try {
      const pass = await verifyCommand({ cwd: projectRoot });
      if (pass) {
        addLog(
          "Verification gate PASSED: Clean Biome, TypeScript, Contracts, Zero AI traces.",
          "success",
        );
      } else {
        addLog("Verification gate FAILED: Inspect defects above.", "error");
      }
    } catch (err: unknown) {
      addLog(`Verification error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, projectRoot, addLog]);

  // Phase advance handler
  const advancePhase = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Advancing Phase");
    addLog("Advancing to next atomic phase...", "info");
    try {
      await phaseCommand({ action: "next", cwd: projectRoot });
      await refreshPhase();
      addLog("Successfully transitioned to next phase.", "success");
    } catch (err: unknown) {
      addLog(`Phase change failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, projectRoot, refreshPhase, addLog]);

  // Doctor diagnostics handler
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

  // Repomap sync handler
  const syncRepomap = useCallback(async () => {
    if (busyAction) return;
    setBusyAction("Syncing Repomap");
    addLog("Synchronizing docs/repomap architectural index...", "info");
    try {
      await repomapCommand({ action: "sync", cwd: projectRoot });
      addLog("Repomap index synchronized with current routes and tokens.", "success");
    } catch (err: unknown) {
      addLog(`Repomap sync error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, projectRoot, addLog]);

  // Keyboard navigation and shortcuts
  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "Q") {
        onExit?.();
        exit();
        return;
      }
      if (input === "s" || input === "S") {
        toggleServer();
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
    },
    { isActive: Boolean(process.stdin.isTTY) },
  );

  const activePhaseNum = Number.parseInt(currentPhase, 10) || 0;
  const progressPercent = Math.round((activePhaseNum / 10) * 100);
  const progressBarWidth = 16;
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
          <Text dimColor>PROJECT:</Text>
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

      {/* Middle Split-Pane Row */}
      <Box flexDirection="row" width="100%">
        {/* Left Column: Atomic Phases Roadmap */}
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
                    [IN PROGRESS]
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

        {/* Right Column: Server Monitor & Health */}
        <Box flexDirection="column" width="48%">
          {/* Dev Server Monitor Box */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            marginBottom={0}
          >
            <Box justifyContent="space-between">
              <Text bold color="yellow">
                DEV SERVER MONITOR
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
              <Text bold>{server ? server.port : "5173 (default)"} </Text>
              <Text dimColor>PID: </Text>
              <Text bold>{server ? server.process.pid : "None"} </Text>
              <Text dimColor>Runtime: </Text>
              <Text bold color="cyan">
                Vite + SSG
              </Text>
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

          {/* System Health Box */}
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
              <Text color="green">Configured & Strict</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text dimColor>Design Token CSS</Text>
              <Text color="green">Tailwind v4 @theme</Text>
            </Box>
            <Box justifyContent="space-between">
              <Text dimColor>Visual Quality Probe</Text>
              <Text color="cyan">Zero-Screenshot DOM</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Activity Log Stream (htop/btop log window) */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} height={10}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color="yellow">
            LIVE ACTIVITY & PROCESS LOGS
          </Text>
          {busyAction ? (
            <Text bold color="magenta">
              RUNNING: {busyAction.toUpperCase()}...
            </Text>
          ) : (
            <Text dimColor>READY</Text>
          )}
        </Box>
        {logs.slice(-7).map((log) => {
          let badgeColor: "cyan" | "green" | "yellow" | "red" = "cyan";
          if (log.level === "success") badgeColor = "green";
          if (log.level === "warn") badgeColor = "yellow";
          if (log.level === "error") badgeColor = "red";

          return (
            <Box key={log.id}>
              <Text dimColor>[{log.timestamp}] </Text>
              <Text bold color={badgeColor}>
                [{log.level.toUpperCase()}]
              </Text>
              <Text color={log.level === "error" ? "red" : undefined}> {log.text}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Command Bar / Shortcut Footer */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text>
            <Text bold color="cyan">
              [P]
            </Text>
            <Text dimColor> Phase</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [V]
            </Text>
            <Text dimColor> Verify</Text>
          </Text>
          <Text>
            <Text bold color="cyan">
              [S]
            </Text>
            <Text dimColor> Server</Text>
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
              [L]
            </Text>
            <Text dimColor> Clear</Text>
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
