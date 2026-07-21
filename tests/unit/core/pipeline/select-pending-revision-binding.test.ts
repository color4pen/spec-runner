/**
 * Unit tests for selectPendingMembers revision-binding extension (T-04)
 * and applyRoundResults approvedAtCommit setting (existing behavior).
 *
 * TC-007: 基準 commitOid 不一致の approved member は pending に戻る（must）
 * TC-008: 基準 commitOid 一致の approved member は skip される（must）
 * TC-009: approvedAtCommit 欠落の approved member は pending に戻る（must）
 * TC-010: approve で approvedAtCommit が実値を持つ（must）
 * TC-015: baselineCommit が null のときは status のみで skip 判定する（should）
 *
 * ⚠ RED TESTS: TC-007 and TC-009 are written in RED state.
 * `selectPendingMembers` currently takes 2 args (statuses, members).
 * The 3rd `baselineCommit` arg does not exist yet (T-04 not implemented).
 * TC-007: mismatched sha → expects pending ["security"] but gets [] → FAIL → RED
 * TC-009: null approvedAtCommit → expects pending ["security"] but gets [] → FAIL → RED
 *
 * TC-008 is GREEN: matching sha → expects [] (skip) → current 2-arg already returns [] (approved excluded)
 * TC-010 is GREEN: applyRoundResults already sets approvedAtCommit = headSha (existing behavior)
 * TC-015 is GREEN: null baseline → status-only → current 2-arg already excludes approved
 *
 * Source: specrunner/changes/approval-revision-binding/test-cases.md
 */
import { describe, it, expect } from "vitest";
import {
  selectPendingMembers,
  applyRoundResults,
} from "../../../../src/core/pipeline/reviewer-status.js";
import type { ReviewerStatus } from "../../../../src/core/pipeline/reviewer-status.js";

// ---------------------------------------------------------------------------
// TC-007: 基準 commitOid 不一致の approved member は pending に戻る（must）
//
// After T-04: selectPendingMembers(statuses, members, baselineCommit) where
// baselineCommit ≠ approvedAtCommit → member is pending.
//
// Before T-04 (current 2-arg): approved members are always excluded → returns []
// Expected: ["security"] → FAIL → RED
// ---------------------------------------------------------------------------
describe("TC-007: mismatched baselineCommit → approved member returns to pending (must)", () => {
  it("approved member with approvedAtCommit ≠ baselineCommit is returned as pending", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha-c1" },
    ];
    // 3-arg call: baselineCommit = "sha-c2" (mismatch with approvedAtCommit "sha-c1")
    // Before T-04: 2-arg selectPendingMembers ignores 3rd arg and excludes all approved → []
    // After T-04: mismatch → member reverts to pending → ["security"]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], "sha-c2");
    expect(pending).toEqual(["security"]);
  });

  it("multiple members: only the one with mismatched sha is pending", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha-c1" },
      { name: "perf", status: "approved", approvedAtCommit: "sha-c2" },
    ];
    // security: approved at sha-c1, baseline sha-c2 → mismatch → pending
    // perf: approved at sha-c2, baseline sha-c2 → match → skip
    // Before T-04: both excluded → []
    // After T-04: security is pending, perf is skipped → ["security"]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security", "perf"], "sha-c2");
    expect(pending).toEqual(["security"]);
  });

  it("pending member is always included regardless of baselineCommit", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "pending" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], "sha-c2");
    expect(pending).toEqual(["security"]);
  });
});

// ---------------------------------------------------------------------------
// TC-008: 基準 commitOid 一致の approved member は skip される（must）
//
// After T-04: selectPendingMembers with approvedAtCommit === baselineCommit → skip.
// This is GREEN already (2-arg behavior excludes all approved → same result).
// ---------------------------------------------------------------------------
describe("TC-008: matching baselineCommit → approved member is skipped (must)", () => {
  it("approved member with approvedAtCommit === baselineCommit is excluded (skip)", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha-c1" },
    ];
    // 3-arg call: baselineCommit = "sha-c1" (matches approvedAtCommit)
    // Both before and after T-04: member is excluded → []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], "sha-c1");
    expect(pending).toEqual([]);
  });

  it("all members matching baselineCommit → all skipped → empty pending", () => {
    const SHA = "sha-matching";
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: SHA },
      { name: "perf", status: "approved", approvedAtCommit: SHA },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security", "perf"], SHA);
    expect(pending).toEqual([]);
  });

  it("skipped member is always excluded regardless of baselineCommit", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "skipped" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], "sha-c1");
    expect(pending).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-009: approvedAtCommit 欠落の approved member は pending に戻る（must）
