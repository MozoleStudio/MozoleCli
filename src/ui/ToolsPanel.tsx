import path from "node:path";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { addComponents } from "../commands/add.js";
import { optimizeAssets } from "../commands/assets.js";
import { performanceCommand } from "../commands/performance.js";
import { createRelease } from "../commands/release.js";
import { COMPONENTS } from "../scaffold/components.js";
import { serverManager } from "../server/manager.js";

interface ToolItem {
  key: string;
  name: string;
  title: string;
  desc: string;
  fields: string[];
  defaults: string[];
  guidance: (values: string[]) => string;
}

const TOOLS_CONFIG: ToolItem[] = [
  {
    key: "C",
    name: "components",
    title: "ADD BESPOKE UI COMPONENTS",
    desc: "Scaffold unstyled, accessible Radix-based design primitives into src/components/ui",
    fields: ["Components (comma-separated or all)"],
    defaults: ["accordion"],
    guidance: () => `Catalog: ${Object.keys(COMPONENTS).join(", ")}`,
  },
  {
    key: "O",
    name: "assets",
    title: "OPTIMIZE ASSET PIPELINE",
    desc: "Encode high-density responsive WebP/AVIF images with manifest and zero raster diffs",
    fields: [
      "Input directory",
      "Output directory",
      "Quality (1–100)",
      "Site base path",
      "Widths (blank = 320–3840)",
    ],
    defaults: ["assets/images", "public/media", "78", "/", ""],
    guidance: () =>
      "Preserves original source images. Writes multi-resolution responsive assets and manifest.",
  },
  {
    key: "R",
    name: "release",
    title: "BUILD & PACKAGE RELEASE",
    desc: "Compile production assets and package static SSG or PHP distribution bundle",
    fields: [
      "Output name",
      "Format: both / zip / directory",
      "Build directory (blank = auto)",
      "Skip build: yes / no",
    ],
    defaults: ["release", "both", "", "no"],
    guidance: () =>
      "Runs the project build unless skipped. Packages a new zip/directory without uploading.",
  },
  {
    key: "P",
    name: "performance",
    title: "AUDIT PERFORMANCE BUDGETS",
    desc: "Measure built routes, compressed bundles, media and font sizes",
    fields: [
      "Build directory (blank = auto)",
      "Site base path",
      "Baseline JSON (optional)",
      "Build first: yes / no",
    ],
    defaults: ["", "/", "", "no"],
    guidance: () =>
      "Checks static size budgets. Configure limits in performance.config.json. Does not measure runtime speed.",
  },
];

