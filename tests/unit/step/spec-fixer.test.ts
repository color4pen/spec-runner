/**
 * Unit tests for SpecFixerStep buildMessage session continuity
 *
 * TC-BM-01: SpecFixerStep.buildMessage returns full prompt on first run
 * TC-BM-02: SpecFixerStep.buildMessage returns short continuation prompt when previous session exists
 */
import { describe, it, expect } from "vitest";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { buildContinuationMessage } from "../../../src/core/step/fixer-helpers.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { specReviewResultPath } from "../../../src/util/paths.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-fixer",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", slug, baseBranch: "main", content: "Fix spec.", enabled: [] },
    slug,
  };
}

// ---------------------------------------------------------------------------
// TC-BM-01: spec-fixer initial run → full prompt
// ---------------------------------------------------------------------------

describe("TC-BM-01: SpecFixerStep.buildMessage returns full prompt on first run", () => {
  it("returns full prompt containing 'You are the spec-fixer'", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).toContain("You are the spec-fixer");
  });

  it("full prompt contains Change folder and Branch", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).toContain("Change folder:");
    expect(message).toContain("feat/my-change");
  });

  it("full prompt does NOT contain continuation phrase '前回の修正に対して'", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).not.toContain("前回の修正に対して");
  });

  it("full prompt uses fallback findingsPath when no spec-review result exists", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).toContain(specReviewResultPath("my-change", 1));
  });

  it("full prompt contains <user-request> tags", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });
});

// ---------------------------------------------------------------------------
// TC-BM-02: spec-fixer continuation → short prompt
// ---------------------------------------------------------------------------

describe("TC-BM-02: SpecFixerStep.buildMessage returns short prompt when previous session exists", () => {
  function makeStateWithPreviousSpecFixerRun(sessionId: string): JobState {
    const findingsPath = specReviewResultPath("my-change", 1);
    return makeMinimalState({
      steps: {
        "spec-fixer": [
          {
            attempt: 1,
            sessionId,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
  }

  it("returns exact output of buildContinuationMessage", () => {
    const state = makeStateWithPreviousSpecFixerRun("sess-spec-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    const findingsPath = specReviewResultPath("my-change", 1);
    const expected = buildContinuationMessage({
      stepName: "spec-fixer",
      findingsPath,
      slug: "my-change",
    });

    expect(message).toBe(expected);
  });

  it("continuation prompt contains 'reviewer' as source label (not 'verification')", () => {
    const state = makeStateWithPreviousSpecFixerRun("sess-spec-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).toContain("reviewer");
    expect(message).not.toContain("verification");
  });

  it("continuation prompt does NOT contain 'You are the spec-fixer'", () => {
    const state = makeStateWithPreviousSpecFixerRun("sess-spec-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).not.toContain("You are the spec-fixer");
  });

  it("continuation prompt contains the spec-review findingsPath", () => {
    const state = makeStateWithPreviousSpecFixerRun("sess-spec-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);
    const findingsPath = specReviewResultPath("my-change", 1);

    expect(message).toContain(findingsPath);
  });

  it("continuation prompt contains '前回の修正に対して'", () => {
    const state = makeStateWithPreviousSpecFixerRun("sess-spec-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = SpecFixerStep.buildMessage(state, deps);

    expect(message).toContain("前回の修正に対して");
  });
});
