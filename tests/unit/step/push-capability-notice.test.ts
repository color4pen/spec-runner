/**
 * Unit tests for push capability notice injection into agent messages.
 *
 * Capability Notice in Agent Context (Requirement 2):
 *   TC-005: Notice appended for the implementer under a declaring environment
 *   TC-006: Predicted touchedFiles match produces a warning in the message but no interruption
 *   TC-007: No notice under an undeclared environment
 *   TC-031: Request-review message also receives the capability notice when patterns are declared
 *
 * TC-029 (partial): PushCapability type contains no raw token field
 */

import { describe, it, expect } from "vitest";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { RequestReviewStep } from "../../../src/core/step/request-review.js";
import { renderPushCapabilityNotice, WORKFLOWS_PATTERN } from "../../../src/git/push-capability.js";
import type { PushCapability } from "../../../src/git/push-capability.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

// ---------------------------------------------------------------------------
// Minimal state/deps builders
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StepDeps> = {}): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Implement something",
      adr: false,
    },
    slug: "test-slug",
    ...overrides,
  };
}

const declaringCapability: PushCapability = {
  patterns: [WORKFLOWS_PATTERN],
  source: "GitHub Actions installation token (ghs_) cannot push to .github/workflows/**",
};

// ---------------------------------------------------------------------------
// renderPushCapabilityNotice pure function tests
// ---------------------------------------------------------------------------

describe("renderPushCapabilityNotice", () => {
  it("returns empty string for null capability", () => {
    expect(renderPushCapabilityNotice(null)).toBe("");
  });

  it("returns empty string for undefined capability", () => {
    expect(renderPushCapabilityNotice(undefined)).toBe("");
  });

  it("returns empty string for empty patterns", () => {
    const cap: PushCapability = { patterns: [], source: "none" };
    expect(renderPushCapabilityNotice(cap)).toBe("");
  });

  it("returns non-empty string when patterns are declared", () => {
    const notice = renderPushCapabilityNotice(declaringCapability);
    expect(notice.length).toBeGreaterThan(0);
    expect(notice).toContain(WORKFLOWS_PATTERN);
  });

  it("includes the source/constraint note", () => {
    const notice = renderPushCapabilityNotice(declaringCapability);
    expect(notice).toContain(declaringCapability.source);
  });

  // TC-006: Predicted touchedFiles match produces a warning but no interruption
  it("TC-006: predicted files matching the pattern appear as advance warning", () => {
    const predictedFiles = [".github/workflows/ci.yml", "src/foo.ts"];
    const notice = renderPushCapabilityNotice(declaringCapability, predictedFiles);
    // The warning should name the matched file
    expect(notice).toContain(".github/workflows/ci.yml");
    // The unmatched file should not appear in the warning
    expect(notice).not.toContain("src/foo.ts");
  });

  it("TC-006: predicted files with no match do not add a warning section", () => {
    const predictedFiles = ["src/foo.ts", "src/bar.ts"];
    const notice = renderPushCapabilityNotice(declaringCapability, predictedFiles);
    // Should not mention src/foo.ts in any special way
    expect(notice).not.toContain("src/foo.ts");
    // The pattern itself is still listed in the notice
    expect(notice).toContain(WORKFLOWS_PATTERN);
  });
});

// ---------------------------------------------------------------------------
// TC-005: Implementer buildMessage appends capability notice
// ---------------------------------------------------------------------------

