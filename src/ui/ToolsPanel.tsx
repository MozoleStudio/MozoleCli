import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { addComponents } from "../commands/add.js";
import { optimizeAssets } from "../commands/assets.js";
import { createRelease } from "../commands/release.js";
import { COMPONENTS } from "../scaffold/components.js";

const tools = ["Add components", "Optimize images", "Create release"];
const fields = [
  ["Components (comma-separated or all)"],
  [
    "Input directory",
    "Output directory",
    "Quality (1–100)",
    "Site base path",
    "Widths (blank = 320–3840)",
  ],
  [
    "Output name",
    "Format: both / zip / directory",
    "Build directory (blank = auto)",
    "Skip build: yes / no",
  ],
];
const defaults = [
  ["accordion"],
  ["assets/images", "public/media", "78", "/", ""],
  ["release", "both", "", "no"],
];

export function ToolsPanel({
  projectRoot,
  onBack,
  onLog,
  onTabSelect,
  onEditingChange,
}: {
  projectRoot: string;
  onBack: () => void;
  onLog: (text: string, level?: "info" | "success" | "warn" | "error") => void;
  onTabSelect?: (tab: "overview" | "servers" | "projects" | "logs" | "workspace" | "tools") => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [field, setField] = useState(0);
  const [values, setValues] = useState<string[]>(defaults[0]);
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
      if (selected === 0) await addComponents({ cwd: projectRoot, components: values[0], log });
      else if (selected === 1)
        await optimizeAssets({
          cwd: projectRoot,
          input: values[0],
          output: values[1],
          quality: Number(values[2]),
          base: values[3],
          widths: values[4] || undefined,
          log,
        });
      else {
        if (!["yes", "no"].includes(values[3])) throw new Error("Skip build must be yes or no.");
        await createRelease({
          cwd: projectRoot,
          output: values[0],
          format: values[1],
          from: values[2] || undefined,
          skipBuild: values[3] === "yes",
          log,
        });
      }
      onLog(`${tools[selected]} completed`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((previous) => [...previous.slice(-7), message]);
      onLog(message, "error");
    } finally {
      setBusy(false);
    }
  }
  useInput((input, key) => {
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
        setSelected((value) => (value + 2) % 3);
        return;
      }
      if (key.downArrow) {
        setSelected((value) => (value + 1) % 3);
        return;
      }
      if (key.return) {
        setValues([...defaults[selected]]);
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
      setField((value) => (value + delta + fields[selected].length) % fields[selected].length);
      return;
    }
    if (key.ctrl && input === "u")
      setValues((previous) => previous.map((value, index) => (index === field ? "" : value)));
    else if (key.backspace || key.delete)
      setValues((previous) =>
        previous.map((value, index) => (index === field ? value.slice(0, -1) : value)),
      );
    else if (input && !key.ctrl && !key.meta)
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
  });
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold>PROJECT TOOLS — {projectRoot}</Text>
      {!editing ? (
        <>
          {tools.map((name, index) => (
            <Text key={name} color={selected === index ? "cyan" : undefined}>
              {selected === index ? "› " : "  "}
              {name}
            </Text>
          ))}
          <Text dimColor>↑↓ select · Enter configure · [1-5] switch tab · Esc overview</Text>
        </>
      ) : (
        <>
          <Text bold color="cyan">
            {tools[selected]}
          </Text>
          {fields[selected].map((label, index) => (
            <Text key={label} color={index === field ? "cyan" : undefined}>
              {index === field ? "› " : "  "}
              {label}: {values[index]}
              {index === field ? "▌" : ""}
            </Text>
          ))}
          {selected === 0 && <Text dimColor>Catalog: {Object.keys(COMPONENTS).join(", ")}</Text>}
          {selected === 1 && (
            <Text dimColor>
              Preserves originals. Writes responsive images and manifest; no screenshots.
            </Text>
          )}
          {selected === 2 && (
            <Text dimColor>
              Runs the build unless skipped. Packages locally; does not upload. Existing releases
              are preserved.
            </Text>
          )}
          <Text dimColor>Tab/↑↓ field · Ctrl+U clear · Enter run · Esc back</Text>
        </>
      )}
      {busy && <Text color="yellow">Working…</Text>}
      {messages.map((message, index) => (
        <Text key={`${index}-${message}`} wrap="wrap">
          {message}
        </Text>
      ))}
    </Box>
  );
}
