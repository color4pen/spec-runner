import { describe, it, expect } from "vitest";
import { maskSensitive } from "../stdout.js";

describe("maskSensitive", () => {
  describe("existing patterns", () => {
    it("masks sk-ant- tokens", () => {
      expect(maskSensitive("sk-ant-api03-abcdef")).toBe("sk-ant-api03-...");
    });

    it("masks gh_-prefixed tokens (gho_, ghp_, etc.)", () => {
      expect(maskSensitive("gho_abc123")).toBe("gho_...");
      expect(maskSensitive("ghp_abc123")).toBe("ghp_...");
      expect(maskSensitive("ghr_abc123")).toBe("ghr_...");
      expect(maskSensitive("ghs_abc123")).toBe("ghs_...");
      expect(maskSensitive("ghu_abc123")).toBe("ghu_...");
    });

    it("masks github_pat_ tokens", () => {
      expect(maskSensitive("github_pat_abc123_def")).toBe("github_...");
    });
  });

  describe("OpenAI patterns", () => {
    it("masks sk-proj- tokens", () => {
      expect(maskSensitive("sk-proj-abcdefghijklmnopqrstu")).toBe("sk-proj-...");
    });

    it("masks sk-svcacct- tokens", () => {
      expect(maskSensitive("sk-svcacct-abcdefghijklmnopqrstu")).toBe("sk-svcacct-...");
    });

    it("masks generic sk- tokens with >= 20 chars after sk-", () => {
      // "sk-" + 20 chars = 23 total, but pattern is sk-[A-Za-z0-9_-]{20,}
      // so the 20 chars is the part after "sk-"
      expect(maskSensitive("sk-abcdefghijklmnopqrstu")).toBe("sk-...");
    });

    it("does not mask sk- tokens shorter than 20 chars after prefix", () => {
      expect(maskSensitive("sk-short")).toBe("sk-short");
    });
  });

  describe("mixed content", () => {
    it("masks all keys in a string containing multiple keys", () => {
      const input = "anthropic=sk-ant-api03-abcdef openai=sk-proj-abcdefghijklmnopqrstu";
      const result = maskSensitive(input);
      expect(result).toBe("anthropic=sk-ant-api03-... openai=sk-proj-...");
    });

    it("returns unchanged string when no keys present", () => {
      const plain = "hello world, nothing sensitive here";
      expect(maskSensitive(plain)).toBe(plain);
    });
  });
});
