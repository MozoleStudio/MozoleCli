import net from "node:net";
import pc from "picocolors";
import { run } from "../utils/process.js";
import { CLI_VERSION } from "../version.js";

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function doctorCommand(): Promise<void> {
  console.log(pc.cyan(`\n🩺 Mozole Studio Doctor (v${CLI_VERSION})`));
  console.log(pc.gray("═".repeat(60)));

  // 1. Node.js
  const nodeVersion = process.version;
  const major = Number(nodeVersion.slice(1).split(".")[0]);
  if (major >= 20) {
    console.log(pc.green(`  ✓ Node.js: ${nodeVersion} (compatible with Node 20+)`));
  } else {
    console.log(pc.red(`  ✗ Node.js: ${nodeVersion} (Node 20+ required)`));
  }

  // 2. Git
  try {
    const gitRes = await run("git", ["--version"]);
    if (gitRes.exitCode === 0) {
      console.log(pc.green(`  ✓ Git: ${gitRes.stdout.trim()}`));
    } else {
      console.log(pc.yellow("  ! Git: Not installed or not in PATH"));
    }
  } catch {
    console.log(pc.yellow("  ! Git: Not available"));
  }

  // 3. PHP Runtime
  try {
    const phpRes = await run("php", ["-v"]);
    if (phpRes.exitCode === 0) {
      const firstLine = phpRes.stdout.split("\n")[0];
      console.log(pc.green(`  ✓ PHP: ${firstLine}`));
    } else {
      console.log(
        pc.yellow(
          "  ! PHP: Not detected. (Optional for frontend-only, required for backend testing)",
        ),
      );
    }
  } catch {
    console.log(pc.yellow("  ! PHP: Not installed in PATH. (Optional for pure frontend)"));
  }

  // 4. Ports Check
  console.log(pc.bold("\nNetwork Port Availability:"));
  for (const port of [5173, 3000, 8080]) {
    const available = await isPortAvailable(port);
    if (available) {
      console.log(pc.green(`  ✓ Port ${port}: Available`));
    } else {
      console.log(pc.yellow(`  ! Port ${port}: In use by another service`));
    }
  }

  console.log(pc.gray(`\n${"═".repeat(60)}`));
  console.log(pc.green("✓ Doctor environment diagnostics completed.\n"));
}
