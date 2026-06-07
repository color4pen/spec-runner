/**
 * Unit tests for src/state/helpers.ts
 * TC-020: pushStepResult — iteration=1 auto-assigned on first push
 * TC-021: pushStepResult — iteration=2 auto-assigned on second push
 * TC-022: getLatestStepResult — returns last element of array
 * TC-023: getLatestStepResult — returns undefined for unregistered step
 * TC-047: verdict independence per iteration (should)
 */
import { describe, it, expect } from "vitest";
import { pushStepResult, getLatestStepResult, toLegacyStepResult } from "../../src/state/helpers.js";
import type { JobState } from "../../src/state/schema.js";
import { specReviewResultPath } from "../../src/util/paths.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// TC-020: pushStepResult — 1 件目の push で iteration=1 が自動採番される
describe("TC-020: pushStepResult — first push auto-assigns iteration=1", () => {
  it("creates steps['spec-review'] as array of length 1 with iteration=1", () => {
    const state = makeMinimalState();
    const session = { id: "sess_001", agentId: "agent_001", environmentId: "env_001" };
    const now = "2026-04-29T00:00:00.000Z";

    const updated = pushStepResult(state, "spec-review", {
      session,
      verdict: "approved",
      findingsPath: null,
      completedAt: now,
      error: null,
    });

    const arr = updated.steps?.["spec-review"];
    expect(arr).toBeDefined();
    expect(arr?.length).toBe(1);
    expect(arr?.[0] ? toLegacyStepResult(arr[0]).iteration : undefined).toBe(1);
    expect(arr?.[0] ? toLegacyStepResult(arr[0]).verdict : undefined).toBe("approved");
  });
});

// TC-021: pushStepResult — 2 件目の push で iteration=2 が自動採番される
describe("TC-021: pushStepResult — second push auto-assigns iteration=2", () => {
  it("creates steps['spec-review'] as array of length 2 with last iteration=2", () => {
    let state = makeMinimalState();
    const now = "2026-04-29T00:00:00.000Z";

    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "needs-fix",
      findingsPath: specReviewResultPath("test", 1),
      completedAt: now,
      error: null,
    });

    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "approved",
      findingsPath: specReviewResultPath("test", 2),
      completedAt: now,
      error: null,
    });

    const arr = state.steps?.["spec-review"];
    expect(arr).toBeDefined();
    expect(arr?.length).toBe(2);
    expect(arr?.[1] ? toLegacyStepResult(arr[1]).iteration : undefined).toBe(2);
    expect(arr?.[1] ? toLegacyStepResult(arr[1]).verdict : undefined).toBe("approved");
  });
});

// TC-022: getLatestStepResult — 配列の末尾要素を返す
describe("TC-022: getLatestStepResult — returns last element of array", () => {
  it("returns the last element with verdict=approved when array has 2 elements", () => {
    let state = makeMinimalState();
    const now = "2026-04-29T00:00:00.000Z";

    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "needs-fix",
      findingsPath: null,
      completedAt: now,
      error: null,
    });
    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "approved",
      findingsPath: null,
      completedAt: now,
      error: null,
    });

    const result = getLatestStepResult(state, "spec-review");
    expect(result).toBeDefined();
    expect(result?.verdict).toBe("approved");
    expect(result?.iteration).toBe(2);
  });
});

// TC-023: getLatestStepResult — 未登録 step に対して undefined を返す
describe("TC-023: getLatestStepResult — returns undefined for unregistered step", () => {
  it("returns undefined when step name does not exist in state.steps", () => {
    const state = makeMinimalState();

    const result = getLatestStepResult(state, "implementer");
    expect(result).toBeUndefined();
  });
});

