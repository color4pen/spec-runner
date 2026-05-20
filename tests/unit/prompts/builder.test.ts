/**
 * Unit tests for src/prompts/builder.ts
 *
 * TC-BLD-01: buildSystemPrompt(base, [f1, f2]) returns SPEC_RUNNER_COMMON_CONTEXT + "\n\nbase\n\nf1\n\nf2"
 * TC-BLD-02: buildSystemPrompt(base, []) returns SPEC_RUNNER_COMMON_CONTEXT + "\n\nbase"
 * TC-BLD-03: buildSystemPrompt always starts with SPEC_RUNNER_COMMON_CONTEXT
 */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../src/prompts/builder.js";
import { SPEC_RUNNER_COMMON_CONTEXT } from "../../../src/prompts/fragments.js";

describe("buildSystemPrompt", () => {
  it("TC-BLD-01: joins base and fragments with double newlines (prepended by SPEC_RUNNER_COMMON_CONTEXT)", () => {
    const result = buildSystemPrompt("base", ["f1", "f2"]);
    expect(result).toBe(`${SPEC_RUNNER_COMMON_CONTEXT}\n\nbase\n\nf1\n\nf2`);
  });

  it("TC-BLD-02: returns SPEC_RUNNER_COMMON_CONTEXT + base when fragments array is empty", () => {
    const result = buildSystemPrompt("base", []);
    expect(result).toBe(`${SPEC_RUNNER_COMMON_CONTEXT}\n\nbase`);
  });

  it("TC-BLD-03: result always starts with SPEC_RUNNER_COMMON_CONTEXT", () => {
    const result = buildSystemPrompt("base", ["f1"]);
    expect(result.startsWith(SPEC_RUNNER_COMMON_CONTEXT)).toBe(true);
  });
});
