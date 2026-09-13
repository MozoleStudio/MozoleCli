import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { zip } from "fflate";
import { scaffoldToolsGuide } from "../scaffold/tools-guide.js";
import { atomicWrite, exists } from "../utils/fs.js";
import { run } from "../utils/process.js";
import { projectDirectory, projectPath, regularFiles } from "../utils/project-files.js";

export interface ReleaseOptions {
  cwd?: string;
  from?: string;
  output?: string;
  format?: string;
  skipBuild?: boolean;
  log?: (message: string) => void;
}

const excluded =
  /(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|vendor|storage|cache|logs?|tests?|coverage|\.DS_Store)(\/|$)|\.(?:map|log|bak|sql|sqlite3?|db|pem|key|p12|pfx)$/i;

export async function createRelease(options: ReleaseOptions = {}): Promise<string[]> {
  const log = options.log ?? console.log;
  const root = await projectDirectory(options.cwd);
  const format = options.format ?? "both";
  if (!["zip", "directory", "both"].includes(format))
    throw new Error("Release format must be zip, directory or both.");
  const metadataPath = path.join(root, ".mozole/project.json");
  const metadata = (await exists(metadataPath))
    ? JSON.parse(await readFile(metadataPath, "utf8"))
    : {};
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const backend =
    metadata.backend ??
    ((await exists(path.join(root, "server/index.mjs")))
      ? "node"
      : (await exists(path.join(root, "api/index.php")))
        ? "php"
        : "none");
  if (backend === "node")
    throw new Error(
      "This release target supports static HTML and PHP. A Node API needs a separate Node deployment.",
    );
  if (backend !== "php" && backend !== "none") throw new Error(`Unsupported backend: ${backend}`);
  const flagship = metadata.profile === "flagship" || Boolean(pkg.dependencies?.wouter);
  const framework = Boolean(pkg.devDependencies?.["@react-router/dev"]);
  const hasBuildClient = await exists(path.join(root, "build/client"));
  const defaultSource = hasBuildClient
    ? "build/client"
    : framework && !flagship
      ? "build/client"
      : "dist";
  const source = await projectPath(root, options.from ?? defaultSource);
  const destination = await projectPath(root, options.output ?? "release");
  const archive = await projectPath(root, `${options.output ?? "release"}.zip`);
  if (
    source === destination ||
    source.startsWith(destination + path.sep) ||
    destination.startsWith(source + path.sep)
  )
    throw new Error("Release source and destination must not overlap.");
  for (const output of format === "zip"
    ? [archive]
    : format === "directory"
      ? [destination]
      : [destination, archive]) {
    if (await exists(output))
      throw new Error(
        `Output already exists: ${output}. Choose a new --output; releases are never overwritten.`,
      );
  }
  if (backend === "php") {
    await projectPath(root, "api");
    if (!(await exists(path.join(root, "api/index.php"))))
      throw new Error("PHP API entry api/index.php is missing.");
    if (
      (await exists(path.join(root, "api/composer.json"))) ||
      (await exists(path.join(root, "composer.json")))
    )
      throw new Error(
        "Composer API dependencies require a dedicated deployment recipe; this target packages the dependency-free PHP module.",
      );
  }
  if (!options.skipBuild) {
    if (!pkg.scripts?.build)
      throw new Error(
        "No build script found. Build manually and use --skip-build --from <static-output>.",
      );
    const result = await run("npm", ["run", "build"], { cwd: root, timeoutMs: 300_000 });
    if (result.exitCode !== 0) throw new Error(`Build failed:\n${result.stderr}\n${result.stdout}`);
  }
  await projectPath(root, path.relative(root, source));
  if (!(await exists(path.join(source, "index.html"))))
    throw new Error(
      `Static index.html not found in ${source}. Use --from for a custom build output.`,
    );
  const files: Record<string, Uint8Array> = Object.create(null);
  const omitted: string[] = [];
  let totalBytes = 0;
  async function collect(dir: string, prefix = "") {
    for (const file of await regularFiles(dir)) {
      if (file.includes("\\")) throw new Error(`Unsupported filename in release: ${file}`);
      const target = prefix + file;
      if (
        excluded.test(file) ||
        file.split("/").some((part) => part.startsWith(".") && part !== ".htaccess") ||
        (prefix && file === "router.php")
      ) {
        omitted.push(target);
        continue;
      }
      if (!prefix && (file.startsWith("api/") || /\.(?:php|cjs)$/i.test(file)))
        throw new Error(
          `Unexpected server code in static output: ${file}. Keep server code outside public/.`,
        );
      if (prefix && !/\.(?:php|json)$/.test(file) && path.basename(file) !== ".htaccess") {
        omitted.push(target);
        continue;
      }
      const full = path.join(dir, file);
      totalBytes += (await stat(full)).size;
      if (totalBytes > 512 * 1024 * 1024)
        throw new Error(
          "Release exceeds the 512 MiB packaging limit. Split large media into external storage.",
        );
      files[target] = await readFile(full);
    }
  }
  await collect(source);
  if (backend === "php") await collect(path.join(root, "api"), "api/");
  const encode = (value: string) => new TextEncoder().encode(value);
  files[".htaccess"] ??= encode(`Options -Indexes -MultiViews
<FilesMatch "(?i)(^\\.env|\\.(map|log|bak|sql|sqlite|pem|key)$)">
  Require all denied
</FilesMatch>
RewriteEngine On
RewriteRule ^api(?:/|$) - [L]
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.+?)/?$ $1.html [L]
${flagship || !framework ? "RewriteRule ^ index.html [L]" : ""}
`);
  if (backend === "php") {
    // Always append a guard, even if the project customizes its API rewrite rules.
    const existing = files["api/.htaccess"]
      ? new TextDecoder().decode(files["api/.htaccess"])
      : "RewriteEngine On\nRewriteRule ^(health|contact)$ index.php [L]\n";
    files["api/.htaccess"] =
      encode(`${existing}\nOptions -Indexes\n<FilesMatch "(?i)^(config|mailer|router)\\.php$|\\.json$">
  Require all denied
</FilesMatch>
`);
  }
  const manifest = {
    profile: metadata.profile ?? (flagship ? "flagship" : "standard"),
    backend,
    built: !options.skipBuild,
    source: path.relative(root, source),
    omitted,
    files: Object.entries(files).map(([file, bytes]) => ({
      file,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  };
  files["release-manifest.json"] = encode(JSON.stringify(manifest, null, 2));
  files["DEPLOYMENT.txt"] =
    encode(`Upload the contents of this directory to the web document root using FTP or rsync.
No upload has been performed by Mozole. Do not upload the source project or node_modules.
${backend === "php" ? "Requires PHP 8.1+ and Apache mod_rewrite/AllowOverride for the supplied .htaccess files. Configure api/config.php for the customer's origins and mail recipient. Verify the server mail transport separately. Protect configuration files when using Nginx or another server; .htaccess is Apache-only." : "Static hosting is sufficient. Apply SPA fallback to index.html for client-routed projects."}
For Nginx, route /api/health and /api/contact to api/index.php through PHP-FPM and deny access to api/config.php, api/mailer.php and API JSON files.
${options.skipBuild ? "Existing static output was packaged with --skip-build; freshness was not established." : "The project build script completed before packaging."}
Review release-manifest.json for omitted files. Supply secrets on the server; .env, keys, databases, source maps and runtime storage are excluded.
`);
  await projectPath(root, path.relative(root, destination));
  await projectPath(root, path.relative(root, archive));
  await mkdir(path.dirname(destination), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(destination), ".mozole-release-"));
  const outputs: string[] = [];
  try {
    const stagedDirectory = path.join(staging, "site");
    await mkdir(stagedDirectory);
    for (const [file, bytes] of Object.entries(files))
      await atomicWrite(path.join(stagedDirectory, file), Buffer.from(bytes));
    if (format !== "directory") {
      const data = await new Promise<Uint8Array>((resolve, reject) =>
        zip(files, { level: 6 }, (error, zipped) => (error ? reject(error) : resolve(zipped))),
      );
      await atomicWrite(path.join(staging, "release.zip"), Buffer.from(data));
    }
    // Check again after potentially long builds/encoding; preserve other runs' artifacts.
    for (const output of format === "zip"
      ? [archive]
      : format === "directory"
        ? [destination]
        : [destination, archive]) {
      if (await exists(output)) throw new Error(`Output appeared during packaging: ${output}`);
    }
    if (format !== "zip") {
      try {
        await rename(stagedDirectory, destination);
      } catch {
        await cp(stagedDirectory, destination, { recursive: true });
        await rm(stagedDirectory, { recursive: true, force: true });
      }
      outputs.push(destination);
    }
    if (format !== "directory") {
      try {
        await rename(path.join(staging, "release.zip"), archive);
      } catch {
        await copyFile(path.join(staging, "release.zip"), archive);
        await rm(path.join(staging, "release.zip"), { force: true });
      }
      outputs.push(archive);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  await scaffoldToolsGuide(root);
  log(
    `Release created: ${outputs.join(", ")}. Excluded ${omitted.length} files. No deployment performed.`,
  );
  return outputs;
}
