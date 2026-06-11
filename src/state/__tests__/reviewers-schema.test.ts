/**
 * T-06: Reviewer snapshot round-trip through validateJobState.
 *
 * Verifies:
 * - reviewers field persists through validateJobState
 * - absence of reviewers field is accepted (backward compat)
 * - invalid reviewers entries are rejected
 */
import { describe, it, expect } from "vitest";
import { validateJobState } from "../schema.js";
import { buildInitialJobState } from "../../store/job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "t" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reviewers round-trip
// ---------------------------------------------------------------------------

describe("validateJobState — reviewers field", () => {
  it("accepts state without reviewers field (backward compat)", () => {
    const raw = makeMinimalRaw();
    expect(() => validateJobState(raw)).not.toThrow();
    const state = validateJobState(raw);
    expect(state.reviewers).toBeUndefined();
  });

  it("accepts reviewers: [] (empty array)", () => {
    const raw = makeMinimalRaw({ reviewers: [] });
    expect(() => validateJobState(raw)).not.toThrow();
    const state = validateJobState(raw);
    expect(state.reviewers).toEqual([]);
  });

  it("round-trips a single reviewer snapshot", () => {
    const reviewers = [
      { name: "security", maxIterations: 3, purpose: "p", criteria: "c", judgment: "j", freeText: "" },
    ];
    const raw = makeMinimalRaw({ reviewers });
    const state = validateJobState(raw);
    expect(state.reviewers).toHaveLength(1);
    expect(state.reviewers![0]!.name).toBe("security");
    expect(state.reviewers![0]!.maxIterations).toBe(3);
  });

  it("round-trips multiple reviewer snapshots", () => {
    const reviewers = [
      { name: "security", maxIterations: 3, purpose: "p", criteria: "c", judgment: "j", freeText: "" },
      { name: "perf", maxIterations: 5, purpose: "p2", criteria: "c2", judgment: "j2", freeText: "" },
    ];
    const raw = makeMinimalRaw({ reviewers });
    const state = validateJobState(raw);
    expect(state.reviewers).toHaveLength(2);
    expect(state.reviewers![1]!.name).toBe("perf");
  });

  it("rejects reviewers that is not an array", () => {
    const raw = makeMinimalRaw({ reviewers: "not-an-array" });
    expect(() => validateJobState(raw)).toThrow(/reviewers must be an array/);
  });

  it("rejects reviewer entry without name", () => {
    const raw = makeMinimalRaw({ reviewers: [{ maxIterations: 3 }] });
    expect(() => validateJobState(raw)).toThrow(/non-empty string 'name'/);
  });

  it("rejects reviewer entry with empty name", () => {
    const raw = makeMinimalRaw({ reviewers: [{ name: "", maxIterations: 3 }] });
    expect(() => validateJobState(raw)).toThrow(/non-empty string 'name'/);
  });

  it("rejects reviewer entry without maxIterations", () => {
    const raw = makeMinimalRaw({ reviewers: [{ name: "sec" }] });
    expect(() => validateJobState(raw)).toThrow(/numeric 'maxIterations'/);
  });

  it("rejects reviewer entry where maxIterations is a string", () => {
    const raw = makeMinimalRaw({ reviewers: [{ name: "sec", maxIterations: "3" }] });
    expect(() => validateJobState(raw)).toThrow(/numeric 'maxIterations'/);
  });
});

// ---------------------------------------------------------------------------
// buildInitialJobState
// ---------------------------------------------------------------------------

describe("buildInitialJobState — reviewers field", () => {
  it("produces state without reviewers field when not passed", () => {
    const state = buildInitialJobState({
      request: { path: "/req.md", title: "T", type: "bug-fix" },
      repository: { owner: "o", name: "r" },
    });
    expect(state.reviewers).toBeUndefined();
  });
});
