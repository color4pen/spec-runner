/**
 * Unit tests for src/prompts/builder.ts
 *
 * TC-BLD-01: buildSystemPrompt(base, [f1, f2]) returns "base\n\nf1\n\nf2"
 * TC-BLD-02: buildSystemPrompt(base, []) returns "base"
 */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../src/prompts/builder.js";

describe("buildSystemPrompt", () => {
  it("TC-BLD-01: joins base and fragments with double newlines", () => {
    const result = buildSystemPrompt("base", ["f1", "f2"]);
    expect(result).toBe("base\n\nf1\n\nf2");
  });

  it("TC-BLD-02: returns base unchanged when fragments array is empty", () => {
    const result = buildSystemPrompt("base", []);
    expect(result).toBe("base");
  });
});
