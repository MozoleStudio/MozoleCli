#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand, runMain } from "citty";
import { addComponents } from "./commands/add.js";
import { adoptProject } from "./commands/adopt.js";
import { optimizeAssets } from "./commands/assets.js";
import { enableBackend } from "./commands/backend.js";
import { doctorCommand } from "./commands/doctor.js";
import { createNewProject } from "./commands/new.js";
import { phaseCommand } from "./commands/phase.js";
import { prototypeInit } from "./commands/prototype.js";
import { createRelease } from "./commands/release.js";
import { repomapCommand } from "./commands/repomap.js";
import { testCommand } from "./commands/test.js";
import { uiCommand } from "./commands/ui.js";
import { verifyCommand } from "./commands/verify.js";
import { CLI_VERSION } from "./version.js";

const newCmd = defineCommand({
  meta: {
    name: "new",
    description: "Generate a new client project (Standard React Router 7 or Flagship Creative)",
  },
  args: {
    name: {
      type: "positional",
      description: "Project name",
      required: true,
    },
    flagship: {
      type: "boolean",
      description: "Enable Flagship profile (Wouter + Lenis + Canvas)",
      default: false,
    },
    backend: {
      type: "string",
      description: "Backend runtime: 'none' (default), 'php', or 'node'",
      default: "none",
    },
  },
  async run({ args }) {
    await createNewProject({
      name: args.name,
      flagship: args.flagship,
      backend: (args.backend as "php" | "node" | "none") || "none",
    });
  },
});

const addCmd = defineCommand({
  meta: { name: "add", description: "Add project-owned UI foundations" },
  args: {
    component: {
      type: "positional",
      required: false,
      description: "Component, comma-separated names, or all",
    },
    list: { type: "boolean", description: "List component catalog", default: false },
    path: { type: "string", description: "Project directory" },
  },
  async run({ args }) {
    await addComponents({ components: args.component, list: args.list, cwd: args.path });
  },
});

const assetsCmd = defineCommand({
  meta: { name: "assets", description: "Optimize raster images into responsive AVIF/WebP assets" },
  args: {
    path: { type: "string", description: "Project directory" },
    input: {
      type: "string",
      default: "assets/images",
      description: "Project-relative source directory",
    },
    output: { type: "string", default: "public/media", description: "Destination under public/" },
    widths: { type: "string", description: "Comma-separated widths; default 320 through 3840" },
    quality: { type: "string", default: "78", description: "Encoder quality 1–100" },
    base: { type: "string", default: "/", description: "Deployment base path, e.g. /client/" },
  },
  async run({ args }) {
    await optimizeAssets({
      cwd: args.path,
      input: args.input,
      output: args.output,
      widths: args.widths,
      quality: Number(args.quality),
      base: args.base,
    });
  },
});

const releaseCmd = defineCommand({
  meta: { name: "release", description: "Package static HTML and optional PHP API for deployment" },
  args: {
    path: { type: "string", description: "Project directory" },
    from: { type: "string", description: "Custom static build directory" },
    output: {
      type: "string",
      default: "release",
      description: "Project-relative output name (ZIP adds .zip)",
    },
    format: { type: "string", default: "both", description: "zip, directory, or both" },
    "skip-build": { type: "boolean", default: false, description: "Package existing build output" },
  },
  async run({ args }) {
    await createRelease({
      cwd: args.path,
      from: args.from,
      output: args.output,
      format: args.format,
      skipBuild: args["skip-build"],
    });
  },
});

const prototypeCmd = defineCommand({
  meta: {
    name: "prototype",
    description: "Manage prototype repository workspace",
  },
  args: {
    action: {
      type: "positional",
      description: "Action: 'init' (default)",
      required: false,
      default: "init",
    },
  },
  async run() {
    await prototypeInit();
  },
});

const adoptCmd = defineCommand({
  meta: {
    name: "adopt",
    description: "Adopt a Vite React project into Mozole architecture and tooling",
  },
  args: {
    flagship: { type: "boolean", description: "Adopt as Flagship (Wouter, Motion, Lenis)" },
    backend: { type: "string", description: "Enable php or node backend", default: "none" },
    path: {
      type: "positional",
      description: "Path to project root",
      required: false,
      default: ".",
    },
  },
  async run({ args }) {
    await adoptProject({
      targetDir: args.path,
      flagship: args.flagship || undefined,
      backend: args.backend as "none" | "php" | "node",
    });
  },
});

const backendCmd = defineCommand({
  meta: { name: "backend", description: "Enable a PHP or Node API in an existing project" },
  args: {
    runtime: { type: "positional", required: true, description: "php or node" },
    path: { type: "string", description: "Project directory" },
  },
  async run({ args }) {
    await enableBackend({ runtime: args.runtime, targetDir: args.path });
  },
});

