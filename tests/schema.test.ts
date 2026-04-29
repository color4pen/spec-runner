import { describe, it, expect } from "vitest";
import { validateJobState } from "../src/state/schema.js";
import { pushStepResult, toLegacyStepResult } from "../src/state/helpers.js";
import type { JobState } from "../src/state/schema.js";

function makeMinimalV1State(): Record<string, unknown> {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
  };
}

// TC-022: JobState.steps フィールド欠落時の後方互換
describe("TC-022: validateJobState — backward compat with missing steps field", () => {
  it("does not throw and fills steps with {} when steps field is absent", () => {
    const raw = makeMinimalV1State();
    // Ensure 'steps' is not present
    delete (raw as Record<string, unknown>)["steps"];

    const state = validateJobState(raw);
    expect(state.steps).toEqual({});
  });
});

// TC-023: JobState.steps — 必須フィールド欠落時は STATE_FILE_INVALID
describe("TC-023: validateJobState — throws when required field version is missing", () => {
  it("throws when version field is absent", () => {
    const raw = makeMinimalV1State();
    delete (raw as Record<string, unknown>)["version"];

    expect(() => validateJobState(raw)).toThrow();
  });

  it("throws when jobId field is absent", () => {
    const raw = makeMinimalV1State();
    delete (raw as Record<string, unknown>)["jobId"];

    expect(() => validateJobState(raw)).toThrow();
  });
});

// TC-024: pushStepResult — step 情報を state.steps に正しく追記する
describe("TC-024: pushStepResult — appends step result into state.steps", () => {
  it("records all fields in state.steps['spec-review'] when called", () => {
    const state = validateJobState(makeMinimalV1State()) as JobState;
    const session = { id: "sess_001", agentId: "agent_001", environmentId: "env_001" };
    const now = "2026-04-29T00:00:00.000Z";

    const updated = pushStepResult(state, "spec-review", {
      session,
      verdict: "approved",
      findingsPath: "openspec/changes/test-slug/spec-review-result.md",
      completedAt: now,
      error: null,
    });

    // steps["spec-review"] is now an array of StepRun; check the last element
    const lastResult = updated.steps?.["spec-review"]?.[updated.steps["spec-review"]!.length - 1];
    expect(lastResult).toMatchObject({
      attempt: 1,
      sessionId: session.id,
      outcome: {
        verdict: "approved",
        findingsPath: "openspec/changes/test-slug/spec-review-result.md",
        error: null,
      },
      endedAt: now,
    });
  });

  it("does not mutate the original state", () => {
    const state = validateJobState(makeMinimalV1State()) as JobState;
    const original = JSON.stringify(state.steps);

    pushStepResult(state, "spec-review", {
      session: null,
      verdict: "approved",
      findingsPath: null,
      completedAt: "2026-04-29T00:00:00.000Z",
      error: null,
    });
    expect(JSON.stringify(state.steps)).toBe(original);
  });

  it("preserves existing steps when adding a new one", () => {
    let state = validateJobState(makeMinimalV1State()) as JobState;
    state = pushStepResult(state, "propose", {
      session: { id: "sess_propose", agentId: "a", environmentId: "e" },
      verdict: null,
      findingsPath: null,
      completedAt: "2026-04-29T00:00:00.000Z",
      error: null,
    });

    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "approved",
      findingsPath: null,
      completedAt: "2026-04-29T00:00:00.000Z",
      error: null,
    });

    expect(state.steps?.["propose"]).toBeDefined();
    const lastSpecReview = state.steps?.["spec-review"]?.[state.steps["spec-review"]!.length - 1];
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");
  });
});
