/**
 * Tests for ps PR hint display (Phase 3).
 *
 * TC-23: formatJobRow に prMerged: true を渡すと "(PR merged, run archive)" が含まれる
 * TC-24: prMerged が false の場合は通常表示
 * TC-25: prMerged が undefined の場合は通常表示
 */

import { describe, it, expect } from "vitest";
import { formatJobRow } from "../../../src/cli/ps.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeAwaitingArchiveJob(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "abcd1234efgh5678",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test Request", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
    pullRequest: { url: "https://github.com/testowner/testrepo/pull/42", number: 42, createdAt: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-23: prMerged: true → hint 表示
// ---------------------------------------------------------------------------

describe("TC-23: formatJobRow with prMerged=true", () => {
  it("includes (PR merged, run archive) in output (TTY mode)", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, true, Date.now(), true);
    expect(row).toContain("(PR merged, run archive)");
  });

  it("includes (PR merged, run archive) in output (non-TTY mode)", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, false, Date.now(), true);
    expect(row).toContain("(PR merged, run archive)");
  });

  it("status column is awaiting-archive (PR merged, run archive)", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, false, Date.now(), true);
    expect(row).toContain("awaiting-archive (PR merged, run archive)");
  });
});

// ---------------------------------------------------------------------------
// TC-24: prMerged: false → 通常表示
// ---------------------------------------------------------------------------

describe("TC-24: formatJobRow with prMerged=false", () => {
  it("does not include (PR merged, run archive) in output", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, true, Date.now(), false);
    expect(row).not.toContain("(PR merged, run archive)");
  });

  it("shows normal awaiting-archive status", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, false, Date.now(), false);
    expect(row).toContain("awaiting-archive");
    expect(row).not.toContain("(PR merged, run archive)");
  });
});

// ---------------------------------------------------------------------------
// TC-25: prMerged: undefined → 通常表示
// ---------------------------------------------------------------------------

describe("TC-25: formatJobRow with prMerged=undefined", () => {
  it("does not include (PR merged, run archive) when prMerged is not passed", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, true, Date.now());
    expect(row).not.toContain("(PR merged, run archive)");
  });

  it("shows normal awaiting-archive status without the hint", () => {
    const job = makeAwaitingArchiveJob();
    const row = formatJobRow(job, false, Date.now());
    expect(row).toContain("awaiting-archive");
    expect(row).not.toContain("(PR merged, run archive)");
  });
});
