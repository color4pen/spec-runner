/**
 * TC-011, TC-012 — Approval invalidation after reopen via revision binding (D5).
 *
 * These are pin tests that verify the existing commitOid-based revision binding
 * already excludes stale approvals on a new revision. Both functions under test
 * already implement this behavior; the tests pin it so that weakening the binding
 * (e.g. removing the commitOid check) would cause test failures.
 *
 * TC-011: selectPendingMembers with an approved member at oldSha and
 *         baselineCommit = newSha returns that member as pending (stale approval
 *         not reused on the new revision).
 *
 * TC-012: conformanceApprovedForVerifiedRevision returns false when the latest
 *         conformance commitOid differs from the latest verification commitOid
 *         (stale conformance approval does not short-circuit re-verification).
 *
 * Source: spec.md › Requirement: reopen re-binds approvals to the new revision
 *         tasks.md T-06, design.md D5
 */
import { describe, it, expect } from "vitest";
import { selectPendingMembers } from "../reviewer-status.js";
import {
  conformanceApprovedForVerifiedRevision,
  conformanceApprovedLatest,
} from "../reverification.js";
import type { ReviewerStatus } from "../reviewer-status.js";
import type { JobState } from "../../../state/schema.js";
import { STEP_NAMES } from "../../step/step-names.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as unknown as JobState;
}

function makeStepRun(verdict: string, commitOid?: string, ts = "2026-01-01T00:00:00.000Z") {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: ts,
    endedAt: ts,
    ...(commitOid !== undefined ? { commitOid } : {}),
  };
}

// ---------------------------------------------------------------------------
// TC-011: stale reviewer approval is not reused on a new revision
// ---------------------------------------------------------------------------

