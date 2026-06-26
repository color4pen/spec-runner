/**
 * Unit tests for resolveResumeStep.
 *
 * Covers all five resolution branches and regression paths for existing behaviour.
 */
import { describe, expect, it } from "vitest";
import { resolveResumeStep } from "../resolve-step.js";
import type { ResumePoint } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResumePoint(step = "design"): ResumePoint {
  return { step, reason: "timeout", iterationsExhausted: 2 };
}

// ---------------------------------------------------------------------------
// AC1: hard-crash fallback — state.step used when resumePoint is absent
// ---------------------------------------------------------------------------

describe("resolveResumeStep — AC1: hard-crash fallback via state.step", () => {
  it("returns state.step when resumePoint is null and --from is undefined", () => {
    // AC1: status=running / step="design" / resumePoint=null / pid dead
    expect(resolveResumeStep(undefined, null, "design")).toBe("design");
  });

  it("returns any valid pipeline step from stateStep", () => {
    expect(resolveResumeStep(undefined, null, "implementer")).toBe("implementer");
    expect(resolveResumeStep(undefined, null, "verification")).toBe("verification");
    expect(resolveResumeStep(undefined, null, "pr-create")).toBe("pr-create");
  });
});

// ---------------------------------------------------------------------------
// AC2: no resume position — throw when state.step is absent or not a pipeline step
// ---------------------------------------------------------------------------

describe("resolveResumeStep — AC2: throws when no resume position can be determined", () => {
  it("throws when stateStep is 'init' (not a pipeline step)", () => {
    // "init" is not in AGENT_STEP_NAMES or CLI_STEP_NAMES
    expect(() => resolveResumeStep(undefined, null, "init")).toThrow(
      "Cannot resolve resume step",
    );
  });

  it("throws when stateStep is undefined (job never started a step)", () => {
    expect(() => resolveResumeStep(undefined, null, undefined)).toThrow(
      "Cannot resolve resume step",
    );
  });

  it("throws when stateStep is an arbitrary unknown string", () => {
    expect(() => resolveResumeStep(undefined, null, "unknown-step")).toThrow(
      "Cannot resolve resume step",
    );
  });
});

// ---------------------------------------------------------------------------
// AC3: resumePoint takes priority over stateStep (regression)
// ---------------------------------------------------------------------------

describe("resolveResumeStep — AC3: resumePoint has priority over stateStep", () => {
  it("returns resumePoint.step when both resumePoint and stateStep are provided", () => {
    // resumePoint wins over stateStep — existing graceful-stop behaviour unchanged
    const rp = makeResumePoint("spec-review");
    expect(resolveResumeStep(undefined, rp, "design")).toBe("spec-review");
  });

  it("returns resumePoint.step when stateStep is undefined", () => {
    const rp = makeResumePoint("code-review");
    expect(resolveResumeStep(undefined, rp, undefined)).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// --from priority (regression)
// ---------------------------------------------------------------------------

describe("resolveResumeStep — --from flag has highest priority", () => {
  it("returns --from step when it is a valid pipeline step name", () => {
    const rp = makeResumePoint("design");
    // --from wins over both resumePoint and stateStep
    expect(resolveResumeStep("implementer", rp, "design")).toBe("implementer");
  });

  it("returns --from step even when resumePoint and stateStep are absent", () => {
    expect(resolveResumeStep("verification", null, undefined)).toBe("verification");
  });

  it("returns --from step when stateStep also points to a valid step", () => {
    expect(resolveResumeStep("implementer", null, "design")).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// --from invalid value (regression)
// ---------------------------------------------------------------------------

describe("resolveResumeStep — --from with invalid step name", () => {
  it("throws an error listing available steps when --from is not a valid step", () => {
    expect(() => resolveResumeStep("not-a-step", null, undefined)).toThrow(
      'Invalid --from value: "not-a-step"',
    );
  });

  it("includes available step names in the error message", () => {
    let msg = "";
    try {
      resolveResumeStep("bogus", null, "design");
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toContain("Available step names:");
    expect(msg).toContain("design");
    expect(msg).toContain("implementer");
  });

  it("throws for invalid --from even when resumePoint exists", () => {
    const rp = makeResumePoint("design");
    expect(() => resolveResumeStep("bad-step", rp, "design")).toThrow(
      'Invalid --from value: "bad-step"',
    );
  });
});
