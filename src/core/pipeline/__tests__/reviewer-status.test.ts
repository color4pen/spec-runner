/**
 * Unit tests for reviewer-status.ts pure functions (T-11).
 *
 * Covers acceptance criteria for T-01 / T-02:
 * - deriveReviewerStatuses: initialization and idempotency
 * - selectPendingMembers: approved/skipped exclusion (resume skip, D8)
 * - aggregateVerdict: escalation > needs-fix > approved priority (D5)
 * - applyRoundResults: status transitions per verdict
 * - computeInvalidations: activation-path invalidation (D6)
 */
import { describe, it, expect } from "vitest";
import {
  deriveReviewerStatuses,
  selectPendingMembers,
  applyRoundResults,
  aggregateVerdict,
  computeInvalidations,
  verdictOfResult,
} from "../reviewer-status.js";
import type { ReviewerStatus } from "../reviewer-status.js";
import type { StepExecutionResult } from "../../step/commit-orchestrator.js";
import type { JobState, Verdict } from "../../../state/schema.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
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

function makeSnapshot(name: string, paths?: string[]): ReviewerSnapshot {
  return {
    name,
    maxIterations: 3,
    purpose: "p",
    criteria: "c",
    judgment: "j",
    freeText: "",
    paths,
  };
}

// ---------------------------------------------------------------------------
// deriveReviewerStatuses
// ---------------------------------------------------------------------------

describe("deriveReviewerStatuses", () => {
  it("initializes all members as pending when reviewerStatuses is absent", () => {
    const state = makeMinimalState();
    const members = [makeSnapshot("security"), makeSnapshot("perf")];
    const statuses = deriveReviewerStatuses(state, members);
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({ name: "security", status: "pending" });
    expect(statuses[1]).toMatchObject({ name: "perf", status: "pending" });
  });

  it("initializes all members as pending when reviewerStatuses is empty array", () => {
    const state = makeMinimalState({ reviewerStatuses: [] });
    const members = [makeSnapshot("security")];
    const statuses = deriveReviewerStatuses(state, members);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe("pending");
  });

  it("copies activationPaths from snapshot.paths when initializing", () => {
    const state = makeMinimalState();
    const members = [makeSnapshot("security", ["src/**"])];
    const statuses = deriveReviewerStatuses(state, members);
    expect(statuses[0]?.activationPaths).toEqual(["src/**"]);
  });

  it("sets approvedAtCommit: null and invalidatedByCommit: null on initialization", () => {
    const state = makeMinimalState();
    const members = [makeSnapshot("security")];
    const statuses = deriveReviewerStatuses(state, members);
    expect(statuses[0]?.approvedAtCommit).toBeNull();
    expect(statuses[0]?.invalidatedByCommit).toBeNull();
  });

  it("returns existing reviewerStatuses unchanged (reference-identical) when present and non-empty", () => {
    const existing: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1" },
    ];
    const state = makeMinimalState({ reviewerStatuses: existing });
    const members = [makeSnapshot("security"), makeSnapshot("perf")];
    const statuses = deriveReviewerStatuses(state, members);
    expect(statuses).toBe(existing);
  });
});

// ---------------------------------------------------------------------------
// selectPendingMembers
// ---------------------------------------------------------------------------

