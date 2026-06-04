/**
 * Unit tests for getPipelineId helper.
 *
 * TC-PIPID-001: pipelineId absent → "standard"
 * TC-PIPID-002: pipelineId present → its value
 */
import { describe, it, expect } from "vitest";
import { getPipelineId } from "../../../src/state/pipeline-id.js";

describe("TC-PIPID-001: pipelineId absent → resolves to standard", () => {
  it("returns 'standard' when pipelineId is undefined", () => {
    expect(getPipelineId({})).toBe("standard");
  });
});

describe("TC-PIPID-002: pipelineId present → returns recorded value", () => {
  it("returns the recorded pipelineId when present", () => {
    expect(getPipelineId({ pipelineId: "standard" })).toBe("standard");
  });

  it("returns a custom pipelineId value when present", () => {
    expect(getPipelineId({ pipelineId: "custom-pipeline" })).toBe("custom-pipeline");
  });
});