export function ToolsPanel({
  projectRoot,
  activeProject,
  onBack,
  onLog,
  onTabSelect,
  onEditingChange,
  onExit,
}: {
  projectRoot: string;
  activeProject?: string;
  onBack: () => void;
  onLog: (text: string, level?: "info" | "success" | "warn" | "error") => void;
  onTabSelect?: (tab: "overview" | "servers" | "projects" | "logs" | "workspace" | "tools") => void;
  onEditingChange?: (editing: boolean) => void;
  onExit?: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [field, setField] = useState(0);
  const [values, setValues] = useState<string[]>(TOOLS_CONFIG[0].defaults);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const log = (message: string) => {
    setMessages((previous) => [...previous.slice(-7), message]);
    onLog(message);
  };

  async function execute() {
    setBusy(true);
    setMessages([]);
    try {
      if (selected === 0) {
        await addComponents({ cwd: projectRoot, components: values[0], log });
      } else if (selected === 1) {
        await optimizeAssets({
          cwd: projectRoot,
          input: values[0],
          output: values[1],
          quality: Number(values[2]),
          base: values[3],
          widths: values[4] || undefined,
          log,
        });
      } else if (selected === 2) {
        if (!["yes", "no"].includes(values[3])) {
          throw new Error("Skip build must be yes or no.");
        }
        await createRelease({
          cwd: projectRoot,
          output: values[0],
          format: values[1],
          from: values[2] || undefined,
          skipBuild: values[3] === "yes",
          log,
        });
      }
      if (selected === 3) {
        if (!["yes", "no"].includes(values[3])) throw new Error("Build first must be yes or no.");
        const status = await performanceCommand({
          cwd: projectRoot,
          from: values[0] || undefined,
          base: values[1],
          baseline: values[2] || undefined,
          build: values[3] === "yes",
          log,
        });
        if (status !== 0) throw new Error("Performance audit did not pass; review the findings.");
      }
      onLog(`${TOOLS_CONFIG[selected].title} completed`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((previous) => [...previous.slice(-7), message]);
      onLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  useInput((input, key) => {
    if (key.ctrl && (input === "c" || input === "C" || input === "\x03")) {
      serverManager.stopAll();
      onExit?.();
      if (!process.env.VITEST) {
        process.exit(0);
      }
      return;
    }

    if (busy) return;
    if (key.escape) {
      if (editing) {
        setEditing(false);
        onEditingChange?.(false);
      } else {
        onBack();
      }
      return;
    }

    if (!editing) {
      if (input === "1") {
        onTabSelect?.("overview");
        return;
      }
      if (input === "2") {
        onTabSelect?.("servers");
        return;
      }
      if (input === "3") {
        onTabSelect?.("projects");
        return;
      }
      if (input === "4") {
        onTabSelect?.("logs");
        return;
      }
      if (input === "5") {
        onTabSelect?.("workspace");
        return;
      }
      if (input === "6") {
        onTabSelect?.("tools");
        return;
      }
      if (key.tab) {
        onTabSelect?.("overview");
        return;
      }
      if (key.upArrow) {
        setSelected((value) => (value + TOOLS_CONFIG.length - 1) % TOOLS_CONFIG.length);
        return;
      }
      if (key.downArrow) {
        setSelected((value) => (value + 1) % TOOLS_CONFIG.length);
        return;
      }
      if (input === "c" || input === "C") {
        setSelected(0);
        setValues([...TOOLS_CONFIG[0].defaults]);
        setField(0);
        setMessages([]);
        setEditing(true);
        onEditingChange?.(true);
        return;
      }
      if (input === "o" || input === "O") {
        setSelected(1);
        setValues([...TOOLS_CONFIG[1].defaults]);
        setField(0);
        setMessages([]);
        setEditing(true);
        onEditingChange?.(true);
        return;
      }
      if (input === "r" || input === "R") {
        setSelected(2);
        setValues([...TOOLS_CONFIG[2].defaults]);
        setField(0);
        setMessages([]);
        setEditing(true);
        onEditingChange?.(true);
        return;
      }
      if (input.toLowerCase() === "p") {
        setSelected(3);
        setValues([...TOOLS_CONFIG[3].defaults]);
        setField(0);
        setMessages([]);
        setEditing(true);
        onEditingChange?.(true);
        return;
      }
      if (key.return) {
        setValues([...TOOLS_CONFIG[selected].defaults]);
        setField(0);
        setMessages([]);
        setEditing(true);
        onEditingChange?.(true);
      }
      return;
    }

    if (key.return) {
      void execute();
      return;
    }

    if (key.tab || key.downArrow || key.upArrow) {
      const delta = key.upArrow || (key.tab && key.shift) ? -1 : 1;
      setField(
        (value) =>
          (value + delta + TOOLS_CONFIG[selected].fields.length) %
          TOOLS_CONFIG[selected].fields.length,
      );
      return;
    }

    if (key.ctrl && input === "u") {
      setValues((previous) => previous.map((value, index) => (index === field ? "" : value)));
    } else if (key.backspace || key.delete) {
      setValues((previous) =>
        previous.map((value, index) => (index === field ? value.slice(0, -1) : value)),
      );
    } else if (input && !key.ctrl && !key.meta) {
      setValues((previous) =>
        previous.map((value, index) =>
          index === field
            ? value +
              input
                .replace(/[\r\n]/g, "")
                .split("")
                .filter((char) => char.charCodeAt(0) >= 32)
                .join("")
            : value,
        ),
      );
    }
  });

  const activeName = activeProject ?? path.basename(projectRoot);

  return (
    <Box flexDirection="column" width="100%">
      {/* Top Status Card */}
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        flexDirection="column"
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text bold color="yellow">
            PROJECT TOOLCHAIN & ASSET PIPELINE
          </Text>
          <Text dimColor>● {TOOLS_CONFIG.length} TOOLS AVAILABLE</Text>
        </Box>
        <Box marginTop={1} gap={2}>
          <Box>
            <Text dimColor>Target Directory: </Text>
            <Text bold color="cyan">
              {projectRoot}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Active Project: </Text>
            <Text bold color="green">
              {activeName}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Architecture: </Text>
            <Text bold color="white">
              Zero-Raster Quality
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Main Container */}
      <Box
        borderStyle="single"
        borderColor={editing ? "yellow" : "cyan"}
        paddingX={1}
        flexDirection="column"
      >
        {!editing ? (
          <Box flexDirection="column">
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="cyan">
                PROJECT OPERATIONS & ASSET TOOLS
              </Text>
              <Text dimColor>Use [↑] / [↓] + [Enter] or press key</Text>
            </Box>

            {TOOLS_CONFIG.map((item, index) => {
              const isSelected = selected === index;
              return (
                <Box key={item.key} flexDirection="column" marginY={0}>
                  <Box gap={1} justifyContent="space-between">
                    <Box gap={1}>
                      <Text bold color={isSelected ? "cyan" : "gray"}>
                        {isSelected ? "▶" : " "} [{item.key}]
                      </Text>
                      <Text bold color={isSelected ? "white" : "gray"}>
                        {item.title}
                      </Text>
                    </Box>
                    {isSelected && (
                      <Text bold color="cyan">
                        [Enter] Configure
                      </Text>
                    )}
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
                to configure, or press{" "}
                <Text bold color="yellow">
                  [C]
                </Text>
                ,{" "}
                <Text bold color="yellow">
                  [O]
                </Text>
                ,{" "}
                <Text bold color="yellow">
                  [R]
                </Text>{" "}
                directly.
              </Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="yellow">
                ⚡ CONFIGURE TOOL: {TOOLS_CONFIG[selected].title}
              </Text>
              <Text dimColor>Press [Esc] to return</Text>
            </Box>

            {TOOLS_CONFIG[selected].fields.map((label, index) => {
              const isCurrentField = index === field;
              return (
                <Box key={label} flexDirection="column" marginY={0}>
                  <Box gap={1}>
                    <Text bold color={isCurrentField ? "cyan" : "gray"}>
                      {isCurrentField ? `▶ ${index + 1}. ${label}:` : `  ${index + 1}. ${label}:`}
                    </Text>
                    <Text bold color="white">
                      {values[index] || (isCurrentField ? "_" : "<blank>")}
                      {isCurrentField ? "▌" : ""}
                    </Text>
                  </Box>
                </Box>
              );
            })}

            <Box marginTop={1} paddingLeft={2}>
              <Text dimColor>💡 {TOOLS_CONFIG[selected].guidance(values)}</Text>
            </Box>

            <Box marginTop={1} gap={2}>
              <Text dimColor>Navigation: </Text>
              <Text>
                <Text bold color="cyan">
                  [Tab / ↑↓]
                </Text>{" "}
                <Text dimColor>Next Field</Text>
              </Text>
              <Text>
                <Text bold color="cyan">
                  [Ctrl+U]
                </Text>{" "}
                <Text dimColor>Clear Field</Text>
              </Text>
              <Text>
                <Text bold color="green">
                  [Enter]
                </Text>{" "}
                <Text dimColor>Run Tool</Text>
              </Text>
              <Text>
                <Text bold color="red">
                  [Esc]
                </Text>{" "}
                <Text dimColor>Cancel</Text>
              </Text>
            </Box>
          </Box>
        )}

        {busy && (
          <Box marginTop={1}>
            <Text bold color="yellow">
              ⚡ Running {TOOLS_CONFIG[selected].title}...
            </Text>
          </Box>
        )}

        {messages.length > 0 && (
          <Box
            marginTop={1}
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
          >
            <Box justifyContent="space-between" marginBottom={0}>
              <Text bold color="yellow">
                TOOL EXECUTION OUTPUT
              </Text>
              <Text dimColor>{messages.length} lines</Text>
            </Box>
            {messages.map((message, index) => (
              <Box key={`${index}-${message}`}>
                <Text dimColor>• </Text>
                <Text
                  color={
                    message.toLowerCase().includes("error") ||
                    message.toLowerCase().includes("fail")
                      ? "red"
                      : message.toLowerCase().includes("completed") ||
                          message.toLowerCase().includes("success")
                        ? "green"
                        : undefined
                  }
                  wrap="wrap"
                >
                  {message}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
