/**
 * T-04 / T-05: Custom reviewer step tests.
 *
 * T-04: customReviewerResultPath dispatch, output templates for unknown step names.
 * T-05: createCustomReviewerStep — reportTool identity, resultFilePath, buildMessage.
 */
import { describe, it, expect } from "vitest";
import { createCustomReviewerStep } from "../custom-reviewer.js";
import { JUDGE_REPORT_TOOL } from "../report-tool.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";
import { getOutputTemplates } from "../../../templates/step-output-templates.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<ReviewerSnapshot> = {}): ReviewerSnapshot {
  return {
    name: "security",
    maxIterations: 3,
    purpose: "セキュリティ観点の検査",
    criteria: "認証・認可の確認",
    judgment: "CRITICAL/HIGH が 0 件なら approved",
    freeText: "",
    ...overrides,
  };
}

function makeState(steps: Record<string, unknown[]> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "my-change" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "security",
    status: "running",
    branch: "feat/my-change-abc12345",
    history: [],
    error: null,
    steps: steps as JobState["steps"],
  };
}

function makeDeps(slug = "my-change"): StepDeps {
  return {
    slug,
    request: { title: "T", type: "bug-fix", slug, content: "Original request content.", baseBranch: "main", adr: false },
    config: {} as StepDeps["config"],
  };
}

// ---------------------------------------------------------------------------
// T-04: unknown step name → output templates returns []
// ---------------------------------------------------------------------------

describe("T-04: getOutputTemplates for custom reviewer step name", () => {
  it("returns [] for a custom reviewer step name (not in switch)", () => {
    const state = makeState();
    expect(getOutputTemplates("security", "my-change", state)).toEqual([]);
  });

  it("returns [] for any arbitrary reviewer step name", () => {
    const state = makeState();
    expect(getOutputTemplates("perf-check", "my-change", state)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-05: createCustomReviewerStep — reportTool identity
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — reportTool", () => {
  it("reportTool is exactly JUDGE_REPORT_TOOL (=== identity)", () => {
    const step = createCustomReviewerStep(makeSnapshot());
    expect(step.reportTool).toBe(JUDGE_REPORT_TOOL);
  });
});

// ---------------------------------------------------------------------------
// T-05: resultFilePath uses reviewer name
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — resultFilePath", () => {
  it("resultFilePath includes reviewer name in path", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps();
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("security");
  });

  it("resultFilePath uses slug from deps", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps("my-slug");
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("my-slug");
  });

  it("resultFilePath starts at iteration 001 for fresh state", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "sec" }));
    const state = makeState();
    const deps = makeDeps();
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("-001.md");
  });

  it("resultFilePath increments on second run", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "sec" }));
    const state = makeState({ sec: [{ sessionId: null, outcome: { verdict: "needs-fix" }, startedAt: "", endedAt: "" }] });
    const deps = makeDeps();
    const path = step.resultFilePath!(state, deps);
    expect(path).toContain("-002.md");
  });
});

// ---------------------------------------------------------------------------
// T-05: buildMessage contains reviewer name
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — buildMessage", () => {
  it("buildMessage contains reviewer name", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps();
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("security");
  });

  it("buildMessage contains reviewer purpose", () => {
    const step = createCustomReviewerStep(makeSnapshot({ purpose: "unique-purpose-xyz" }));
    const state = makeState();
    const deps = makeDeps();
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("unique-purpose-xyz");
  });

  it("buildMessage contains result file path", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "security" }));
    const state = makeState();
    const deps = makeDeps();
    const msg = step.buildMessage(state, deps);
    // result path should be embedded in the message
    expect(msg).toContain("security-result-001.md");
  });

  it("buildMessage contains change folder path", () => {
    const step = createCustomReviewerStep(makeSnapshot());
    const state = makeState();
    const deps = makeDeps("my-slug");
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("specrunner/changes/my-slug");
  });
});

// ---------------------------------------------------------------------------
// T-05: step name
// ---------------------------------------------------------------------------

describe("T-05: createCustomReviewerStep — step name", () => {
  it("step.name equals snapshot.name", () => {
    const step = createCustomReviewerStep(makeSnapshot({ name: "perf" }));
    expect(step.name).toBe("perf");
  });

  it("step.kind is 'agent'", () => {
    const step = createCustomReviewerStep(makeSnapshot());
    expect(step.kind).toBe("agent");
  });
});
