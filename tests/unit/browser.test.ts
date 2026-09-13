import { describe, expect, it } from "vitest";
import { findLocalChromium, getBrowserLaunchArgs } from "../../src/utils/browser.js";

describe("browser detection utility", () => {
  it("detects local Chromium/Brave if available on system", async () => {
    const browser = await findLocalChromium();
    if (browser) {
      expect(browser.type).toBe("system");
      expect(browser.executablePath).toBeDefined();
      expect(browser.name).toMatch(/(Brave|Chrome|Chromium|Edge)/i);
    }
  });

  it("provides standard headless launch args with sandboxing and extension flags", () => {
    const args = getBrowserLaunchArgs();
    expect(args).toContain("--no-sandbox");
    expect(args).toContain("--disable-brave-extension");
  });
});
