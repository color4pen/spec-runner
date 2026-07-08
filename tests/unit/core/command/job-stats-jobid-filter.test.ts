/**
 * Tests for job-stats.ts pure functions.
 *
 * TC-S01: same slug, two jobIds, shared usage file → each job row shows only its own cost
 * TC-S02: usage file with only jobId-absent invocations → cost is summed for any job
 * TC-S03: mixed legacy (no jobId) + new (jobId="job-A") invocations → cost includes both
 * TC-S04: usage file with only a foreign jobId → costUsd is null
 */

import { describe, it, expect } from "vitest";
import { deriveRunStat, buildJobStatsReport } from "../../../../src/core/command/job-stats.js";
import type { NormalizedJobState } from "../../../../src/store/job-state-store.js";
import type { UsageFile } from "../../../../src/core/usage/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let _counter = 0;

function makeNormalizedState(opts: { jobId: string; slug?: string }): NormalizedJobState {
  _counter++;
  const slug = opts.slug ?? `test-slug-${_counter}`;
  return {
    version: 2,
    jobId: opts.jobId,
    createdAt: "2025-01-01T12:00:00Z",
    updatedAt: "2025-01-01T12:00:00Z",
    request: {
      path: `/req/${slug}.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: `feat/${slug}`,
    history: [],
    error: null,
    steps: {},
  };
}

/**
 * Build a minimal ModelUsage that produces a known non-zero cost via claude-haiku-4-5
 * pricing ($0.8/MTok input, $4.0/MTok output, $0.08/MTok cacheRead, $1.0/MTok cacheWrite).
 * Using 1,000,000 input tokens → $0.80 cost.
 */
function makeModelUsage(inputTokens = 1_000_000) {
  return {
    inputTokens,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
}

function makeUsageFile(
  invocations: Array<{
    jobId?: string;
    modelUsage?: Record<string, ReturnType<typeof makeModelUsage>> | null;
  }>,
): UsageFile {
  return {
    commandInvocations: invocations.map((inv) => ({
      command: "job" as const,
      timestamp: "2025-01-01T10:00:00Z",
      modelUsage: inv.modelUsage !== undefined ? inv.modelUsage : { "claude-haiku-4-5": makeModelUsage() },
      ...(inv.jobId !== undefined ? { jobId: inv.jobId } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// TC-S01: same slug, two jobIds, shared usage file → each row shows only its cost
// ---------------------------------------------------------------------------

describe("TC-S01: same slug, two jobIds, shared usage file — no double-counting", () => {
  it("each job row reflects only its own invocation cost, summary is the correct sum", () => {
    const sharedSlug = "shared-slug";

    const stateA = makeNormalizedState({ jobId: "job-A", slug: sharedSlug });
    const stateB = makeNormalizedState({ jobId: "job-B", slug: sharedSlug });

    // Usage file contains one invocation per job, using 1M input tokens each
    const usageFile = makeUsageFile([
      { jobId: "job-A", modelUsage: { "claude-haiku-4-5": makeModelUsage(1_000_000) } },
      { jobId: "job-B", modelUsage: { "claude-haiku-4-5": makeModelUsage(2_000_000) } },
    ]);

    const rowA = deriveRunStat(stateA, usageFile);
    const rowB = deriveRunStat(stateB, usageFile);

    // claude-haiku-4-5 input: $0.8/MTok
    // job-A: 1M tokens → $0.80
    // job-B: 2M tokens → $1.60
    expect(rowA.costUsd).toBeCloseTo(0.80, 6);
    expect(rowB.costUsd).toBeCloseTo(1.60, 6);

    // Summary: costUsdTotal should be rowA + rowB (not doubled)
    const report = buildJobStatsReport([rowA, rowB]);
    expect(report.summary.costUsdTotal).toBeCloseTo(0.80 + 1.60, 6);
  });
});

// ---------------------------------------------------------------------------
// TC-S02: usage file with only jobId-absent invocations → cost summed for any job
// ---------------------------------------------------------------------------

describe("TC-S02: legacy invocations without jobId are always included", () => {
  it("costUsd equals sum of all invocations when none have jobId", () => {
    const state = makeNormalizedState({ jobId: "job-X" });

    // Two invocations with no jobId, each 1M input tokens → each $0.80
    const usageFile = makeUsageFile([
      { modelUsage: { "claude-haiku-4-5": makeModelUsage(1_000_000) } },
      { modelUsage: { "claude-haiku-4-5": makeModelUsage(1_000_000) } },
    ]);

    const row = deriveRunStat(state, usageFile);

    // Both should be included: 2 × $0.80 = $1.60
    expect(row.costUsd).toBeCloseTo(1.60, 6);
  });
});

// ---------------------------------------------------------------------------
// TC-S03: mixed legacy (no jobId) + new (jobId = "job-A") → both included
// ---------------------------------------------------------------------------

describe("TC-S03: mixed legacy + own-jobId invocations — both are included", () => {
  it("costUsd includes both legacy (no jobId) and matching jobId invocations", () => {
    const state = makeNormalizedState({ jobId: "job-A" });

    const usageFile = makeUsageFile([
      // Legacy invocation (no jobId) — should always be included
      { modelUsage: { "claude-haiku-4-5": makeModelUsage(1_000_000) } },
      // Own jobId invocation — should be included
      { jobId: "job-A", modelUsage: { "claude-haiku-4-5": makeModelUsage(1_000_000) } },
    ]);

    const row = deriveRunStat(state, usageFile);

    // Both included: 2 × $0.80 = $1.60
    expect(row.costUsd).toBeCloseTo(1.60, 6);
  });
});

// ---------------------------------------------------------------------------
// TC-S04: usage file with only a foreign jobId → costUsd is null
// ---------------------------------------------------------------------------

describe("TC-S04: foreign jobId invocation is excluded — costUsd is null", () => {
  it("returns null when the only invocation belongs to a different jobId", () => {
    const state = makeNormalizedState({ jobId: "job-A" });

    const usageFile = makeUsageFile([
      { jobId: "job-B", modelUsage: { "claude-haiku-4-5": makeModelUsage(1_000_000) } },
    ]);

    const row = deriveRunStat(state, usageFile);

    expect(row.costUsd).toBeNull();
  });
});
