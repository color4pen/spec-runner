/**
 * Unit tests for spec-review lightweight mode enhancement
 *
 * TC-5.1: buildSpecReviewModeInstruction("lightweight") contains expected sections
 * TC-5.2: buildSpecReviewModeInstruction("full") returns unchanged full-review string (regression)
 * TC-5.3: SpecReviewStep.getMaxTurns — type-dependent return values
 * TC-5.5: SpecReviewStep.buildMessage with refactoring type includes lightweight instruction
 */
import { describe, it, expect } from "vitest";
import { buildSpecReviewInitialMessage } from "../../../src/prompts/spec-review-system.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(type: string): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type, slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "change/test-slug",
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// TC-5.1: buildSpecReviewModeInstruction("lightweight")
// ---------------------------------------------------------------------------
describe("TC-5.1: buildSpecReviewModeInstruction('lightweight') expands to structured text", () => {
  function getLightweightInstruction(): string {
    return buildSpecReviewInitialMessage({
      slug: "test-slug",
      repository: "owner/repo",
      requestType: "refactoring",
      specReviewMode: "lightweight",
    });
  }

  it("contains 'Lightweight review' or 'behavior-preserving'", () => {
    const msg = getLightweightInstruction();
    const hasBehaviorPreserving = msg.includes("behavior-preserving") || msg.includes("Lightweight review");
    expect(hasBehaviorPreserving).toBe(true);
  });

  it("contains 'architecture' in Verify section", () => {
    const msg = getLightweightInstruction();
    // Verify section comes before Simplify/Skip sections
    const verifyIdx = msg.indexOf("Verify");
    const archIdx = msg.indexOf("architecture");
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    expect(archIdx).toBeGreaterThan(verifyIdx);
  });

  it("contains 'correctness' in Verify section", () => {
    const msg = getLightweightInstruction();
    const verifyIdx = msg.indexOf("Verify");
    const correctnessIdx = msg.indexOf("correctness");
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    expect(correctnessIdx).toBeGreaterThan(verifyIdx);
  });

  it("contains 'completeness' in Simplify section", () => {
    const msg = getLightweightInstruction();
    const simplifyIdx = msg.indexOf("Simplify");
    const completenessIdx = msg.indexOf("completeness");
    expect(simplifyIdx).toBeGreaterThanOrEqual(0);
    expect(completenessIdx).toBeGreaterThan(simplifyIdx);
  });

  it("contains 'feasibility' in Skip section", () => {
    const msg = getLightweightInstruction();
    const skipIdx = msg.indexOf("Skip");
    const feasibilityIdx = msg.indexOf("feasibility");
    expect(skipIdx).toBeGreaterThanOrEqual(0);
    expect(feasibilityIdx).toBeGreaterThan(skipIdx);
  });

  it("contains 'security' in Skip section", () => {
    const msg = getLightweightInstruction();
    const skipIdx = msg.indexOf("Skip");
    const securityIdx = msg.indexOf("security");
    expect(skipIdx).toBeGreaterThanOrEqual(0);
    expect(securityIdx).toBeGreaterThan(skipIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-5.2: buildSpecReviewModeInstruction("full") — regression test
// ---------------------------------------------------------------------------
describe("TC-5.2: buildSpecReviewModeInstruction('full') returns full review string (regression)", () => {
  it("full mode instruction contains OWASP Top 10 reference", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "test-slug",
      repository: "owner/repo",
      requestType: "new-feature",
      specReviewMode: "full",
    });
    expect(msg).toContain("OWASP Top 10");
  });

  it("full mode instruction does not contain 'Lightweight review'", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "test-slug",
      repository: "owner/repo",
      requestType: "new-feature",
      specReviewMode: "full",
    });
    expect(msg).not.toContain("Lightweight review");
  });

  it("full mode instruction does not contain 'behavior-preserving'", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "test-slug",
      repository: "owner/repo",
      requestType: "new-feature",
      specReviewMode: "full",
    });
    expect(msg).not.toContain("behavior-preserving");
  });
});

// ---------------------------------------------------------------------------
// TC-5.3: SpecReviewStep.getMaxTurns — type-dependent return values
// ---------------------------------------------------------------------------
describe("TC-5.3: SpecReviewStep.getMaxTurns returns 10 for lightweight types, undefined for full types", () => {
  it("refactoring type → 10", () => {
    const state = makeJobState("refactoring");
    expect(SpecReviewStep.getMaxTurns?.(state)).toBe(10);
  });

  it("chore type → 10", () => {
    const state = makeJobState("chore");
    expect(SpecReviewStep.getMaxTurns?.(state)).toBe(10);
  });

  it("new-feature type → undefined", () => {
    const state = makeJobState("new-feature");
    expect(SpecReviewStep.getMaxTurns?.(state)).toBeUndefined();
  });

  it("spec-change type → undefined", () => {
    const state = makeJobState("spec-change");
    expect(SpecReviewStep.getMaxTurns?.(state)).toBeUndefined();
  });

  it("bug-fix type → undefined", () => {
    const state = makeJobState("bug-fix");
    expect(SpecReviewStep.getMaxTurns?.(state)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-5.4: SpecReviewStep.maxTurns === 15 (unchanged static fallback)
// ---------------------------------------------------------------------------
describe("TC-5.4: SpecReviewStep.maxTurns === 15 (static fallback unchanged)", () => {
  it("maxTurns static field remains 15", () => {
    expect(SpecReviewStep.maxTurns).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// TC-5.5: SpecReviewStep.buildMessage with refactoring type includes lightweight instruction
// ---------------------------------------------------------------------------
describe("TC-5.5: SpecReviewStep.buildMessage with refactoring type includes lightweight instruction", () => {
  it("initial message for refactoring request contains lightweight instruction markers", () => {
    const state = makeJobState("refactoring");
    const deps = {
      config: {
        version: 1 as const,
        runtime: "local" as const,
        agents: {},
        github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] as string[] },
      },
      slug: "my-refactor",
      cwd: "/tmp/test",
      request: {
        type: "refactoring",
        title: "Refactor something",
        slug: "my-refactor",
        content: "Refactor the module",
        enabled: [],
        baseBranch: "main",
      },
      repo: { owner: "testowner", name: "testrepo" },
    };
    const msg = SpecReviewStep.buildMessage(state, deps);
    const hasLightweight = msg.includes("Lightweight review") || msg.includes("behavior-preserving");
    expect(hasLightweight).toBe(true);
  });

  it("initial message for new-feature request does NOT contain lightweight instruction", () => {
    const state = makeJobState("new-feature");
    const deps = {
      config: {
        version: 1 as const,
        runtime: "local" as const,
        agents: {},
        github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] as string[] },
      },
      slug: "my-feature",
      cwd: "/tmp/test",
      request: {
        type: "new-feature",
        title: "New feature",
        slug: "my-feature",
        content: "Add a new feature",
        enabled: [],
        baseBranch: "main",
      },
      repo: { owner: "testowner", name: "testrepo" },
    };
    const msg = SpecReviewStep.buildMessage(state, deps);
    expect(msg).not.toContain("Lightweight review");
    expect(msg).not.toContain("behavior-preserving");
  });
});
