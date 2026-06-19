/**
 * Tests for composeReviewerDescriptor: ensures custom reviewer composition
 * preserves the post-fixer reverification transitions.
 *
 * TC-007: custom reviewer 構成で再検証行が保持される
 */
import { describe, it, expect } from "vitest";
import { composeReviewerDescriptor } from "../../../../src/core/pipeline/compose-reviewers.js";
import { STANDARD_DESCRIPTOR } from "../../../../src/core/pipeline/registry.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../../../../src/core/pipeline/types.js";
import type { ReviewerSnapshot } from "../../../../src/core/reviewers/types.js";

function makeReviewerSnapshot(name: string): ReviewerSnapshot {
  return {
    name,
    model: "claude-sonnet-4-5",
    maxIterations: 2,
    purpose: `Purpose for ${name}`,
    criteria: `Criteria for ${name}`,
    judgment: `Judgment for ${name}`,
    freeText: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: custom reviewer 構成で再検証行が保持される
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-007: composeReviewerDescriptor preserves reverification transitions", () => {
  it("conformance --approved→ verification (when) row is retained in composed descriptor", () => {
    const snapshots: ReviewerSnapshot[] = [makeReviewerSnapshot("security")];
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);

    const row = composed.transitions.find(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "verification",
    );
    expect(row).toBeDefined();
    expect(typeof row!.when).toBe("function");
  });

  it("verification --passed→ adr-gen (when) row is retained in composed descriptor", () => {
    const snapshots: ReviewerSnapshot[] = [makeReviewerSnapshot("security")];
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);

    const row = composed.transitions.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "adr-gen",
    );
    expect(row).toBeDefined();
    expect(typeof row!.when).toBe("function");
  });

  it("fallback row conformance --approved→ adr-gen (no when) is retained", () => {
    const snapshots: ReviewerSnapshot[] = [makeReviewerSnapshot("security")];
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);

    const row = composed.transitions.find(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "adr-gen" && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("fallback row verification --passed→ code-review (no when) is retained", () => {
    const snapshots: ReviewerSnapshot[] = [makeReviewerSnapshot("security")];
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);

    const row = composed.transitions.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "code-review" && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("reverification rows are not present when snapshots is empty (base returned unchanged)", () => {
    // When snapshots is empty, composeReviewerDescriptor returns base reference unchanged
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, []);
    expect(composed).toBe(STANDARD_DESCRIPTOR); // same reference

    // The base descriptor has the reverification rows
    const row = composed.transitions.find(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "verification",
    );
    expect(row).toBeDefined();
  });

  it("custom reviewer transitions (code-review, code-fixer) are regenerated but verification rows preserved", () => {
    const snapshots: ReviewerSnapshot[] = [
      makeReviewerSnapshot("security"),
      makeReviewerSnapshot("perf"),
    ];
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);

    // Coordinator (not individual member steps) appears in the transition table.
    // In the parallel architecture, member steps have no outgoing transition rows —
    // they are driven internally via coordinator fan-out.
    const coordinatorRow = composed.transitions.find((t) => t.step === CUSTOM_REVIEWERS_STEP_NAME);
    expect(coordinatorRow).toBeDefined();
    const secRow = composed.transitions.find((t) => t.step === "security");
    expect(secRow).toBeUndefined();

    // Reverification rows are still there
    expect(
      composed.transitions.find((t) => t.step === "conformance" && t.on === "approved" && t.to === "verification"),
    ).toBeDefined();
    expect(
      composed.transitions.find((t) => t.step === "verification" && t.on === "passed" && t.to === "adr-gen"),
    ).toBeDefined();
  });
});
