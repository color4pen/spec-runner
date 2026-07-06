/**
 * Tests for ps PR hint display.
 *
 * TC-23: prMerged: true → "(PR merged)" in STATUS and "job archive <slug>" in NEXT
 * TC-24: prMerged: false → normal display
 * TC-25: prMerged: undefined/null → normal display
 */

import { describe, it, expect } from "vitest";
import {
  buildOperationsView,
  formatOperationsViewHuman,
  formatOperationsViewJson,
} from "../../../src/core/job-list/operations-view.js";
import type { ViewEntry } from "../../../src/core/job-list/operations-view.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeAwaitingArchiveState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
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

function buildView(prMerged: boolean | null) {
  const state = makeAwaitingArchiveState();
  const entry: ViewEntry = { job: state, isStale: false, prMerged };
  return buildOperationsView([entry]);
}

// ---------------------------------------------------------------------------
// TC-23: prMerged: true → PR merged hint in STATUS and archive in NEXT
// ---------------------------------------------------------------------------

describe("TC-23: prMerged=true → (PR merged) in STATUS and job archive in NEXT", () => {
  it("includes (PR merged) in STATUS column (TTY mode)", () => {
    const view = buildView(true);
    const output = formatOperationsViewHuman(view, { isTty: true });
    expect(output).toContain("(PR merged)");
  });

  it("includes (PR merged) in STATUS column (non-TTY mode)", () => {
    const view = buildView(true);
    const output = formatOperationsViewHuman(view, { isTty: false });
    expect(output).toContain("(PR merged)");
  });

  it("status cell is 'awaiting-archive (PR merged)'", () => {
    const view = buildView(true);
    const output = formatOperationsViewHuman(view, { isTty: false });
    expect(output).toContain("awaiting-archive (PR merged)");
  });

  it("NEXT column shows 'job archive test-slug'", () => {
    const view = buildView(true);
    const output = formatOperationsViewHuman(view, { isTty: false });
    expect(output).toContain("job archive test-slug");
  });

  it("JSON output shows escalationStep null and nextAction 'job archive test-slug'", () => {
    const view = buildView(true);
    const parsed = JSON.parse(formatOperationsViewJson(view)) as {
      categories: Array<{ jobs: Array<Record<string, unknown>> }>;
    };
    const job = parsed.categories[0]!.jobs[0]!;
    expect(job["nextAction"]).toBe("job archive test-slug");
    expect(job["prMerged"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-24: prMerged: false → normal display, no PR merged hint
// ---------------------------------------------------------------------------

describe("TC-24: prMerged=false → normal display without PR merged hint", () => {
  it("does not include (PR merged) in output", () => {
    const view = buildView(false);
    const output = formatOperationsViewHuman(view, { isTty: true });
    expect(output).not.toContain("(PR merged)");
  });

  it("shows awaiting-archive without hint", () => {
    const view = buildView(false);
    const output = formatOperationsViewHuman(view, { isTty: false });
    expect(output).toContain("awaiting-archive");
    expect(output).not.toContain("(PR merged)");
  });

  it("NEXT is '-' when PR not merged", () => {
    const view = buildView(false);
    const output = formatOperationsViewHuman(view, { isTty: false });
    // In non-TTY: JOB_ID\tSLUG\tSTEP\tSTATUS\tNEXT\tAGE
    const dataLine = output.split("\n").find((l) => l.includes("\t") && !l.startsWith("JOB_ID") && !l.startsWith("["));
    expect(dataLine).toBeDefined();
    const fields = (dataLine ?? "").split("\t");
    expect(fields[4]).toBe("-"); // NEXT column
  });
});

// ---------------------------------------------------------------------------
// TC-25: prMerged: null → normal display without hint
// ---------------------------------------------------------------------------

describe("TC-25: prMerged=null → normal display without PR merged hint", () => {
  it("does not include (PR merged) when prMerged is null", () => {
    const view = buildView(null);
    const output = formatOperationsViewHuman(view, { isTty: true });
    expect(output).not.toContain("(PR merged)");
  });

  it("shows normal awaiting-archive status without hint", () => {
    const view = buildView(null);
    const output = formatOperationsViewHuman(view, { isTty: false });
    expect(output).toContain("awaiting-archive");
    expect(output).not.toContain("(PR merged)");
  });
});