// TC-047: verdict が iteration ごとに独立して保存される (should)
describe("TC-047: verdict independence per iteration", () => {
  it("does not overwrite previous iteration verdict when adding second entry", () => {
    let state = makeMinimalState();
    const now = "2026-04-29T00:00:00.000Z";

    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "needs-fix",
      findingsPath: null,
      completedAt: now,
      error: null,
    });
    state = pushStepResult(state, "spec-review", {
      session: null,
      verdict: "approved",
      findingsPath: null,
      completedAt: now,
      error: null,
    });

    const arr = state.steps?.["spec-review"];
    expect(arr?.[0] ? toLegacyStepResult(arr[0]).verdict : undefined).toBe("needs-fix");
    expect(arr?.[1] ? toLegacyStepResult(arr[1]).verdict : undefined).toBe("approved");
  });

  it("does not mutate original state when pushing new result", () => {
    const state = makeMinimalState();
    const originalJson = JSON.stringify(state.steps);

    pushStepResult(state, "spec-review", {
      session: null,
      verdict: "approved",
      findingsPath: null,
      completedAt: "2026-04-29T00:00:00.000Z",
      error: null,
    });

    expect(JSON.stringify(state.steps)).toBe(originalJson);
  });

  it("stores modelUsage in StepRun when provided", () => {
    const state = makeMinimalState();
    const modelUsage = {
      "claude-opus-4-6": {
        inputTokens: 200,
        outputTokens: 100,
        cacheReadInputTokens: 10,
        cacheCreationInputTokens: 5,
      },
    };

    const updated = pushStepResult(state, "implementer", {
      session: null,
      verdict: "success",
      findingsPath: null,
      completedAt: "2026-05-07T00:00:00.000Z",
      error: null,
      modelUsage,
    });

    const run = updated.steps?.["implementer"]?.[0];
    expect(run?.modelUsage).toEqual(modelUsage);
  });

  it("omits modelUsage from StepRun when not provided", () => {
    const state = makeMinimalState();

    const updated = pushStepResult(state, "implementer", {
      session: null,
      verdict: "success",
      findingsPath: null,
      completedAt: "2026-05-07T00:00:00.000Z",
      error: null,
    });

    const run = updated.steps?.["implementer"]?.[0];
    expect(run).not.toHaveProperty("modelUsage");
  });
});

// TC-startedAt-01: startedAt を渡した場合に StepRun.startedAt に反映される
describe("TC-startedAt-01: pushStepResult — startedAt is recorded when provided", () => {
  it("stores the provided startedAt in StepRun.startedAt", () => {
    const state = makeMinimalState();
    const startedAt = "2026-05-15T10:00:00.000Z";
    const completedAt = "2026-05-15T10:10:00.000Z";

    const updated = pushStepResult(state, "implementer", {
      session: null,
      verdict: "success",
      findingsPath: null,
      startedAt,
      completedAt,
      error: null,
    });

    const run = updated.steps?.["implementer"]?.[0];
    expect(run?.startedAt).toBe(startedAt);
    expect(run?.endedAt).toBe(completedAt);
  });
});

// TC-startedAt-02: startedAt を渡さなかった場合に endedAt と同じ現在時刻にフォールバック
describe("TC-startedAt-02: pushStepResult — startedAt falls back to now when not provided", () => {
  it("sets startedAt to a valid ISO timestamp when startedAt is not provided", () => {
    const state = makeMinimalState();

    const before = new Date().toISOString();
    const updated = pushStepResult(state, "implementer", {
      session: null,
      verdict: "success",
      findingsPath: null,
      error: null,
    });
    const after = new Date().toISOString();

    const run = updated.steps?.["implementer"]?.[0];
    expect(run?.startedAt).toBeDefined();
    const startedAt = run?.startedAt;
    expect(startedAt! >= before).toBe(true);
    expect(startedAt! <= after).toBe(true);
  });
});

// TC-startedAt-03: startedAt と completedAt が異なるタイムスタンプで記録される
describe("TC-startedAt-03: pushStepResult — startedAt and endedAt can differ", () => {
  it("records distinct startedAt and endedAt when both are provided", () => {
    const state = makeMinimalState();
    const startedAt = "2026-05-15T10:00:00.000Z";
    const completedAt = "2026-05-15T10:10:00.000Z";

    const updated = pushStepResult(state, "implementer", {
      session: null,
      verdict: "success",
      findingsPath: null,
      startedAt,
      completedAt,
      error: null,
    });

    const run = updated.steps?.["implementer"]?.[0];
    expect(run?.startedAt).toBe(startedAt);
    expect(run?.endedAt).toBe(completedAt);
    expect(run?.startedAt).not.toBe(run?.endedAt);
  });
});
