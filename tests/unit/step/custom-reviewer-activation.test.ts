/**
 * T-09: createCustomReviewerStep — activation field tests.
 *
 * Verifies:
 * - snapshot with paths → step.activation.paths set
 * - snapshot with requestTypes → step.activation.requestTypes set
 * - snapshot without either → step.activation is undefined
 */
import { describe, it, expect } from "vitest";
import { createCustomReviewerStep } from "../../../src/core/step/custom-reviewer.js";
import type { ReviewerSnapshot } from "../../../src/kernel/reviewer-snapshot.js";

function makeSnapshot(
  overrides: Partial<ReviewerSnapshot> = {},
): ReviewerSnapshot {
  return {
    name: "security",
    maxIterations: 3,
    purpose: "security purpose",
    criteria: "security criteria",
    judgment: "security judgment",
    freeText: "",
    ...overrides,
  };
}

describe("createCustomReviewerStep — activation", () => {
  it("sets activation.paths when snapshot has paths", () => {
    const snapshot = makeSnapshot({ paths: ["src/auth/**", "src/security/**"] });
    const step = createCustomReviewerStep(snapshot);
    expect(step.activation).toBeDefined();
    expect(step.activation?.paths).toEqual(["src/auth/**", "src/security/**"]);
  });

  it("sets activation.requestTypes when snapshot has requestTypes", () => {
    const snapshot = makeSnapshot({ requestTypes: ["new-feature"] });
    const step = createCustomReviewerStep(snapshot);
    expect(step.activation).toBeDefined();
    expect(step.activation?.requestTypes).toEqual(["new-feature"]);
  });

  it("sets both activation.paths and activation.requestTypes when both present", () => {
    const snapshot = makeSnapshot({
      paths: ["src/**"],
      requestTypes: ["spec-change"],
    });
    const step = createCustomReviewerStep(snapshot);
    expect(step.activation?.paths).toEqual(["src/**"]);
    expect(step.activation?.requestTypes).toEqual(["spec-change"]);
  });

  it("activation is undefined when neither paths nor requestTypes is set", () => {
    const snapshot = makeSnapshot();
    const step = createCustomReviewerStep(snapshot);
    expect(step.activation).toBeUndefined();
  });

  it("activation is undefined when both paths and requestTypes are undefined", () => {
    const snapshot = makeSnapshot({ paths: undefined, requestTypes: undefined });
    const step = createCustomReviewerStep(snapshot);
    expect(step.activation).toBeUndefined();
  });
});
