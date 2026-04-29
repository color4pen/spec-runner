/**
 * TC-012 (this file): register_branch input_schema is byte-identical to pre-refactor definition.
 *
 * Verifies that the refactor did not change the register_branch tool definition.
 * The input_schema JSON must be byte-for-byte identical to the canonical shape.
 *
 * Source: step-execution-architecture/spec.md — Scenario: input_schema for register_branch is unchanged;
 *         tasks.md — 7.4
 */
import { describe, it, expect } from "vitest";
import { registerBranchTool } from "../src/core/tools/register-branch.js";
import { ProposeStep } from "../src/core/step/propose.js";

/**
 * The canonical input_schema for register_branch as defined pre-refactor.
 * This is the authoritative reference — do NOT change this object.
 */
const CANONICAL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    branch: {
      type: "string",
      description:
        "The proposed branch name, e.g. feat/2026-04-27-my-feature. Must be non-empty.",
    },
  },
  required: ["branch"],
} as const;

// TC-012: register_branch input_schema byte-identical to pre-refactor
describe("TC-012: register_branch input_schema is byte-identical to pre-refactor definition", () => {
  it("registerBranchTool.definition.input_schema matches canonical schema exactly", () => {
    const { input_schema } = registerBranchTool.definition;
    expect(JSON.stringify(input_schema)).toBe(JSON.stringify(CANONICAL_INPUT_SCHEMA));
  });

  it("tool name is still 'register_branch'", () => {
    expect(registerBranchTool.definition.name).toBe("register_branch");
  });

  it("tool type is still 'custom'", () => {
    expect(registerBranchTool.definition.type).toBe("custom");
  });

  it("ProposeStep.toolHandlers contains 'register_branch' key", () => {
    expect(ProposeStep.toolHandlers).toBeDefined();
    expect(ProposeStep.toolHandlers!.has("register_branch")).toBe(true);
  });

  it("ProposeStep.toolHandlers 'register_branch' value is a function", () => {
    const handler = ProposeStep.toolHandlers!.get("register_branch");
    expect(typeof handler).toBe("function");
  });

  it("input_schema.required is ['branch'] (no extra fields)", () => {
    const { input_schema } = registerBranchTool.definition;
    expect(input_schema.required).toEqual(["branch"]);
  });

  it("input_schema.properties.branch.type is 'string'", () => {
    const { input_schema } = registerBranchTool.definition;
    expect((input_schema.properties?.branch as Record<string, unknown>)?.type).toBe("string");
  });
});