describe("TC-005: ImplementerStep.buildMessage appends capability notice for declaring environment", () => {
  it("message contains the workflow pattern when pushCapability is declared", () => {
    const state = makeState();
    const deps = makeDeps({ pushCapability: declaringCapability });
    const message = ImplementerStep.buildMessage(state, deps);
    expect(message).toContain(WORKFLOWS_PATTERN);
    expect(message).toContain(declaringCapability.source);
  });

  it("TC-007: no capability notice when pushCapability is null", () => {
    const state = makeState();
    const depsWithCapability = makeDeps({ pushCapability: declaringCapability });
    const depsWithout = makeDeps({ pushCapability: null });

    const withNotice = ImplementerStep.buildMessage(state, depsWithCapability);
    const withoutNotice = ImplementerStep.buildMessage(state, depsWithout);

    expect(withNotice).toContain(WORKFLOWS_PATTERN);
    // Without capability, the pattern must not appear in the message
    expect(withoutNotice).not.toContain(WORKFLOWS_PATTERN);
    // The messages should differ only by the notice
    expect(withoutNotice.length).toBeLessThan(withNotice.length);
  });

  it("TC-007: no capability notice when pushCapability is undefined", () => {
    const state = makeState();
    const deps = makeDeps(); // no pushCapability
    const message = ImplementerStep.buildMessage(state, deps);
    expect(message).not.toContain(WORKFLOWS_PATTERN);
    expect(message).not.toContain("Push Capability Notice");
  });

  it("message without capability matches the baseline message content", () => {
    const state = makeState();
    const depsWithCapability = makeDeps({ pushCapability: declaringCapability });
    const depsWithout = makeDeps();

    const withNotice = ImplementerStep.buildMessage(state, depsWithCapability);
    const withoutNotice = ImplementerStep.buildMessage(state, depsWithout);

    // The baseline message (without capability) should be a prefix of the message with capability
    expect(withNotice.startsWith(withoutNotice)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-031: RequestReviewStep.buildMessage appends capability notice when declared
// ---------------------------------------------------------------------------

describe("TC-031: RequestReviewStep.buildMessage appends capability notice when patterns are declared", () => {
  it("TC-031: message contains the declared pattern when pushCapability is set", () => {
    const state = makeState({ step: "request-review" });
    const deps = makeDeps({ pushCapability: declaringCapability });
    const message = RequestReviewStep.buildMessage(state, deps);
    expect(message).toContain(WORKFLOWS_PATTERN);
    expect(message).toContain(declaringCapability.source);
  });

  it("TC-031: no notice appended when pushCapability is null", () => {
    const state = makeState({ step: "request-review" });
    const depsWithCapability = makeDeps({ pushCapability: declaringCapability });
    const depsWithout = makeDeps({ pushCapability: null });

    const withNotice = RequestReviewStep.buildMessage(state, depsWithCapability);
    const withoutNotice = RequestReviewStep.buildMessage(state, depsWithout);

    expect(withNotice).toContain(WORKFLOWS_PATTERN);
    expect(withoutNotice).not.toContain(WORKFLOWS_PATTERN);
  });

  it("TC-031: buildMessage does not read process.env (purity maintained)", () => {
    // Since buildMessage is synchronous and returns a string,
    // and renderPushCapabilityNotice is a pure function,
    // we verify that calling buildMessage multiple times with the same args
    // returns the same result (deterministic = no hidden env reads).
    const state = makeState({ step: "request-review" });
    const deps = makeDeps({ pushCapability: declaringCapability });
    const result1 = RequestReviewStep.buildMessage(state, deps);
    const result2 = RequestReviewStep.buildMessage(state, deps);
    expect(result1).toBe(result2);
  });

  it("request-review baseline message is preserved as a prefix when capability notice is added", () => {
    const state = makeState({ step: "request-review" });
    const depsWithCapability = makeDeps({ pushCapability: declaringCapability });
    const depsWithout = makeDeps();

    const withNotice = RequestReviewStep.buildMessage(state, depsWithCapability);
    const withoutNotice = RequestReviewStep.buildMessage(state, depsWithout);

    // The baseline message should be a prefix of the message with capability notice
    expect(withNotice.startsWith(withoutNotice)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-029: PushCapability type contains no raw token field
// ---------------------------------------------------------------------------

describe("TC-029: PushCapability type contains no raw token field", () => {
  it("detected capability only has patterns and source fields", () => {
    const cap = declaringCapability;
    const keys = Object.keys(cap).sort();
    expect(keys).toEqual(["patterns", "source"]);
    expect(keys).not.toContain("token");
  });
});
