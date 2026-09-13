import { describe, expect, it } from "vitest";
import { findAiTracesInContent } from "../../src/utils/ai-trace.js";
import { isSafeProjectName } from "../../src/utils/fs.js";
import { formatPhaseCommitMessage } from "../../src/utils/git.js";

describe("Phase 1 Utilities", () => {
  describe("isSafeProjectName", () => {
    it("accepts valid alphanumeric project names", () => {
      expect(isSafeProjectName("hotel-luxe")).toBe(true);
      expect(isSafeProjectName("client_site")).toBe(true);
      expect(isSafeProjectName("project123")).toBe(true);
    });

    it("rejects unsafe or path-traversal names", () => {
      expect(isSafeProjectName("")).toBe(false);
      expect(isSafeProjectName(".")).toBe(false);
      expect(isSafeProjectName("../foo")).toBe(false);
      expect(isSafeProjectName("foo/bar")).toBe(false);
      expect(isSafeProjectName("foo\\bar")).toBe(false);
    });
  });

  describe("formatPhaseCommitMessage", () => {
    it("formats clean conventional commit message with padded number", () => {
      expect(formatPhaseCommitMessage(1, "Design Tokens")).toBe("feat(phase-01): design-tokens");
      expect(formatPhaseCommitMessage(10, "Deployment Readiness")).toBe(
        "feat(phase-10): deployment-readiness",
      );
    });
  });

  describe("findAiTracesInContent", () => {
    it("detects forbidden AI markers", () => {
      const syntheticMarker1 = ["Generated", "by", "AI", "assistant"].join(" ");
      const syntheticMarker2 = ["Co-authored-by:", "Claude", "<noreply@anthropic.com>"].join(" ");
      const dirtyCode = `
        // ${syntheticMarker1}
        export const x = 1;
        // ${syntheticMarker2}
      `;
      const matches = findAiTracesInContent(dirtyCode, "test.ts");
      expect(matches.length).toBe(2);
      expect(matches[0].match.toLowerCase()).toContain(["generated", "by", "ai"].join(" "));
      expect(matches[1].match.toLowerCase()).toContain(["co-authored-by:", "claude"].join(" "));
    });

    it("passes clean bespoke code", () => {
      const cleanCode = `
        // Action button primitive
        export const Button = () => <button>Click</button>;
      `;
      const matches = findAiTracesInContent(cleanCode, "test.ts");
      expect(matches.length).toBe(0);
    });
  });
});
