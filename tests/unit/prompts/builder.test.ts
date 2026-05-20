/**
 * Unit tests for src/prompts/builder.ts
 *
 * TC-BLD-01: buildSystemPrompt(base, [f1, f2]) returns "base\n\nf1\n\nf2"
 * TC-BLD-02: buildSystemPrompt(base, []) returns "base"
 * TC-BLD-03: buildSystemPrompt starts with base (no automatic prepend)
 *
 * NOTE: SPEC_RUNNER_COMMON_CONTEXT was removed from buildSystemPrompt in the
 * rules-md-injection change. Agents now read rules.md via Read tool at runtime.
 */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../src/prompts/builder.js";

describe("buildSystemPrompt", () => {
  it("TC-BLD-01: joins base and fragments with double newlines", () => {
    const result = buildSystemPrompt("base", ["f1", "f2"]);
    expect(result).toBe("base\n\nf1\n\nf2");
  });

  it("TC-BLD-02: returns base when fragments array is empty", () => {
    const result = buildSystemPrompt("base", []);
    expect(result).toBe("base");
  });

  it("TC-BLD-03: result starts with base string", () => {
    const result = buildSystemPrompt("my-base", ["f1"]);
    expect(result.startsWith("my-base")).toBe(true);
  });
});
