import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generatePhpConfig, generatePhpIndex } from "../../src/scaffold/backend.js";
import { atomicWrite } from "../../src/utils/fs.js";
import { run } from "../../src/utils/process.js";
import { useSecurityDirectory } from "./helpers.js";

const valid = { name: "İpek", email: "ipek@example.com", subject: "Contact", message: "Merhaba" };
const trusted = { HTTP_ORIGIN: "https://mozole.studio" };

const hasPhp = await run("php", ["-v"]).then(
  (result) => result.exitCode === 0,
  () => false,
);

describe.skipIf(!hasPhp)("security: generated PHP request boundary", () => {
  const directory = useSecurityDirectory();
  // Missing PHP is a visible setup failure, never silently skipped security coverage.
  beforeAll(async () => {
    const version = await run("php", ["-n", "-r", "echo PHP_VERSION_ID;"], { timeoutMs: 3000 });
    expect(version.exitCode, "PHP 8.1+ is required for the security suite").toBe(0);
    expect(Number(version.stdout)).toBeGreaterThanOrEqual(80100);
  });
  beforeEach(async () => {
    await atomicWrite(path.join(directory(), "index.php"), generatePhpIndex());
    await atomicWrite(
      path.join(directory(), "config.php"),
      generatePhpConfig().replace(
        "sys_get_temp_dir() . '/mozole_rate_limits'",
        "__DIR__ . '/rates'",
      ),
    );
    // Only mail transport is substituted; all request validation and quota code is real.
    await atomicWrite(
      path.join(directory(), "mailer.php"),
      `<?php
function mozole_send_mail(...$args): bool {
    file_put_contents(__DIR__ . '/dispatch.log', json_encode($args) . "\\n", FILE_APPEND | LOCK_EX);
    return !file_exists(__DIR__ . '/fail-mail');
}
`,
    );
    await atomicWrite(
      path.join(directory(), "request.php"),
      `<?php
$_SERVER = array_merge(['REQUEST_METHOD' => 'POST', 'REMOTE_ADDR' => '127.0.0.1'], json_decode($argv[1], true));
$_POST = json_decode($argv[2], true);
register_shutdown_function(function () { echo "\\nSTATUS=" . (http_response_code() ?: 200); });
require __DIR__ . '/index.php';
`,
    );
  });

  async function request(
    server: Record<string, string> = trusted,
    payload: Record<string, unknown> = valid,
  ) {
    const result = await run(
      "php",
      [
        "-n",
        path.join(directory(), "request.php"),
        JSON.stringify(server),
        JSON.stringify(payload),
      ],
      { timeoutMs: 3000 },
    );
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.stderr).toBe("");
    const [body, status] = result.stdout.split("\nSTATUS=");
    expect(status).toMatch(/^\d{3}$/);
    return { body: body ? JSON.parse(body) : null, status: Number(status) };
  }

  async function noDispatch() {
    await expect(fs.stat(path.join(directory(), "dispatch.log"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }

  it.each([
    "https://evil.example",
    "https://mozole.studio.evil.example",
    "https://mozole.studio@evil.example",
    "http://mozole.studio",
    "https://mozole.studio:444",
    "null",
    "file:///etc/passwd",
    "//mozole.studio",
  ])("rejects spoofed origin %s even when Referer is trusted", async (origin) => {
    expect(
      (await request({ HTTP_ORIGIN: origin, HTTP_REFERER: "https://mozole.studio/contact" }))
        .status,
    ).toBe(403);
    await noDispatch();
    await expect(fs.stat(path.join(directory(), "rates"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects requests with neither Origin nor Referer", async () => {
    expect((await request({})).status).toBe(403);
    await noDispatch();
  });

  it("accepts exact trusted Referer fallback and dispatches once", async () => {
    expect((await request({ HTTP_REFERER: "https://mozole.studio:443/contact" })).status).toBe(200);
    const calls = (await fs.readFile(path.join(directory(), "dispatch.log"), "utf8"))
      .trim()
      .split("\n");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]).slice(1)).toEqual([
      valid.email,
      valid.name,
      valid.subject,
      valid.message,
    ]);
  });

  it.each(["PUT", "DELETE", "PATCH", "TRACE", "CONNECT"])(
    "rejects method %s without dispatch",
    async (method) => {
      expect((await request({ ...trusted, REQUEST_METHOD: method })).status).toBe(405);
      await noDispatch();
    },
  );

  it.each(["0", 0, "bot", " https://spam.example "])(
    "traps honeypot value %j without sending mail",
    async (value) => {
      const response = await request(trusted, { ...valid, _mozole_website_url: value });
      expect(response).toEqual({
        status: 200,
        body: { success: true, message: "Message delivered." },
      });
      await noDispatch();
    },
  );

  it.each(["name", "email", "subject", "message"])(
    "rejects non-string %s values without PHP warnings",
    async (field) => {
      // Distinct addresses keep validation cases independent of the per-IP quota.
      for (const [index, value] of [[], {}, true, 42].entries()) {
        expect(
          (
            await request(
              { ...trusted, REMOTE_ADDR: `192.0.2.${index + 1}` },
              { ...valid, [field]: value },
            )
          ).status,
        ).toBe(400);
      }
      await noDispatch();
    },
  );

  it.each([
    ["name", 120],
    ["subject", 200],
    ["message", 5000],
  ] as const)("enforces Unicode length boundary for %s", async (field, limit) => {
    expect((await request(trusted, { ...valid, [field]: "İ".repeat(limit) })).status).toBe(200);
    expect((await request(trusted, { ...valid, [field]: "İ".repeat(limit + 1) })).status).toBe(400);
    expect(
      (await fs.readFile(path.join(directory(), "dispatch.log"), "utf8")).trim().split("\n"),
    ).toHaveLength(1);
  });

  it.each(["victim@example.com\r\nBcc: attacker@example.com", "bad\0@example.com", "not-an-email"])(
    "rejects email header injection %j",
    async (email) => {
      expect((await request(trusted, { ...valid, email })).status).toBe(400);
      await noDispatch();
    },
  );

  it("does not trust forwarded IP headers to bypass quota", async () => {
    for (let i = 0; i < 7; i++) {
      const response = await request(
        { ...trusted, HTTP_X_FORWARDED_FOR: `192.0.2.${i}`, HTTP_X_REAL_IP: `198.51.100.${i}` },
        { _mozole_website_url: "bot" },
      );
      expect(response.status).toBe(i < 5 ? 200 : 429);
    }
    await noDispatch();
  });

  it("enforces the quota atomically under concurrent submissions", async () => {
    await fs.mkdir(path.join(directory(), "rates"));
    const responses = await Promise.all(Array.from({ length: 12 }, () => request()));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(7);
    expect(
      (await fs.readFile(path.join(directory(), "dispatch.log"), "utf8")).trim().split("\n"),
    ).toHaveLength(5);
  }, 10000);

  it("fails closed when quota storage is unavailable", async () => {
    await atomicWrite(path.join(directory(), "rates"), "blocked");
    expect((await request()).status).toBe(503);
    await noDispatch();
  });

  it("expires old quota entries without disabling a new quota", async () => {
    const hash = createHash("md5").update("127.0.0.1").digest("hex");
    const file = path.join(directory(), "rates", `rl_${hash}.json`);
    await atomicWrite(file, JSON.stringify(Array(5).fill(Math.floor(Date.now() / 1000) - 600)));
    expect((await request()).status).toBe(200);
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toHaveLength(1);
  });

  it("reports transport failure without exposing internal paths", async () => {
    await atomicWrite(path.join(directory(), "fail-mail"), "1");
    const response = await request();
    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain(directory());
  });
});
