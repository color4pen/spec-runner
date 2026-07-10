/**
 * Unit tests for resolveResumeStep and buildAllowedStepSet.
 *
 * Covers all five resolution branches and regression paths for existing behaviour,
 * plus member→coordinator mapping (T-01, T-02).
 */
import { describe, expect, it } from "vitest";
import { resolveResumeStep, buildAllowedStepSet } from "../resolve-step.js";
import type { ResumePoint } from "../../../state/schema.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../../pipeline/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResumePoint(step = "design"): ResumePoint {
  return { step, reason: "timeout", iterationsExhausted: 2 };
}

/** Build a minimal reviewer array for use in tests. */
function makeReviewers(names: string[]): ReadonlyArray<{ name: string }> {
  return names.map((name) => ({ name }));
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

// ---------------------------------------------------------------------------
// T-01: buildAllowedStepSet — coordinator inclusion
// ---------------------------------------------------------------------------

describe("buildAllowedStepSet — coordinator inclusion", () => {
  it("includes 'custom-reviewers' when reviewers are present", () => {
    const set = buildAllowedStepSet(makeReviewers(["security"]));
    expect(set.has(CUSTOM_REVIEWERS_STEP_NAME)).toBe(true);
  });

  it("includes each reviewer member name when reviewers are present", () => {
    const set = buildAllowedStepSet(makeReviewers(["security", "cross-boundary-invariants"]));
    expect(set.has("security")).toBe(true);
    expect(set.has("cross-boundary-invariants")).toBe(true);
  });

  it("includes 'regression-gate' when reviewers are present", () => {
    const set = buildAllowedStepSet(makeReviewers(["security"]));
    expect(set.has("regression-gate")).toBe(true);
  });

  it("does NOT include 'custom-reviewers' when reviewers array is empty", () => {
    const set = buildAllowedStepSet([]);
    expect(set.has(CUSTOM_REVIEWERS_STEP_NAME)).toBe(false);
  });

  it("does NOT include 'custom-reviewers' when reviewers is undefined", () => {
    const set = buildAllowedStepSet(undefined);
    expect(set.has(CUSTOM_REVIEWERS_STEP_NAME)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-02: resolveResumeStep — member → coordinator mapping
// ---------------------------------------------------------------------------

describe("resolveResumeStep — member → coordinator mapping", () => {
  const reviewers = makeReviewers(["cross-boundary-invariants", "security"]);

  // Build allowed set that includes the coordinator and member names
  const allowedWithReviewers = buildAllowedStepSet(reviewers);

  it("maps resumePoint.step member name → 'custom-reviewers' (job 8d5f9b5c fixture)", () => {
    // This is the exact scenario from issue #769 / job 8d5f9b5c:
    // process interrupted while cross-boundary-invariants member was running
    const rp = makeResumePoint("cross-boundary-invariants");
    const result = resolveResumeStep(undefined, rp, undefined, allowedWithReviewers, reviewers);
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });

  it("maps --from <member name> → 'custom-reviewers'", () => {
    const result = resolveResumeStep(
      "cross-boundary-invariants",
      null,
      undefined,
      allowedWithReviewers,
      reviewers,
    );
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });

  it("passes through --from 'custom-reviewers' directly (coordinator direct spec)", () => {
    const result = resolveResumeStep(
      CUSTOM_REVIEWERS_STEP_NAME,
      null,
      undefined,
      allowedWithReviewers,
      reviewers,
    );
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });

  it("does NOT map resumePoint.step for non-member static steps", () => {
    const rp = makeResumePoint("code-review");
    const result = resolveResumeStep(undefined, rp, undefined, allowedWithReviewers, reviewers);
    expect(result).toBe("code-review");
  });

  it("does NOT map --from for non-member static steps", () => {
    const result = resolveResumeStep(
      "code-review",
      null,
      undefined,
      allowedWithReviewers,
      reviewers,
    );
    expect(result).toBe("code-review");
  });

  it("throws for truly unknown --from that is not a member name", () => {
    expect(() =>
      resolveResumeStep("totally-unknown", null, undefined, allowedWithReviewers, reviewers),
    ).toThrow('Invalid --from value: "totally-unknown"');
  });

  it("maps second member name too (security)", () => {
    const rp = makeResumePoint("security");
    const result = resolveResumeStep(undefined, rp, undefined, allowedWithReviewers, reviewers);
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });
});

// ---------------------------------------------------------------------------
// T-02: existing tests still green with 5th arg omitted (backward compat)
// ---------------------------------------------------------------------------

describe("resolveResumeStep — backward compat when reviewers omitted", () => {
  it("resolves resumePoint.step without mapping when no reviewers provided", () => {
    const rp = makeResumePoint("design");
    expect(resolveResumeStep(undefined, rp, undefined)).toBe("design");
  });

  it("resolves --from without mapping when no reviewers provided", () => {
    expect(resolveResumeStep("implementer", null, undefined)).toBe("implementer");
  });
});
