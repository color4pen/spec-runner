/**
 * Unit tests for fixer-helpers.ts
 */
import { describe, it, expect } from "vitest";
import {
  FIXER_STEP_NAMES,
  getPreviousSessionId,
  isFixerContinuation,
  buildContinuationMessage,
} from "../../../src/core/step/fixer-helpers.js";
import type { JobState } from "../../../src/state/schema.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-fixer",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FIXER_STEP_NAMES
// ---------------------------------------------------------------------------

describe("FIXER_STEP_NAMES", () => {
  it("contains spec-fixer", () => {
    expect(FIXER_STEP_NAMES.has("spec-fixer")).toBe(true);
  });

  it("contains build-fixer", () => {
    expect(FIXER_STEP_NAMES.has("build-fixer")).toBe(true);
  });

  it("contains code-fixer", () => {
    expect(FIXER_STEP_NAMES.has("code-fixer")).toBe(true);
  });

  it("does not contain other step names", () => {
    expect(FIXER_STEP_NAMES.has("spec-review")).toBe(false);
    expect(FIXER_STEP_NAMES.has("implementer")).toBe(false);
    expect(FIXER_STEP_NAMES.has("code-review")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPreviousSessionId
// ---------------------------------------------------------------------------

describe("getPreviousSessionId", () => {
  it("returns null when state.steps is undefined", () => {
    const state = makeMinimalState(); // no steps field
    expect(getPreviousSessionId(state, "spec-fixer")).toBeNull();
  });

  it("returns null when state.steps[stepName] is an empty array", () => {
    const state = makeMinimalState({ steps: { "spec-fixer": [] } });
    expect(getPreviousSessionId(state, "spec-fixer")).toBeNull();
  });

  it("returns the sessionId from the last run when it is non-null", () => {
    const state = makeMinimalState({
      steps: {
        "spec-fixer": [
          {
            attempt: 1,
            sessionId: "sess-abc",
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(getPreviousSessionId(state, "spec-fixer")).toBe("sess-abc");
  });

  it("returns null when the last run's sessionId is null", () => {
    const state = makeMinimalState({
      steps: {
        "spec-fixer": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(getPreviousSessionId(state, "spec-fixer")).toBeNull();
  });

  it("returns the sessionId from the LAST run (not the first) when multiple runs exist", () => {
    const state = makeMinimalState({
      steps: {
        "spec-fixer": [
          {
            attempt: 1,
            sessionId: "sess-first",
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            attempt: 2,
            sessionId: "sess-second",
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:01:00.000Z",
            endedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
      },
    });
    expect(getPreviousSessionId(state, "spec-fixer")).toBe("sess-second");
  });
});

// ---------------------------------------------------------------------------
// isFixerContinuation
// ---------------------------------------------------------------------------

describe("isFixerContinuation", () => {
  it("returns true when previous run exists and has a non-null sessionId", () => {
    const state = makeMinimalState({
      steps: {
        "spec-fixer": [
          {
            attempt: 1,
            sessionId: "sess-abc",
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(isFixerContinuation(state, "spec-fixer")).toBe(true);
  });

  it("returns false when no previous run exists", () => {
    const state = makeMinimalState();
    expect(isFixerContinuation(state, "spec-fixer")).toBe(false);
  });

  it("returns false when previous run exists but sessionId is null", () => {
    const state = makeMinimalState({
      steps: {
        "spec-fixer": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(isFixerContinuation(state, "spec-fixer")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildContinuationMessage
// ---------------------------------------------------------------------------

describe("buildContinuationMessage", () => {
  it("includes the findingsPath in the output", () => {
    const msg = buildContinuationMessage({
      stepName: "spec-fixer",
      findingsPath: "specrunner/changes/my-slug/spec-review-result.md",
      slug: "my-slug",
    });
    expect(msg).toContain("specrunner/changes/my-slug/spec-review-result.md");
  });

  it("wraps the message in <user-request> tags", () => {
    const msg = buildContinuationMessage({
      stepName: "spec-fixer",
      findingsPath: "some/path.md",
      slug: "test-slug",
    });
    expect(msg).toContain("<user-request>");
    expect(msg).toContain("</user-request>");
  });

  it("does not contain request.md full text or project.md content (no re-injection)", () => {
    const msg = buildContinuationMessage({
      stepName: "spec-fixer",
      findingsPath: "some/path.md",
      slug: "test-slug",
    });
    // Should not contain these large re-injection markers
    expect(msg).not.toContain("Original request:");
    expect(msg).not.toContain("<project-context>");
    expect(msg).not.toContain("You are the spec-fixer");
  });

  it("uses 'reviewer' as source label for spec-fixer", () => {
    const msg = buildContinuationMessage({
      stepName: "spec-fixer",
      findingsPath: "some/path.md",
      slug: "test-slug",
    });
    expect(msg).toContain("reviewer");
  });

  it("uses 'reviewer' as source label for code-fixer", () => {
    const msg = buildContinuationMessage({
      stepName: "code-fixer",
      findingsPath: "some/path.md",
      slug: "test-slug",
    });
    expect(msg).toContain("reviewer");
  });

  it("uses 'verification' as source label for build-fixer", () => {
    const msg = buildContinuationMessage({
      stepName: "build-fixer",
      findingsPath: "some/path.md",
      slug: "test-slug",
    });
    expect(msg).toContain("verification");
    expect(msg).not.toContain("reviewer から");
  });
});
