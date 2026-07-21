/**
 * Integration-layer tests for member → coordinator resume routing.
 *
 * Validates the combination of buildAllowedStepSet + resolveResumeStep +
 * deriveReviewerStatuses + selectPendingMembers for the scenario described
 * in issue #769 (job 8d5f9b5c: cross-boundary-invariants escalated → approved).
 *
 * Does NOT construct a full Pipeline instance; tests the pure logic layer only.
 */
import { describe, it, expect } from "vitest";
import { buildAllowedStepSet, resolveResumeStep } from "../../resume/resolve-step.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../types.js";
import { deriveReviewerStatuses, selectPendingMembers } from "../reviewer-status.js";
import type { ReviewerStatus } from "../reviewer-status.js";
import type { JobState } from "../../../state/schema.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Reviewer list matching the job 8d5f9b5c scenario. */
const REVIEWERS: ReviewerSnapshot[] = [
  {
    name: "cross-boundary-invariants",
    maxIterations: 3,
    purpose: "detect cross-boundary invariant violations",
    criteria: "no violations",
    judgment: "approved or needs-fix",
    freeText: "",
  },
];

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "8d5f9b5c-0000-0000-0000-000000000000",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "cross-boundary-invariants",
    status: "awaiting-resume",
    branch: null,
    history: [],
    error: null,
    steps: {},
    reviewers: REVIEWERS,
    ...overrides,
  } as unknown as JobState;
}

// ---------------------------------------------------------------------------
// T-09: buildAllowedStepSet includes coordinator
// ---------------------------------------------------------------------------

describe("member-resume-routing: buildAllowedStepSet with reviewers", () => {
  it("includes 'custom-reviewers' in allowed set when reviewers are present", () => {
    const allowed = buildAllowedStepSet(REVIEWERS);
    expect(allowed.has(CUSTOM_REVIEWERS_STEP_NAME)).toBe(true);
  });

  it("includes member name 'cross-boundary-invariants' in allowed set", () => {
    const allowed = buildAllowedStepSet(REVIEWERS);
    expect(allowed.has("cross-boundary-invariants")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-09: resolveResumeStep maps member resumePoint → coordinator (issue #769)
// ---------------------------------------------------------------------------

describe("member-resume-routing: resolveResumeStep maps member → coordinator", () => {
  const allowed = buildAllowedStepSet(REVIEWERS);

  it("job 8d5f9b5c fixture: resumePoint.step='cross-boundary-invariants' → 'custom-reviewers'", () => {
    const resumePoint = {
      step: "cross-boundary-invariants",
      reason: "Interrupted by signal",
      iterationsExhausted: 0,
    };
    const result = resolveResumeStep(undefined, resumePoint, undefined, allowed, REVIEWERS);
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });

  it("pipeline does not fall back to escalate: member → coordinator route is set", () => {
    // When resolveResumeStep returns 'custom-reviewers', the pipeline uses the
    // coordinator entry in the transition table → no unknown step → no escalate fallback
    const resumePoint = {
      step: "cross-boundary-invariants",
      reason: "Interrupted by signal",
      iterationsExhausted: 0,
    };
    const startStep = resolveResumeStep(undefined, resumePoint, undefined, allowed, REVIEWERS);
    // Verify it is the coordinator, not the member (which has no transition row)
    expect(startStep).not.toBe("cross-boundary-invariants");
    expect(startStep).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });

  it("explicit --from 'cross-boundary-invariants' maps to 'custom-reviewers'", () => {
    const result = resolveResumeStep("cross-boundary-invariants", null, undefined, allowed, REVIEWERS);
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });

  it("explicit --from with a member name takes priority over a resumePoint pointing elsewhere", () => {
    const resumePoint = { step: "code-review", reason: "test", iterationsExhausted: 0 };
    const result = resolveResumeStep("cross-boundary-invariants", resumePoint, undefined, allowed, REVIEWERS);
    expect(result).toBe(CUSTOM_REVIEWERS_STEP_NAME);
  });
});

// ---------------------------------------------------------------------------
// T-09: coordinator resume skip — approved member not re-executed
// ---------------------------------------------------------------------------

describe("member-resume-routing: approved member excluded from pending on coordinator resume", () => {
  it("returns empty pending list when cross-boundary-invariants is already approved", () => {
    // Scenario: member ran and got approved; process interrupted at some later point;
    // on coordinator resume, the approved member should NOT be re-run.
    const approvedStatuses: ReviewerStatus[] = [
      {
        name: "cross-boundary-invariants",
        status: "approved",
        approvedAtCommit: "abc123",
      },
    ];
    const state = makeMinimalState({ reviewerStatuses: approvedStatuses });
    const statuses = deriveReviewerStatuses(state, REVIEWERS);
    // T-04 (approval-revision-binding): pass baselineCommit matching approvedAtCommit to
    // exercise the revision-binding path (approved at same revision → skip).
    const pending = selectPendingMembers(statuses, ["cross-boundary-invariants"], "abc123");
    expect(pending).toEqual([]);
  });

  it("coordinator resumes with empty pending → synthetic approved (no member re-execution)", () => {
    // When selectPendingMembers returns [], the coordinator emits synthetic approved
    // without re-running any member. This is the existing runCoordinatorFanOut behavior.
    const approvedStatuses: ReviewerStatus[] = [
      {
        name: "cross-boundary-invariants",
        status: "approved",
        approvedAtCommit: "abc123",
      },
    ];
    const state = makeMinimalState({ reviewerStatuses: approvedStatuses });
    const statuses = deriveReviewerStatuses(state, REVIEWERS);
    // T-04 (approval-revision-binding): pass baselineCommit matching approvedAtCommit.
    const pending = selectPendingMembers(statuses, ["cross-boundary-invariants"], "abc123");
    // Empty pending → coordinator returns approved without any member execution
    expect(pending.length).toBe(0);
  });

  it("returns member as pending when it has not yet been approved", () => {
    // Fresh start: no reviewerStatuses → all members are pending
    const state = makeMinimalState({ reviewerStatuses: undefined });
    const statuses = deriveReviewerStatuses(state, REVIEWERS);
    const pending = selectPendingMembers(statuses, ["cross-boundary-invariants"]);
    expect(pending).toEqual(["cross-boundary-invariants"]);
  });

  it("returns only non-approved members as pending in multi-reviewer scenario", () => {
    const multiReviewers: ReviewerSnapshot[] = [
      ...REVIEWERS,
      {
        name: "security",
        maxIterations: 3,
        purpose: "security",
        criteria: "no vulns",
        judgment: "approved or needs-fix",
        freeText: "",
      },
    ];
    const mixedStatuses: ReviewerStatus[] = [
      {
        name: "cross-boundary-invariants",
        status: "approved",
        approvedAtCommit: "abc123",
      },
      {
        name: "security",
        status: "pending",
      },
    ];
    const state = makeMinimalState({ reviewerStatuses: mixedStatuses });
    const statuses = deriveReviewerStatuses(state, multiReviewers);
    // T-04 (approval-revision-binding): pass baselineCommit matching the approved member's
    // approvedAtCommit so revision-binding path skips the approved member correctly.
    const pending = selectPendingMembers(
      statuses,
      ["cross-boundary-invariants", "security"],
      "abc123",
    );
    expect(pending).toEqual(["security"]);
    expect(pending).not.toContain("cross-boundary-invariants");
  });
});