describe("selectPendingMembers", () => {
  it("returns all members when all are pending", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "pending" },
      { name: "perf", status: "pending" },
    ];
    expect(selectPendingMembers(statuses, ["security", "perf"])).toEqual(["security", "perf"]);
  });

  it("excludes approved members (resume skip D8)", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1" },
      { name: "perf", status: "pending" },
    ];
    // T-04 (approval-revision-binding): pass baselineCommit matching approvedAtCommit to exercise
    // the new revision-binding path (not the managed-runtime fallback).
    expect(selectPendingMembers(statuses, ["security", "perf"], "sha1")).toEqual(["perf"]);
  });

  it("excludes skipped members", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "skipped" },
      { name: "perf", status: "pending" },
    ];
    expect(selectPendingMembers(statuses, ["security", "perf"])).toEqual(["perf"]);
  });

  it("treats unknown members (not in statuses) as pending", () => {
    const statuses: ReviewerStatus[] = [];
    expect(selectPendingMembers(statuses, ["security"])).toEqual(["security"]);
  });

  it("preserves declaration order from members param", () => {
    const statuses: ReviewerStatus[] = [
      { name: "b", status: "pending" },
      { name: "a", status: "pending" },
    ];
    // members order is ["a", "b"] — result follows member order, not statuses order
    expect(selectPendingMembers(statuses, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns empty array when all members are approved or skipped", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1" },
      { name: "perf", status: "skipped" },
    ];
    // T-04 (approval-revision-binding): pass baselineCommit matching approved member's
    // approvedAtCommit to exercise the revision-binding path.
    expect(selectPendingMembers(statuses, ["security", "perf"], "sha1")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// aggregateVerdict
// ---------------------------------------------------------------------------

describe("aggregateVerdict", () => {
  it("returns approved when all verdicts are approved", () => {
    expect(aggregateVerdict(["approved", "approved"])).toBe("approved");
  });

  it("returns approved for single approved verdict", () => {
    expect(aggregateVerdict(["approved"])).toBe("approved");
  });

  it("returns approved when all verdicts are skipped (skipped treated as approved for gate, D5)", () => {
    expect(aggregateVerdict(["skipped", "skipped"])).toBe("approved");
  });

  it("returns approved for mixed approved and skipped", () => {
    expect(aggregateVerdict(["approved", "skipped"])).toBe("approved");
  });

  it("returns needs-fix when any verdict is needs-fix", () => {
    expect(aggregateVerdict(["approved", "needs-fix"])).toBe("needs-fix");
  });

  it("returns escalation when any verdict is escalation", () => {
    expect(aggregateVerdict(["approved", "escalation"])).toBe("escalation");
  });

  it("escalation takes priority over needs-fix (escalation > needs-fix > approved)", () => {
    expect(aggregateVerdict(["needs-fix", "escalation"])).toBe("escalation");
    expect(aggregateVerdict(["escalation", "needs-fix", "approved"])).toBe("escalation");
  });

  it("needs-fix takes priority over approved", () => {
    expect(aggregateVerdict(["approved", "needs-fix", "approved"])).toBe("needs-fix");
  });

  it("returns approved for empty verdict list", () => {
    expect(aggregateVerdict([])).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// applyRoundResults
// ---------------------------------------------------------------------------

describe("applyRoundResults", () => {
  it("sets status=approved and approvedAtCommit=headSha on approved verdict", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "pending" }];
    const results = new Map([["security", "approved"]]);
    const updated = applyRoundResults(statuses, results, "sha-abc");
    expect(updated[0]).toMatchObject({
      name: "security",
      status: "approved",
      approvedAtCommit: "sha-abc",
      invalidatedByCommit: null,
    });
  });

  it("sets status=pending and clears approvedAtCommit on needs-fix verdict", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1" },
    ];
    const results = new Map([["security", "needs-fix"]]);
    const updated = applyRoundResults(statuses, results, "sha-abc");
    expect(updated[0]).toMatchObject({
      name: "security",
      status: "pending",
      approvedAtCommit: null,
    });
  });

  it("sets status=skipped on skipped verdict", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "pending" }];
    const results = new Map([["security", "skipped"]]);
    const updated = applyRoundResults(statuses, results, "sha-abc");
    expect(updated[0]?.status).toBe("skipped");
  });

  it("leaves status unchanged for reviewers not in results", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1" },
      { name: "perf", status: "pending" },
    ];
    const results = new Map([["perf", "approved"]]);
    const updated = applyRoundResults(statuses, results, "sha-abc");
    expect(updated[0]?.status).toBe("approved"); // security unchanged
    expect(updated[1]?.status).toBe("approved"); // perf updated
  });

  it("sets status=pending for unknown verdict (escalation / error)", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "approved", approvedAtCommit: "sha1" }];
    const results = new Map([["security", "escalation"]]);
    const updated = applyRoundResults(statuses, results, "sha-abc");
    expect(updated[0]?.status).toBe("pending");
  });

  it("does not mutate the original statuses array", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "pending" }];
    const original = { ...statuses[0] };
    applyRoundResults(statuses, new Map([["security", "approved"]]), "sha");
    expect(statuses[0]).toEqual(original); // unchanged
  });
});

// ---------------------------------------------------------------------------
// computeInvalidations
// ---------------------------------------------------------------------------