//
// After T-04: approved member with approvedAtCommit == null → pending (fail-closed per D6).
// Before T-04 (current 2-arg): approved is always excluded → returns []
// Expected: ["security"] → FAIL → RED
// ---------------------------------------------------------------------------
describe("TC-009: null approvedAtCommit → approved member returns to pending (fail-closed) (must)", () => {
  it("approved member with null approvedAtCommit is pending (fail-closed)", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: null },
    ];
    // null approvedAtCommit → cannot verify revision → fail-closed → pending
    // Before T-04: approved always excluded → []
    // After T-04: null approvedAtCommit → pending → ["security"]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], "sha-c1");
    expect(pending).toEqual(["security"]);
  });

  it("approved member with undefined approvedAtCommit (not set) is pending (fail-closed)", () => {
    // approvedAtCommit not present on the record (missing field)
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved" } as ReviewerStatus,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], "sha-c1");
    expect(pending).toEqual(["security"]);
  });

  it("multiple members: only null-approvedAtCommit member is pending", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: null },
      { name: "perf", status: "approved", approvedAtCommit: "sha-c1" },
    ];
    // security: null approvedAtCommit → pending
    // perf: sha-c1 = sha-c1 → skip
    // Before T-04: both excluded → []
    // After T-04: ["security"]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security", "perf"], "sha-c1");
    expect(pending).toEqual(["security"]);
  });
});

// ---------------------------------------------------------------------------
// TC-010: approve で approvedAtCommit が実値を持つ（must）
//
// applyRoundResults sets approvedAtCommit = headSha when verdict is "approved".
// This is ALREADY implemented and GREEN.
// Source: spec.md > Requirement: approved custom review 時に approvedAtCommit へ実値を設定する
// ---------------------------------------------------------------------------
describe("TC-010: applyRoundResults sets approvedAtCommit to headSha on approve (must)", () => {
  it("approved verdict sets approvedAtCommit = headSha (real value)", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "pending" }];
    const results = new Map([["security", "approved"]]);
    const updated = applyRoundResults(statuses, results, "sha-abc");
    expect(updated[0]).toMatchObject({
      name: "security",
      status: "approved",
      approvedAtCommit: "sha-abc",
    });
  });

  it("approvedAtCommit is the exact headSha passed to applyRoundResults", () => {
    const statuses: ReviewerStatus[] = [{ name: "perf", status: "pending" }];
    const results = new Map([["perf", "approved"]]);
    const updated = applyRoundResults(statuses, results, "sha-fan-out-head");
    expect(updated[0]?.approvedAtCommit).toBe("sha-fan-out-head");
  });

  it("needs-fix verdict clears approvedAtCommit (null)", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha-prev" },
    ];
    const results = new Map([["security", "needs-fix"]]);
    const updated = applyRoundResults(statuses, results, "sha-new");
    expect(updated[0]?.approvedAtCommit).toBeNull();
    expect(updated[0]?.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// TC-015: baselineCommit が null のときは status のみで skip 判定する（should）
//
// When baselineCommit is null (managed runtime cannot determine HEAD),
// revision check is disabled and existing status-based behavior is preserved.
// This is GREEN: null baseline → current 2-arg behavior (approved → skip).
// ---------------------------------------------------------------------------
describe("TC-015: null baselineCommit → status-only skip (managed fail-safe) (should)", () => {
  it("null baselineCommit → approved member is excluded (status-only — managed fail-safe)", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "sha-abc" },
    ];
    // baselineCommit = null → disable revision check → fall back to status-only
    // approved status → skip (same as current 2-arg behavior)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], null);
    expect(pending).toEqual([]);
  });

  it("null baselineCommit with null approvedAtCommit → managed fail-safe preserves existing skip", () => {
    // In managed runtime (null baselineCommit), we cannot check revision,
    // so we fall back to status-based behavior (approved → skip).
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: null },
    ];
    // null baselineCommit → no revision check → approved status → skip
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], null);
    expect(pending).toEqual([]);
  });

  it("null baselineCommit does not affect pending members", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "pending" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (selectPendingMembers as any)(statuses, ["security"], null);
    expect(pending).toEqual(["security"]);
  });
});