const phaseCmd = defineCommand({
  meta: {
    name: "phase",
    description: "Manage 10-step atomic development phases",
  },
  args: {
    action: {
      type: "positional",
      description: "Phase action: 'status', 'next', or 'reopen'",
      required: false,
      default: "status",
    },
    id: {
      type: "positional",
      description: "Phase number (for reopen)",
      required: false,
    },
  },
  async run({ args }) {
    await phaseCommand({
      action: (args.action as "status" | "next" | "reopen") || "status",
      phaseId: args.id,
    });
  },
});

const repomapCmd = defineCommand({
  meta: {
    name: "repomap",
    description: "Manage docs/repomap architectural index and component registry",
  },
  args: {
    action: {
      type: "positional",
      description: "Action: 'sync' (default) or 'check'",
      required: false,
      default: "sync",
    },
  },
  async run({ args }) {
    await repomapCommand({
      action: (args.action as "sync" | "check") || "sync",
    });
  },
});

const testCmd = defineCommand({
  meta: {
    name: "test",
    description: "Run Mozole quality test suites (contract, a11y, probe, or all)",
  },
  args: {
    type: {
      type: "positional",
      description: "Test type: 'contract', 'a11y', 'probe', or 'all'",
      required: false,
      default: "all",
    },
  },
  async run({ args }) {
    await testCommand({
      type: (args.type as "contract" | "a11y" | "probe" | "all") || "all",
    });
  },
});

const verifyCmd = defineCommand({
  meta: {
    name: "verify",
    description:
      "Run full deterministic verification (lint, typecheck, contracts, AI trace, optional probe)",
  },
  args: {
    probe: {
      type: "boolean",
      description: "Also run headless live DOM geometry & trace probe",
      required: false,
      default: false,
    },
  },
  async run({ args }) {
    const passed = await verifyCommand({ withProbe: Boolean(args.probe) });
    if (!passed) {
      process.exit(1);
    }
  },
});

const doctorCmd = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose local system environment, runtimes, and network ports",
  },
  async run() {
    await doctorCommand();
  },
});

const uiCmd = defineCommand({
  meta: {
    name: "ui",
    description: "Launch interactive terminal cockpit",
  },
  args: {
    component: { type: "string", description: "Component names for component-add action" },
    input: { type: "string", description: "Asset input directory" },
    output: { type: "string", description: "Asset/release output directory" },
    format: { type: "string", description: "Release format" },
    "skip-build": { type: "boolean", default: false, description: "Package an existing build" },
    project: {
      type: "string",
      description: "Target project name or relative path in workspace",
    },
    action: {
      type: "string",
      description: "Direct headless operation action (e.g. phase-status, verify, server-start)",
    },
  },
  async run({ args }) {
    await uiCommand({
      project: args.project,
      action: args.action,
      component: args.component,
      input: args.input,
      output: args.output,
      format: args.format,
      skipBuild: args["skip-build"],
    });
  },
});

export const main = defineCommand({
  meta: {
    name: "mozole",
    version: CLI_VERSION,
    description: "Mozole Studio - Autonomous Development Engine & Process Cockpit",
  },
  subCommands: {
    new: newCmd,
    add: addCmd,
    assets: assetsCmd,
    release: releaseCmd,
    prototype: prototypeCmd,
    adopt: adoptCmd,
    backend: backendCmd,
    phase: phaseCmd,
    repomap: repomapCmd,
    test: testCmd,
    verify: verifyCmd,
    doctor: doctorCmd,
    ui: uiCmd,
  },
  async run({ rawArgs }) {
    // If run without arguments, launch the interactive UI cockpit
    if (rawArgs.length === 0) {
      await uiCommand();
    }
  },
});

export function runCli(argv = process.argv.slice(2)): Promise<void> {
  return runMain(main, { rawArgs: argv });
}

export function isCliEntrypoint(
  argv1 = process.argv[1],
  currentModuleUrl = import.meta.url,
): boolean {
  if (!argv1) return false;
  try {
    const scriptPath = fileURLToPath(currentModuleUrl);
    if (path.resolve(argv1) === path.resolve(scriptPath)) {
      return true;
    }
  } catch {}

  const normalized = argv1.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith("/cli.js") ||
    normalized.endsWith("/cli.ts") ||
    normalized.endsWith("/mozole") ||
    normalized.endsWith("/mozole.cmd") ||
    normalized.endsWith("/mozole.ps1") ||
    normalized.endsWith("/mozole.exe") ||
    normalized.endsWith("/mozole.js") ||
    /(?:^|\/)mozole(?:\.cmd|\.ps1|\.exe)?$/i.test(normalized)
  );
}

if (isCliEntrypoint()) {
  runCli();
}