describe("computeInvalidations", () => {
  it("leaves pending reviewers unchanged", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "pending" }];
    const updated = computeInvalidations(statuses, ["src/feature.ts"], "bug-fix", "sha-def");
    expect(updated[0]?.status).toBe("pending");
  });

  it("leaves skipped reviewers unchanged", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "skipped" }];
    const updated = computeInvalidations(statuses, ["src/feature.ts"], "bug-fix", "sha-def");
    expect(updated[0]?.status).toBe("skipped");
  });

  it("reverts approved reviewer to pending when fixer touches their activation paths", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1", activationPaths: ["src/**"] },
    ];
    const updated = computeInvalidations(statuses, ["src/feature.ts"], "bug-fix", "sha-def");
    expect(updated[0]?.status).toBe("pending");
    expect(updated[0]?.invalidatedByCommit).toBe("sha-def");
    expect(updated[0]?.approvedAtCommit).toBeNull();
  });

  it("preserves approved status when fixer does not touch activation paths", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1", activationPaths: ["docs/**"] },
    ];
    const updated = computeInvalidations(statuses, ["src/feature.ts"], "bug-fix", "sha-def");
    expect(updated[0]?.status).toBe("approved");
    expect(updated[0]?.approvedAtCommit).toBe("sha1"); // unchanged
  });

  it("reverts approved reviewer with no activationPaths (always-activate) to pending", () => {
    // paths undefined → evaluateActivation returns activated: true always
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1" },
    ];
    const updated = computeInvalidations(statuses, ["src/feature.ts"], "bug-fix", "sha-def");
    expect(updated[0]?.status).toBe("pending");
  });

  it("no path-based invalidation when touchedFiles is empty (managed runtime path-activation fail-safe)", () => {
    // With defined activationPaths and empty touchedFiles: no path matches → no invalidation
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1", activationPaths: ["src/**"] },
    ];
    const updated = computeInvalidations(statuses, [], "bug-fix", "sha-def");
    expect(updated[0]?.status).toBe("approved");
  });

  it("does not mutate the original statuses array", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha1", activationPaths: ["src/**"] },
    ];
    const original = { ...statuses[0] };
    computeInvalidations(statuses, ["src/feature.ts"], "bug-fix", "sha-def");
    expect(statuses[0]).toEqual(original); // unchanged
  });
});

// ---------------------------------------------------------------------------
// verdictOfResult — T-01 (round-owned-state-commit)
// ---------------------------------------------------------------------------

/**
 * TC-T01: verdictOfResult derives member verdict from StepExecutionResult.
 *
 * Pure function — no executor, store, or git dependency.
 * Equivalence with the old member verdict derivation:
 *   fulfilled: lastRun?.outcome.verdict ?? "escalation"
 *   rejected:  "escalation"
 */
describe("verdictOfResult (T-01)", () => {
  it("success with verdict 'approved' → 'approved'", () => {
    const result: StepExecutionResult = {
      kind: "success",
      completion: { verdict: "approved", persistToolResult: null },
      completedAt: "2026-01-01T00:01:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      session: null,
    };
    expect(verdictOfResult(result)).toBe("approved");
  });

  it("success with verdict 'needs-fix' → 'needs-fix'", () => {
    const result: StepExecutionResult = {
      kind: "success",
      completion: { verdict: "needs-fix", persistToolResult: null },
      completedAt: "2026-01-01T00:01:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      session: null,
    };
    expect(verdictOfResult(result)).toBe("needs-fix");
  });

  it("success with verdict null → 'escalation' (null-coalesce mirrors old lastRun?.outcome.verdict ?? 'escalation')", () => {
    // StepCompletion.verdict is typed as Verdict (non-null) but runtime edge cases (legacy state files,
    // adapter quirks) can produce null at runtime. verdictOfResult's ?? "escalation" guards against this.
    // Cast through unknown to bypass the type guard for this invariant test.
    const result: StepExecutionResult = {
      kind: "success",
      completion: { verdict: null as unknown as Verdict, persistToolResult: null },
      completedAt: "2026-01-01T00:01:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      session: null,
    };
    expect(verdictOfResult(result)).toBe("escalation");
  });

  it("skipped → 'skipped'", () => {
    const result: StepExecutionResult = { kind: "skipped", skipReason: "activation-not-matched" };
    expect(verdictOfResult(result)).toBe("skipped");
  });

  it("halt → 'escalation' (mirrors old rejected path verdict)", () => {
    const err = Object.assign(new Error("agent exploded"), { code: "AGENT_STEP_FAILED" });
    const result: StepExecutionResult = {
      kind: "halt",
      halt: {
        kind: "failed",
        error: { code: "AGENT_STEP_FAILED", message: "agent exploded", hint: "" },
        thrownErr: err,
      },
    };
    expect(verdictOfResult(result)).toBe("escalation");
  });
});
