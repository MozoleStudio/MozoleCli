import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generatePhpConfig, generatePhpMailer } from "../../src/scaffold/backend.js";
import { atomicWrite } from "../../src/utils/fs.js";
import { run } from "../../src/utils/process.js";
import { useSecurityDirectory } from "./helpers.js";

describe("security: generated PHP mailer", () => {
  const directory = useSecurityDirectory();
  beforeAll(async () => {
    const version = await run("php", ["-n", "-r", "echo PHP_VERSION_ID;"], { timeoutMs: 3000 });
    expect(version.exitCode).toBe(0);
    expect(Number(version.stdout)).toBeGreaterThanOrEqual(80100);
  });

  beforeEach(async () => {
    // Namespace resolves only the final mail() call to a capture function. The actual
    // generated sanitizer and HTML builder run unchanged; no system mail is sent.
    const mailer = generatePhpMailer().replace("<?php", "<?php\nnamespace MozoleSecurity;");
    await atomicWrite(path.join(directory(), "mailer.php"), mailer);
    await atomicWrite(
      path.join(directory(), "capture.php"),
      `<?php
namespace MozoleSecurity;
function mail($to, $subject, $body, $headers): bool {
    file_put_contents(__DIR__ . '/mail.json', json_encode(compact('to', 'subject', 'body', 'headers')));
    return true;
}
define('MOZOLE_SECURE', true);
require __DIR__ . '/mailer.php';
$args = json_decode($argv[1], true);
echo json_encode(mozole_send_mail(...$args));
`,
    );
  });

  async function send(
    overrides: { to?: string; email?: string; name?: string; subject?: string; body?: string } = {},
  ) {
    const args = [
      { mail_to: overrides.to ?? "recipient@example.com", mail_subject_prefix: "[Contact] " },
      overrides.email ?? "sender@example.com",
      overrides.name ?? "Sender",
      overrides.subject ?? "Subject",
      overrides.body ?? "Body",
    ];
    const result = await run(
      "php",
      ["-n", path.join(directory(), "capture.php"), JSON.stringify(args)],
      { timeoutMs: 3000 },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    return JSON.parse(result.stdout) as boolean;
  }

  it.each(["victim@example.com\r\nBcc: evil@example.com", "bad\0@example.com", "invalid"])(
    "rejects injected sender or recipient %j before transport",
    async (address) => {
      expect(await send({ email: address })).toBe(false);
      expect(await send({ to: address })).toBe(false);
      await expect(fs.stat(path.join(directory(), "mail.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("strips CR/LF/NUL from encoded subject and display name", async () => {
    expect(
      await send({
        name: "Sender\r\nBcc: evil@example.com\0",
        subject: "Hello\r\nBcc: evil@example.com\0",
      }),
    ).toBe(true);
    const mail = JSON.parse(await fs.readFile(path.join(directory(), "mail.json"), "utf8"));
    const subject = mail.subject.match(/^=\?UTF-8\?B\?(.+)\?=$/);
    expect(subject).not.toBeNull();
    expect(Buffer.from(subject[1], "base64").toString("utf8")).toBe(
      "[Contact] HelloBcc: evil@example.com",
    );
    const from = mail.headers.match(/From: =\?UTF-8\?B\?(.+)\?= <sender@example.com>/);
    expect(from).not.toBeNull();
    expect(Buffer.from(from[1], "base64").toString("utf8")).toBe("SenderBcc: evil@example.com");
    expect(mail.headers.split("\r\n")).toHaveLength(5);
    expect(mail.headers).not.toMatch(/(?:^|\r\n)(?:Bcc|Cc):/i);
  });

  it("escapes attacker HTML in every rendered field", async () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>&';
    expect(await send({ name: payload, subject: payload, body: payload })).toBe(true);
    const mail = JSON.parse(await fs.readFile(path.join(directory(), "mail.json"), "utf8"));
    expect(mail.body).not.toContain("<script>");
    expect(mail.body).not.toContain("<img");
    expect(mail.body.match(/&lt;img/g)).toHaveLength(3);
    expect(mail.body).toContain("&quot;");
    expect(mail.body).toContain("&amp;");
  });

  it.each(["config", "mailer"])("blocks direct execution of %s.php", async (module) => {
    const source = module === "config" ? generatePhpConfig() : generatePhpMailer();
    const file = path.join(directory(), `direct-${module}.php`);
    await atomicWrite(file, source);
    const result = await run("php", ["-n", file], { timeoutMs: 3000 });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ error: "Direct access prohibited" });
    expect(result.stdout).not.toContain("info@mozole.studio");
  });
});
