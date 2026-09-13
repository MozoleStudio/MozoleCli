import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generatePhpConfig,
  generatePhpIndex,
  generatePhpMailer,
} from "../../src/scaffold/backend.js";
import { atomicWrite } from "../../src/utils/fs.js";
import { run } from "../../src/utils/process.js";

const hasPhp = await run("php", ["-v"]).then(
  (result) => result.exitCode === 0,
  () => false,
);

describe.skipIf(!hasPhp)("Generated PHP backend", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "mozole-php-"));
    await atomicWrite(path.join(directory, "index.php"), generatePhpIndex());
    await atomicWrite(
      path.join(directory, "config.php"),
      generatePhpConfig().replace(
        "sys_get_temp_dir() . '/mozole_rate_limits'",
        "__DIR__ . '/rates'",
      ),
    );
    // Replace only transport: tests never send real mail.
    await atomicWrite(
      path.join(directory, "mailer.php"),
      "<?php function mozole_send_mail(...$args): bool { return false; }",
    );
    await atomicWrite(
      path.join(directory, "request.php"),
      `<?php
$_SERVER = array_merge(['REQUEST_METHOD' => 'POST', 'REMOTE_ADDR' => '127.0.0.1'], json_decode($argv[1], true));
$_POST = json_decode($argv[2], true);
register_shutdown_function(function () { echo "\\nSTATUS=" . (http_response_code() ?: 200); });
require __DIR__ . '/index.php';
`,
    );
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function request(server: Record<string, string>, payload: Record<string, unknown> = {}) {
    const result = await run("php", [
      "-n",
      path.join(directory, "request.php"),
      JSON.stringify(server),
      JSON.stringify(payload),
    ]);
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    const [body, status] = result.stdout.split("\nSTATUS=");
    return { body: JSON.parse(body), status: Number(status) };
  }

  it.each([
    { HTTP_ORIGIN: "https://untrusted.example" },
    { HTTP_ORIGIN: "null", HTTP_REFERER: "https://mozole.studio/contact" },
    { HTTP_REFERER: "http://mozole.studio/contact" },
    { HTTP_REFERER: "https://mozole.studio:444/contact" },
    {},
  ])("rejects untrusted or missing request origins: %j", async (server) => {
    expect((await request(server)).status).toBe(403);
  });

  it("accepts trusted referer fallback with the default HTTPS port", async () => {
    const response = await request(
      { HTTP_REFERER: "https://mozole.studio:443/contact" },
      { _mozole_website_url: "bot" },
    );
    expect(response.status).toBe(200);
  });

  it("rejects array-valued contact fields without a PHP TypeError", async () => {
    expect((await request({ HTTP_ORIGIN: "https://mozole.studio" }, { name: [] })).status).toBe(
      400,
    );
  });

  it("validates Unicode without mbstring and reports failed mail transport", async () => {
    const response = await request(
      { HTTP_ORIGIN: "https://mozole.studio" },
      { name: "İpek", email: "ipek@example.com", message: "Merhaba" },
    );
    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
  });

  it("enforces one quota across concurrent requests", async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request({ HTTP_ORIGIN: "https://mozole.studio" }, { _mozole_website_url: "bot" }),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(7);
  });

  it("fails closed when rate-limit storage cannot be opened", async () => {
    await atomicWrite(path.join(directory, "rates"), "not a directory");
    expect((await request({ HTTP_ORIGIN: "https://mozole.studio" })).status).toBe(503);
  });

  it("generates a syntactically valid mailer and rejects malformed recipients", async () => {
    await atomicWrite(path.join(directory, "mailer.php"), generatePhpMailer());
    const lint = await run("php", ["-n", "-l", path.join(directory, "mailer.php")]);
    expect(lint.exitCode, lint.stdout + lint.stderr).toBe(0);
    const result = await run("php", [
      "-n",
      "-r",
      "define('MOZOLE_SECURE', true); require $argv[1]; echo json_encode(mozole_send_mail(['mail_to' => \"bad\\r\\nrecipient\"], 'sender@example.com', 'Sender', 'Subject', 'Body'));",
      path.join(directory, "mailer.php"),
    ]);
    expect(result.stdout).toBe("false");
  });
});