describe("TC-011: stale reviewer approval is not reused on a new revision (D5)", () => {
  it("TC-011-a: approved member at oldSha is pending when baselineCommit=newSha", () => {
    // GIVEN a reviewer approved at oldSha
    const oldSha = "sha-before-reopen";
    const newSha = "sha-after-reopen-fix";

    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: oldSha,
        activationPaths: ["src/**"],
        invalidatedByCommit: null,
      },
    ];

    // WHEN selectPendingMembers is called with baselineCommit = newSha
    const pending = selectPendingMembers(statuses, ["security"], newSha);

    // THEN the member is treated as pending (stale approval discarded)
    expect(pending).toContain("security");
  });

  it("TC-011-b: approved member at matchingSha is skipped when baselineCommit=matchingSha", () => {
    // Confirms the baseline: same-revision approval IS reused (correct, not a defect)
    const sha = "sha-same";
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: sha,
        activationPaths: ["src/**"],
        invalidatedByCommit: null,
      },
    ];

    const pending = selectPendingMembers(statuses, ["security"], sha);

    // Approval for the same revision is preserved (not stale)
    expect(pending).not.toContain("security");
  });

  it("TC-011-c: approved member with null approvedAtCommit is always pending (fail-closed)", () => {
    // null approvedAtCommit → fail-closed → treated as pending regardless of baseline
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: null,
      },
    ];

    const pending = selectPendingMembers(statuses, ["security"], "some-sha");
    expect(pending).toContain("security");
  });

  it("TC-011-d: null baselineCommit disables revision check (managed-runtime fail-safe)", () => {
    // When baselineCommit is null/undefined, revision check is disabled.
    // Approved members are excluded regardless of their approvedAtCommit.
    // This is the managed runtime fallback — not the local runtime behavior after reopen.
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "old-sha",
        invalidatedByCommit: null,
      },
    ];

    const pending = selectPendingMembers(statuses, ["security"], null);
    // With null baseline: approved is excluded (no revision check)
    expect(pending).not.toContain("security");
  });

  it("TC-011-e: weakening approvedAtCommit check to ignore commitOid would break this test", () => {
    // This assertion documents the invariant: if selectPendingMembers were changed to
    // always exclude approved members (ignoring commitOid), the TC-011-a assertion
    // above would NOT break. But if it were changed to always include approved members,
    // TC-011-b would break. The correct behavior is the mismatch→pending path.
    const oldSha = "sha-A";
    const newSha = "sha-B";
    const statuses: ReviewerStatus[] = [
      { name: "rev-a", status: "approved", approvedAtCommit: oldSha },
    ];

    // mismatch → pending (fail-closed)
    expect(selectPendingMembers(statuses, ["rev-a"], newSha)).toEqual(["rev-a"]);
    // match → skip (approved and still valid)
    expect(selectPendingMembers(statuses, ["rev-a"], oldSha)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-012: stale conformance approval does not short-circuit re-verification
// ---------------------------------------------------------------------------

describe("TC-012: stale conformance approval does not short-circuit re-verification (D5)", () => {
  it("TC-012-a: conformanceApprovedForVerifiedRevision returns false when commitOids differ", () => {
    // GIVEN conformance approved at oldSha and verification at newSha
    const oldSha = "sha-before-reopen";
    const newSha = "sha-after-reopen-fix";

    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeStepRun("approved", oldSha)],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", newSha)],
      },
    });

    // WHEN the re-verification guard is evaluated
    const result = conformanceApprovedForVerifiedRevision(state);

    // THEN it returns false — conformance is bound to the old revision,
    // and verification is on the new revision → re-verification proceeds
    expect(result).toBe(false);
  });

  it("TC-012-b: conformanceApprovedForVerifiedRevision returns true when commitOids match", () => {
    // When both conformance and verification refer to the same revision,
    // the guard is true (re-verification is not needed).
    const sha = "sha-same";

    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeStepRun("approved", sha)],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", sha)],
      },
    });

    expect(conformanceApprovedForVerifiedRevision(state)).toBe(true);
  });

  it("TC-012-c: conformanceApprovedForVerifiedRevision returns false when conformance commitOid absent", () => {
    // Fail-closed: missing conformance commitOid → cannot verify binding → false
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeStepRun("approved", undefined)],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", "sha-123")],
      },
    });

    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("TC-012-d: conformanceApprovedForVerifiedRevision returns false when verification commitOid absent", () => {
    // Fail-closed: missing verification commitOid → cannot verify binding → false
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeStepRun("approved", "sha-123")],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", undefined)],
      },
    });

    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("TC-012-e: conformanceApprovedForVerifiedRevision returns false when conformance verdict is not approved", () => {
    // Verification routing guard: only fires when conformance approved AND same revision.
    const sha = "sha-abc";
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeStepRun("needs-fix", sha)],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", sha)],
      },
    });

    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("TC-012-f: weakening the commitOid check to ignore commitOids would break TC-012-a", () => {
    // Pin: if conformanceApprovedForVerifiedRevision were changed to only check verdict
    // (not commitOid), TC-012-a would return true instead of false for mismatched OIDs.
    // The existing conformanceApprovedLatest (deprecated, checks only verdict) illustrates this:
    const oldSha = "sha-old";
    const newSha = "sha-new";
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeStepRun("approved", oldSha)],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", newSha)],
      },
    });

    // The deprecated verdict-only check returns true (incorrect — ignores stale binding)
    expect(conformanceApprovedLatest(state)).toBe(true);
    // The commitOid-aware check correctly returns false (correct — binding mismatch)
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("TC-012-g: returns false when conformance steps array is empty", () => {
    // No conformance run → cannot have been approved → guard is false
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", "sha-123")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("TC-012-h: uses the LATEST conformance run (last in array)", () => {
    // Only the most recent conformance result matters for routing.
    // If the latest conformance needs-fix but an earlier one was approved, guard is false.
    const sha = "sha-abc";
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          makeStepRun("approved", sha, "2026-01-01T00:00:00.000Z"),
          makeStepRun("needs-fix", sha, "2026-01-01T01:00:00.000Z"), // latest
        ],
        [STEP_NAMES.VERIFICATION]: [makeStepRun("passed", sha)],
      },
    });

    // Latest conformance is needs-fix → guard is false
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });
});
