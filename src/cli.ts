#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand, runMain } from "citty";
import { adoptProject } from "./commands/adopt.js";
import { doctorCommand } from "./commands/doctor.js";
import { createNewProject } from "./commands/new.js";
import { phaseCommand } from "./commands/phase.js";
import { prototypeInit } from "./commands/prototype.js";
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

const prototypeCmd = defineCommand({
  meta: {
    name: "prototype",
    description: "Manage prototype repository workspace",
  },
  subCommands: {
    init: defineCommand({
      meta: {
        name: "init",
        description: "Initialize a new prototype workspace repository",
      },
      async run() {
        await prototypeInit();
      },
    }),
  },
  async run() {
    await prototypeInit();
  },
});

const adoptCmd = defineCommand({
  meta: {
    name: "adopt",
    description: "Adopt an existing project into Mozole Studio governance",
  },
  args: {
    path: {
      type: "positional",
      description: "Path to project root",
      required: false,
      default: ".",
    },
  },
  async run({ args }) {
    await adoptProject({ targetDir: args.path });
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
    prototype: prototypeCmd,
    adopt: adoptCmd,
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
