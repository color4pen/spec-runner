/**
 * T-07: Consumer soft-input / producer-guarantee behaviour tests.
 *
 * Covers:
 * 1. code-review test-cases.md read is soft (required: false) — no STEP_INPUT_MISSING on absence
 * 2. custom-reviewer test-cases.md read is soft
 * 3. code-review user message contains conditional language for test-cases.md
 * 4. test-case-gen writes() declares test-cases.md with verify enabled (producer guarantee)
 * 5. test-case-gen comments no longer refer to "downstream code-review" for detection
 */
import { describe, it, expect } from "vitest";
import { CodeReviewStep, buildCodeReviewInitialMessage } from "../../../src/core/step/code-review.js";
import { createCustomReviewerStep } from "../../../src/core/step/custom-reviewer.js";
import { TestCaseGenStep } from "../../../src/core/step/test-case-gen.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { changeFolderPath } from "../../../src/util/paths.js";
import type { ReviewerSnapshot } from "../../../src/core/reviewers/types.js";

const SLUG = "test-slug";

function makeState(stepCounts: Record<string, number> = {}): JobState {
  const steps: JobState["steps"] = {};
  for (const [name, count] of Object.entries(stepCounts)) {
    steps[name] = Array.from({ length: count }, (_, i) => ({
      attempt: i + 1,
      sessionId: null,
      outcome: { verdict: null, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    }));
  }
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "change/test-slug",
    history: [],
    error: null,
    steps,
  };
}

function makeDeps(overrides: Partial<StepDeps> = {}): StepDeps {
  return {
    config: { version: 1, agents: {} },
    request: {
      type: "spec-change",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "Test request content.",
      adr: false,
    },
    slug: SLUG,
    ...overrides,
  };
}

function makeReviewerSnapshot(name = "security"): ReviewerSnapshot {
  return {
    name,
    maxIterations: 3,
    purpose: "Security review",
    criteria: "Check for security issues",
    judgment: "Approve if no critical issues",
    freeText: "",
  };
}

// ---------------------------------------------------------------------------
// T-07-1: code-review test-cases.md read is soft
// ---------------------------------------------------------------------------

describe("T-07-1: CodeReviewStep — test-cases.md is a soft (optional) read", () => {
  const folder = changeFolderPath(SLUG);

  it("test-cases.md read has required: false", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const ref = refs.find(r => r.path === `${folder}/test-cases.md`);
    expect(ref).toBeDefined();
    expect(ref?.required).toBe(false);
  });

  it("design.md and tasks.md reads are still required (not soft)", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const designRef = refs.find(r => r.path === `${folder}/design.md`);
    const tasksRef = refs.find(r => r.path === `${folder}/tasks.md`);
    expect(designRef?.required).not.toBe(false);
    expect(tasksRef?.required).not.toBe(false);
  });

  it("gitState read is unchanged", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const gitRef = refs.find(r => r.artifact === "gitState");
    expect(gitRef).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T-07-2: custom-reviewer test-cases.md read is soft
// ---------------------------------------------------------------------------

describe("T-07-2: createCustomReviewerStep — test-cases.md is a soft (optional) read", () => {
  const snapshot = makeReviewerSnapshot("security");
  const step = createCustomReviewerStep(snapshot);
  const folder = changeFolderPath(SLUG);

  it("test-cases.md read has required: false", () => {
    const refs = step.reads!(makeState(), makeDeps());
    const ref = refs.find(r => r.path === `${folder}/test-cases.md`);
    expect(ref).toBeDefined();
    expect(ref?.required).toBe(false);
  });

  it("design.md and tasks.md reads are still required", () => {
    const refs = step.reads!(makeState(), makeDeps());
    const designRef = refs.find(r => r.path === `${folder}/design.md`);
    const tasksRef = refs.find(r => r.path === `${folder}/tasks.md`);
    expect(designRef?.required).not.toBe(false);
    expect(tasksRef?.required).not.toBe(false);
  });

  it("gitState read is unchanged", () => {
    const refs = step.reads!(makeState(), makeDeps());
    const gitRef = refs.find(r => r.artifact === "gitState");
    expect(gitRef).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T-07-3: code-review user message is conditional on test-cases.md
// ---------------------------------------------------------------------------

describe("T-07-3: buildCodeReviewInitialMessage — conditional test-cases.md reference", () => {
  const baseOpts = {
    slug: SLUG,
    branch: "change/test-slug",
    iteration: 1,
    findingsPath: `specrunner/changes/${SLUG}/review-feedback-001.md`,
    requestContent: "Test request.",
  };

  it("user message contains conditional test-cases.md language", () => {
    const msg = buildCodeReviewInitialMessage(baseOpts);
    // Should say "If ... test-cases.md exists" rather than "Check test coverage against"
    expect(msg).toMatch(/test-cases\.md.*exists/i);
  });

  it("user message does not say to always check test-cases.md as mandatory step", () => {
    const msg = buildCodeReviewInitialMessage(baseOpts);
    // Must NOT contain the old unconditional phrasing
    expect(msg).not.toContain("Check test coverage against");
  });

  it("user message references the fallback (review code and tests as written)", () => {
    const msg = buildCodeReviewInitialMessage(baseOpts);
    expect(msg).toMatch(/otherwise|otherwise.*review|review.*code.*tests.*written/i);
  });
});

// ---------------------------------------------------------------------------
// T-07-4: test-case-gen writes() declares test-cases.md with verify enabled
// ---------------------------------------------------------------------------

describe("T-07-4: TestCaseGenStep — test-cases.md write has verify enabled (producer guarantee)", () => {
  it("writes() includes test-cases.md", () => {
    const refs = TestCaseGenStep.writes!(makeState(), makeDeps());
    const folder = changeFolderPath(SLUG);
    const ref = refs.find(r => r.path === `${folder}/test-cases.md`);
    expect(ref).toBeDefined();
  });

  it("test-cases.md write does NOT have verify: false (output gate is active)", () => {
    const refs = TestCaseGenStep.writes!(makeState(), makeDeps());
    const folder = changeFolderPath(SLUG);
    const ref = refs.find(r => r.path === `${folder}/test-cases.md`);
    // verify: false would disable the output gate; absence means verify=true (default)
    expect(ref?.verify).not.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-07-5: soft reads prevent STEP_INPUT_MISSING (conceptual validation)
// ---------------------------------------------------------------------------

describe("T-07-5: soft reads are excluded from required validation", () => {
  it("code-review has no required read for test-cases.md", () => {
    const refs = CodeReviewStep.reads!(makeState(), makeDeps());
    const folder = changeFolderPath(SLUG);
    // Required reads are those without required: false AND not gitState
    const requiredFilePaths = refs
      .filter(r => r.required !== false && r.artifact !== "gitState")
      .map(r => r.path);
    expect(requiredFilePaths).not.toContain(`${folder}/test-cases.md`);
  });

  it("custom-reviewer has no required read for test-cases.md", () => {
    const step = createCustomReviewerStep(makeReviewerSnapshot("security"));
    const refs = step.reads!(makeState(), makeDeps());
    const folder = changeFolderPath(SLUG);
    const requiredFilePaths = refs
      .filter(r => r.required !== false && r.artifact !== "gitState")
      .map(r => r.path);
    expect(requiredFilePaths).not.toContain(`${folder}/test-cases.md`);
  });
});
