/**
 * T-08: reviewer-chain.ts unit tests.
 *
 * Tests for:
 * - deriveImplReviewerChain (from state and from snapshots)
 * - resolveActiveReviewer (no runs, single reviewer, multiple reviewers)
 * - nextAfterReviewer (mid-chain, last-in-chain → conformance)
 */
import { describe, it, expect } from "vitest";
import {
  deriveImplReviewerChain,
  resolveActiveReviewer,
  nextAfterReviewer,
} from "../reviewer-chain.js";
import { STEP_NAMES } from "../../step/step-names.js";
import type { JobState } from "../../../state/schema.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(steps: Record<string, Array<{ startedAt: string; endedAt: string; outcome: { verdict: string } }>> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "s" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "code-review",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: steps as unknown as JobState["steps"],
  };
}

function makeSnapshot(name: string, maxIterations = 3): ReviewerSnapshot {
  return { name, maxIterations, purpose: "p", criteria: "c", judgment: "j", freeText: "" };
}

// ---------------------------------------------------------------------------
// deriveImplReviewerChain
// ---------------------------------------------------------------------------

describe("deriveImplReviewerChain", () => {
  it("returns ['code-review'] when state has no custom reviewers", () => {
    const chain = deriveImplReviewerChain(makeState());
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
  });

  it("returns ['code-review', ...custom] when state has reviewers", () => {
    const state: JobState = { ...makeState(), reviewers: [makeSnapshot("security"), makeSnapshot("perf")] };
    const chain = deriveImplReviewerChain(state);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW, "security", "perf"]);
  });

  it("accepts ReviewerSnapshot[] directly", () => {
    const snapshots: ReviewerSnapshot[] = [makeSnapshot("security")];
    const chain = deriveImplReviewerChain(snapshots);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW, "security"]);
  });

  it("accepts empty array (no custom reviewers)", () => {
    const chain = deriveImplReviewerChain([]);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
  });
});

// ---------------------------------------------------------------------------
// resolveActiveReviewer
// ---------------------------------------------------------------------------

describe("resolveActiveReviewer", () => {
  it("returns first in chain when no reviewer has run", () => {
    const state = makeState();
    const chain = [STEP_NAMES.CODE_REVIEW];
    expect(resolveActiveReviewer(state, chain)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  it("returns the reviewer with the most recent startedAt", () => {
    const state = makeState({
      "code-review": [
        { startedAt: "2026-01-01T00:01:00Z", endedAt: "2026-01-01T00:01:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    expect(resolveActiveReviewer(state, chain)).toBe("security");
  });

  it("returns code-review when it ran after security", () => {
    const state = makeState({
      "code-review": [
        { startedAt: "2026-01-01T00:03:00Z", endedAt: "2026-01-01T00:03:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    expect(resolveActiveReviewer(state, chain)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  it("handles multiple runs for same reviewer (uses last run startedAt)", () => {
    const state = makeState({
      "code-review": [
        { startedAt: "2026-01-01T00:01:00Z", endedAt: "2026-01-01T00:01:30Z", outcome: { verdict: "needs-fix" } },
        { startedAt: "2026-01-01T00:03:00Z", endedAt: "2026-01-01T00:03:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    // code-review's last run startedAt 00:03 > security's last run startedAt 00:02
    expect(resolveActiveReviewer(state, chain)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  // TC-028: same startedAt timestamp → chain 後位優先 (>= tie-break)
  it("TC-028: tie-break on equal startedAt favours later reviewer in chain", () => {
    const sameTime = "2026-01-01T00:02:00Z";
    const state = makeState({
      "code-review": [
        { startedAt: sameTime, endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: sameTime, endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    // Equal startedAt: security is later in chain so it should win
    expect(resolveActiveReviewer(state, chain)).toBe("security");
  });
});

// ---------------------------------------------------------------------------
// nextAfterReviewer
// ---------------------------------------------------------------------------

describe("nextAfterReviewer", () => {
  it("returns next reviewer when current is not last", () => {
    const chain = [STEP_NAMES.CODE_REVIEW, "security", "perf"];
    expect(nextAfterReviewer(STEP_NAMES.CODE_REVIEW, chain)).toBe("security");
    expect(nextAfterReviewer("security", chain)).toBe("perf");
  });

  it("returns CONFORMANCE when reviewer is last in chain", () => {
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    expect(nextAfterReviewer("security", chain)).toBe(STEP_NAMES.CONFORMANCE);
  });

  it("returns CONFORMANCE for code-review when it is the only reviewer", () => {
    const chain = [STEP_NAMES.CODE_REVIEW];
    expect(nextAfterReviewer(STEP_NAMES.CODE_REVIEW, chain)).toBe(STEP_NAMES.CONFORMANCE);
  });

  it("returns CONFORMANCE when reviewer is not found in chain", () => {
    const chain = [STEP_NAMES.CODE_REVIEW];
    expect(nextAfterReviewer("unknown", chain)).toBe(STEP_NAMES.CONFORMANCE);
  });
});
