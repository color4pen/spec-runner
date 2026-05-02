/**
 * Tests for finish command: PR state normalization.
 *
 * TC-007: OPEN + CLEAN → OPEN_MERGEABLE
 * TC-008: OPEN + BEHIND → OPEN_BEHIND
 * TC-009: OPEN + DIRTY → OPEN_CONFLICTS
 * TC-010: OPEN + BLOCKED → OPEN_CHECKS_FAILING
 * TC-011: OPEN + CLEAN + checks failing → OPEN_CHECKS_FAILING
 * TC-012: MERGED → MERGED
 * TC-013: CLOSED → CLOSED
 * TC-014: OPEN + unknown mergeStateStatus → OPEN_CHECKS_FAILING (safe default)
 */
import { describe, it, expect } from "vitest";
import { normalizePrState } from "../src/core/finish/pr-state.js";
import { ALL_NORMALIZED_PR_STATES } from "../src/core/finish/types.js";

// TC-007
describe("TC-007: OPEN + CLEAN → OPEN_MERGEABLE", () => {
  it("maps OPEN/CLEAN to OPEN_MERGEABLE", () => {
    expect(normalizePrState({ state: "OPEN", mergeStateStatus: "CLEAN" })).toBe("OPEN_MERGEABLE");
  });
});

// TC-008
describe("TC-008: OPEN + BEHIND → OPEN_BEHIND", () => {
  it("maps OPEN/BEHIND to OPEN_BEHIND", () => {
    expect(normalizePrState({ state: "OPEN", mergeStateStatus: "BEHIND" })).toBe("OPEN_BEHIND");
  });
});

// TC-009
describe("TC-009: OPEN + DIRTY → OPEN_CONFLICTS", () => {
  it("maps OPEN/DIRTY to OPEN_CONFLICTS", () => {
    expect(normalizePrState({ state: "OPEN", mergeStateStatus: "DIRTY" })).toBe("OPEN_CONFLICTS");
  });
});

// TC-010
describe("TC-010: OPEN + BLOCKED → OPEN_CHECKS_FAILING", () => {
  it("maps OPEN/BLOCKED to OPEN_CHECKS_FAILING", () => {
    expect(normalizePrState({ state: "OPEN", mergeStateStatus: "BLOCKED" })).toBe("OPEN_CHECKS_FAILING");
  });
});

// TC-011
describe("TC-011: OPEN + CLEAN + checks failing → OPEN_CHECKS_FAILING", () => {
  it("overrides CLEAN with OPEN_CHECKS_FAILING when statusCheckRollup has FAILURE", () => {
    expect(
      normalizePrState({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        statusCheckRollup: [{ conclusion: "FAILURE" }],
      }),
    ).toBe("OPEN_CHECKS_FAILING");
  });

  it("keeps OPEN_MERGEABLE when no failures in statusCheckRollup", () => {
    expect(
      normalizePrState({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        statusCheckRollup: [{ conclusion: "SUCCESS" }],
      }),
    ).toBe("OPEN_MERGEABLE");
  });

  it("keeps OPEN_MERGEABLE when statusCheckRollup has null conclusion", () => {
    expect(
      normalizePrState({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        statusCheckRollup: [{ conclusion: null }],
      }),
    ).toBe("OPEN_MERGEABLE");
  });
});

// TC-012
describe("TC-012: MERGED → MERGED", () => {
  it("maps MERGED state to MERGED", () => {
    expect(normalizePrState({ state: "MERGED" })).toBe("MERGED");
  });
});

// TC-013
describe("TC-013: CLOSED → CLOSED", () => {
  it("maps CLOSED state to CLOSED", () => {
    expect(normalizePrState({ state: "CLOSED" })).toBe("CLOSED");
  });
});

// TC-014
describe("TC-014: unknown mergeStateStatus → OPEN_CHECKS_FAILING (safe default)", () => {
  it("maps FUTURE_UNKNOWN_VALUE to OPEN_CHECKS_FAILING", () => {
    expect(
      normalizePrState({ state: "OPEN", mergeStateStatus: "FUTURE_UNKNOWN_VALUE" }),
    ).toBe("OPEN_CHECKS_FAILING");
  });

  it("maps UNSTABLE to OPEN_CHECKS_FAILING", () => {
    expect(
      normalizePrState({ state: "OPEN", mergeStateStatus: "UNSTABLE" }),
    ).toBe("OPEN_CHECKS_FAILING");
  });

  it("maps HAS_HOOKS to OPEN_CHECKS_FAILING", () => {
    expect(
      normalizePrState({ state: "OPEN", mergeStateStatus: "HAS_HOOKS" }),
    ).toBe("OPEN_CHECKS_FAILING");
  });

  it("maps empty mergeStateStatus to OPEN_CHECKS_FAILING", () => {
    expect(
      normalizePrState({ state: "OPEN", mergeStateStatus: "" }),
    ).toBe("OPEN_CHECKS_FAILING");
  });
});

// Verify ALL_NORMALIZED_PR_STATES covers all 6 states
describe("ALL_NORMALIZED_PR_STATES covers 6 canonical states", () => {
  it("has exactly 6 states", () => {
    expect(ALL_NORMALIZED_PR_STATES).toHaveLength(6);
    expect(ALL_NORMALIZED_PR_STATES).toContain("OPEN_MERGEABLE");
    expect(ALL_NORMALIZED_PR_STATES).toContain("OPEN_BEHIND");
    expect(ALL_NORMALIZED_PR_STATES).toContain("OPEN_CONFLICTS");
    expect(ALL_NORMALIZED_PR_STATES).toContain("OPEN_CHECKS_FAILING");
    expect(ALL_NORMALIZED_PR_STATES).toContain("MERGED");
    expect(ALL_NORMALIZED_PR_STATES).toContain("CLOSED");
  });
});
