/**
 * Unit tests for egressResolutionOptions helper and egressUnknownCommitError update.
 *
 * TC-007: in-pipeline egress halt message lists the three resolution options
 * TC-015: egressResolutionOptions output contains all three resolution options
 *
 * Source:
 *   TC-007 — spec.md > Requirement: egressUnknownCommitError names the three resolution options
 *             > Scenario: in-pipeline egress halt message lists the three options
 *   TC-015 — tasks.md T-01
 *
 * These tests import only from src/errors.ts (which exists). They fail (RED) because:
 *   - egressResolutionOptions is not yet exported from errors.ts
 *   - egressUnknownCommitError.hint does not yet embed the three resolution options
 */

import { describe, it, expect } from "vitest";
import { egressUnknownCommitError } from "../../../errors.js";

// egressResolutionOptions does not exist yet — this import resolves to undefined (RED state).
// After T-01 implementation the named export will exist and all TC-015 assertions will pass.
// @ts-expect-error — egressResolutionOptions not yet exported; import will be undefined in red state
import { egressResolutionOptions } from "../../../errors.js";

// ---------------------------------------------------------------------------
// TC-015: egressResolutionOptions output contains all three resolution options
// ---------------------------------------------------------------------------

describe("TC-015: egressResolutionOptions output contains all three resolution options", () => {
  it("TC-015: contains --adopt-commits as option 1 (adopt via resume flag)", () => {
    // GIVEN: egressResolutionOptions is called with a slug label string
    // WHEN: the returned string is inspected
    // THEN: it contains "--adopt-commits"
    const output = (egressResolutionOptions as (s?: string) => string)("my-slug");
    expect(output).toContain("--adopt-commits");
  });

  it("TC-015: contains a reference to pushing the commit(s) to origin", () => {
    const output = (egressResolutionOptions as (s?: string) => string)("my-slug");
    // THEN: it references pushing to origin (keyword "push" or "origin")
    const lc = output.toLowerCase();
    expect(lc.includes("push") || lc.includes("origin")).toBe(true);
  });

  it("TC-015: contains a reference to removing or reverting the commit(s)", () => {
    const output = (egressResolutionOptions as (s?: string) => string)("my-slug");
    // THEN: it references removing/reverting (git reset or git revert)
    const lc = output.toLowerCase();
    expect(lc.includes("reset") || lc.includes("revert") || lc.includes("remove")).toBe(true);
  });

  it("TC-015: egressResolutionOptions substitutes the provided slug into option 1", () => {
    const slug = "operator-commit-adoption";
    const output = (egressResolutionOptions as (s?: string) => string)(slug);
    // The slug must appear in the output so the operator sees the exact command to run
    expect(output).toContain(slug);
  });

  it("TC-015: egressResolutionOptions works with no argument (default slug placeholder)", () => {
    // Default slug label is "<slug>"
    const output = (egressResolutionOptions as (s?: string) => string)();
    expect(output).toContain("--adopt-commits");
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-015 (continued): egressUnknownCommitError hint embeds all three options via shared helper
// ---------------------------------------------------------------------------

describe("TC-015: egressUnknownCommitError.hint embeds all three options via shared helper", () => {
  it("TC-015: egressUnknownCommitError hint contains --adopt-commits", () => {
    const err = egressUnknownCommitError("abc1234", "fix/test-branch");
    // THEN: the operator-facing hint includes --adopt-commits
    expect(err.hint).toContain("--adopt-commits");
  });

  it("TC-015: egressUnknownCommitError hint references pushing to origin", () => {
    const err = egressUnknownCommitError("abc1234", "fix/test-branch");
    const hintLc = err.hint.toLowerCase();
    expect(hintLc.includes("push") || hintLc.includes("origin")).toBe(true);
  });

  it("TC-015: egressUnknownCommitError hint references removing/reverting the commit", () => {
    const err = egressUnknownCommitError("abc1234", "fix/test-branch");
    const hintLc = err.hint.toLowerCase();
    expect(hintLc.includes("reset") || hintLc.includes("revert") || hintLc.includes("remove")).toBe(true);
  });

  it("TC-015: egressUnknownCommitError keeps code === EGRESS_UNKNOWN_COMMIT (unchanged)", () => {
    const err = egressUnknownCommitError("abc1234", "fix/test-branch");
    expect(err.code).toBe("EGRESS_UNKNOWN_COMMIT");
  });

  it("TC-015: egressUnknownCommitError keeps existing detail message unchanged", () => {
    const oid = "abc1234";
    const branch = "fix/test-branch";
    const err = egressUnknownCommitError(oid, branch);
    // The detail message (err.message / err.detail) must still reference the OID and branch
    const fullText = [err.message, (err as unknown as { detail?: string }).detail ?? ""].join(" ");
    expect(fullText).toContain(oid);
    expect(fullText).toContain(branch);
  });
});

// ---------------------------------------------------------------------------
// TC-007: in-pipeline egress halt message lists the three options
// Source: spec.md > Requirement: egressUnknownCommitError names the three resolution options
//         > Scenario: in-pipeline egress halt message lists the three options
// ---------------------------------------------------------------------------

describe("TC-007: in-pipeline egress halt message lists the three options", () => {
  it("TC-007: egressUnknownCommitError operator-facing text references --adopt-commits", () => {
    // GIVEN: the in-pipeline egress backstop detects an unknown OID in the publish range
    // WHEN: egressUnknownCommitError(oid, branch) is constructed
    // THEN: the resulting error's operator-facing text references --adopt-commits
    const err = egressUnknownCommitError("deadbeef", "fix/some-feature");
    expect(err.hint).toContain("--adopt-commits");
  });

  it("TC-007: egressUnknownCommitError operator-facing text references pushing the commit to origin", () => {
    const err = egressUnknownCommitError("deadbeef", "fix/some-feature");
    const hintLc = err.hint.toLowerCase();
    expect(hintLc.includes("push") || hintLc.includes("origin")).toBe(true);
  });

  it("TC-007: egressUnknownCommitError operator-facing text references removing/reverting the commit", () => {
    const err = egressUnknownCommitError("deadbeef", "fix/some-feature");
    const hintLc = err.hint.toLowerCase();
    expect(hintLc.includes("reset") || hintLc.includes("revert") || hintLc.includes("remove")).toBe(true);
  });

  it("TC-007: egressUnknownCommitError.code is still EGRESS_UNKNOWN_COMMIT (not renamed)", () => {
    const err = egressUnknownCommitError("deadbeef", "fix/some-feature");
    expect(err.code).toBe("EGRESS_UNKNOWN_COMMIT");
  });

  it("TC-007: the three options are present simultaneously in a single egressUnknownCommitError call", () => {
    // All three must be present in one error — not spread across different conditions
    const err = egressUnknownCommitError("cafebabe", "change/operator-commit-adoption");
    const hintLc = err.hint.toLowerCase();
    const hasAdoptCommits = err.hint.includes("--adopt-commits");
    const hasPushRef = hintLc.includes("push") || hintLc.includes("origin");
    const hasRemoveRef = hintLc.includes("reset") || hintLc.includes("revert") || hintLc.includes("remove");
    expect(hasAdoptCommits).toBe(true);
    expect(hasPushRef).toBe(true);
    expect(hasRemoveRef).toBe(true);
  });
});
