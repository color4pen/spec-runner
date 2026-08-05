/**
 * Unit tests for job-stats — invocation metrics: cost basis and turn count.
 *
 * TC-010: totalCostUsd を持つ invocation は実測値で計上される
 * TC-011: totalCostUsd を持たない invocation は試算にフォールバックする
 * TC-012: 実測と試算が混在する run で二重計上しない
 * TC-013: 単価表に無いモデルでも totalCostUsd があれば集計に載る
 * TC-014: numTurns を持つ invocation の総和を出力する
 * TC-015: numTurns を持つ invocation が無い run は null になる
 * TC-021: costBasis が "measured" になる (should)
 * TC-022: costBasis が "estimated" になる (should)
 * TC-023: costBasis が null になる (should)
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedJobState } from "../../../../src/store/job-state-store.js";
import type { UsageFile } from "../../../../src/core/usage/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<NormalizedJobState> = {}): NormalizedJobState {
  return {
    version: 2,
    jobId: "metrics-test-job-001",
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T11:00:00.000Z",
    request: {
      path: "/repo/specrunner/changes/metrics-feature/request.md",
      title: "Metrics Feature",
      type: "new-feature",
      slug: "metrics-feature",
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/metrics-feature",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/** A priced model: claude-sonnet-4-6 input = $3/MTok, output = $15/MTok */
const PRICED_MODEL = "claude-sonnet-4-6";
const PRICED_USAGE = {
  inputTokens: 1_000_000,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};
// Expected estimated cost for above: $3.00

/** An unknown model (not in pricing table) */
const UNKNOWN_MODEL = "claude-opus-5";

function makeInvocation(overrides: Partial<{
  jobId: string;
  stepName: string;
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }> | null;
  numTurns: number;
  totalCostUsd: number;
}> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    command: "job",
    timestamp: "2026-01-15T10:01:00.000Z",
    modelUsage: null,
    jobId: "metrics-test-job-001",
    stepName: "implementer",
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// deriveRunStat (loaded dynamically to avoid module caching issues)
// ---------------------------------------------------------------------------

describe("job-stats metrics — deriveRunStat cost priority", () => {
  let deriveRunStat: typeof import("../../../../src/core/command/job-stats.js")["deriveRunStat"];

  beforeEach(async () => {
    ({ deriveRunStat } = await import("../../../../src/core/command/job-stats.js"));
  });

  // ── TC-010 ──────────────────────────────────────────────────────────────────

  it("TC-010: totalCostUsd を持つ invocation は実測値で計上される (modelUsage 試算は加算されない)", () => {
    // A single invocation that has both totalCostUsd AND priced modelUsage
    // Only totalCostUsd should be used; modelUsage.computeCostUsd should NOT be added
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          modelUsage: { [PRICED_MODEL]: PRICED_USAGE },
          // totalCostUsd is the measured value (e.g., $1.50)
          // modelUsage-based estimate would be ~$3.00
          totalCostUsd: 1.50,
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-010: cost must equal the measured value, NOT the estimated value
    // FAILS until implementation uses totalCostUsd when present
    expect(row.costUsd).toBeCloseTo(1.50, 4);

    // The measured cost of $1.50 must NOT be combined with estimated $3.00
    // If both were added, it would be ~$4.50 (double-counting)
    expect(row.costUsd).toBeLessThan(2.0);
  });

  // ── TC-011 ──────────────────────────────────────────────────────────────────

  it("TC-011: totalCostUsd を持たない invocation は試算にフォールバックする", () => {
    // An invocation with no totalCostUsd but priced modelUsage — must fall back to estimate
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          modelUsage: { [PRICED_MODEL]: PRICED_USAGE },
          // No totalCostUsd
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-011: cost must be the estimated value from computeCostUsd (should be ~$3.00 for 1M input tokens)
    // This should already work with current code but we verify the behavior is preserved
    expect(row.costUsd).not.toBeNull();
    expect(row.costUsd).toBeGreaterThan(0);
  });

  // ── TC-012 ──────────────────────────────────────────────────────────────────

  it("TC-012: 実測と試算が混在する run で二重計上しない", () => {
    // Two invocations: one with totalCostUsd (measured), one without (estimated)
    // Total must be sum of measured + estimated, no double-counting
    const measuredCost = 0.75;
    const usageFile: UsageFile = {
      commandInvocations: [
        // Invocation 1: has totalCostUsd → use measured value (0.75)
        makeInvocation({
          stepName: "design",
          modelUsage: { [PRICED_MODEL]: PRICED_USAGE }, // would be ~$3.00 estimated
          totalCostUsd: measuredCost,
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        // Invocation 2: no totalCostUsd → use estimated value from modelUsage
        makeInvocation({
          stepName: "implementer",
          modelUsage: {
            [PRICED_MODEL]: {
              inputTokens: 500_000, // ~$1.50 estimated
              outputTokens: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // Expected: measured(0.75) + estimated(~1.50) ≈ 2.25
    // If double-counting: measured(0.75) + estimated_for_inv1(~3.00) + estimated_for_inv2(~1.50) ≈ 5.25
    expect(row.costUsd).not.toBeNull();
    // Strictly less than naive double-counted sum
    expect(row.costUsd!).toBeLessThan(4.0);
    // Must include the measured cost
    expect(row.costUsd!).toBeGreaterThanOrEqual(measuredCost);

    // TC-012: costBasis must indicate "mixed" (both measured and estimated)
    // FAILS until implementation adds costBasis to JobStatRow
    expect((row as unknown as Record<string, unknown>)["costBasis"]).toBe("mixed");
  });

  // ── TC-013 ──────────────────────────────────────────────────────────────────

  it("TC-013: 単価表に無いモデルでも totalCostUsd があれば集計に載る", () => {
    // An invocation with an unknown model AND totalCostUsd
    // computeCostUsd would return null for unknown model (silent drop)
    // but totalCostUsd should keep it in the total
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          modelUsage: { [UNKNOWN_MODEL]: PRICED_USAGE }, // unknown model → computeCostUsd returns null
          totalCostUsd: 2.10, // SDK-measured cost (doesn't need pricing table)
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-013: totalCostUsd must be used even when modelUsage computeCostUsd returns null
    // FAILS until implementation uses totalCostUsd priority
    expect(row.costUsd).not.toBeNull();
    expect(row.costUsd).toBeCloseTo(2.10, 4);
  });

  // ── TC-021: costBasis "measured" ─────────────────────────────────────────────

  it("TC-021: costBasis は 'measured' になる — 全 invocation が totalCostUsd を持つ場合", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ totalCostUsd: 1.00 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        makeInvocation({ stepName: "code-review", totalCostUsd: 0.50 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-021: costBasis === "measured" when all invocations have totalCostUsd
    // FAILS until implementation adds costBasis logic
    expect((row as unknown as Record<string, unknown>)["costBasis"]).toBe("measured");
  });

  // ── TC-022: costBasis "estimated" ────────────────────────────────────────────

  it("TC-022: costBasis は 'estimated' になる — 全 invocation が totalCostUsd を持たず priced modelUsage のみ", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          modelUsage: { [PRICED_MODEL]: PRICED_USAGE },
          // No totalCostUsd
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-022: costBasis === "estimated" when no totalCostUsd but priced modelUsage
    // FAILS until implementation adds costBasis logic
    expect((row as unknown as Record<string, unknown>)["costBasis"]).toBe("estimated");
  });

  // ── TC-023: costBasis null ────────────────────────────────────────────────────

  it("TC-023: costBasis は null になる — cost 寄与が無い場合", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ modelUsage: null }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // costUsd must also be null
    expect(row.costUsd).toBeNull();

    // TC-023: costBasis === null when no cost contribution from any invocation
    // FAILS until implementation adds costBasis logic
    expect((row as unknown as Record<string, unknown>)["costBasis"]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deriveRunStat — turn count (TC-014, TC-015)
// ---------------------------------------------------------------------------

describe("job-stats metrics — deriveRunStat turn count", () => {
  let deriveRunStat: typeof import("../../../../src/core/command/job-stats.js")["deriveRunStat"];

  beforeEach(async () => {
    ({ deriveRunStat } = await import("../../../../src/core/command/job-stats.js"));
  });

  // ── TC-014 ──────────────────────────────────────────────────────────────────

  it("TC-014: numTurns を持つ invocation の総和を出力する", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ stepName: "design", numTurns: 4 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        makeInvocation({ stepName: "implementer", numTurns: 7 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        makeInvocation({ stepName: "spec-review", numTurns: 2 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-014: turns must be the sum of numTurns across all invocations: 4 + 7 + 2 = 13
    // FAILS until implementation adds turns calculation to deriveRunStat
    expect((row as unknown as Record<string, unknown>)["turns"]).toBe(13);
  });

  it("TC-014: only invocations with numTurns contribute to turns sum", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ stepName: "design", numTurns: 4 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        makeInvocation({ stepName: "verification" }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation, // No numTurns
        makeInvocation({ stepName: "implementer", numTurns: 6 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // Only invocations with numTurns contribute: 4 + 6 = 10 (not adding 0 for verification)
    expect((row as unknown as Record<string, unknown>)["turns"]).toBe(10);
  });

  // ── TC-015 ──────────────────────────────────────────────────────────────────

  it("TC-015: numTurns を持つ invocation が無い run は turns が null になる", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ stepName: "implementer" }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation, // no numTurns
        makeInvocation({ stepName: "verification" }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation, // no numTurns
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-015: turns must be null when no invocations have numTurns
    // FAILS until implementation adds turns calculation to deriveRunStat
    expect((row as unknown as Record<string, unknown>)["turns"]).toBeNull();
  });

  it("TC-015: turns is null when usageFile is null", () => {
    const state = makeState();
    const row = deriveRunStat(state, null);

    // No usage file → no invocations → no numTurns → null
    expect((row as unknown as Record<string, unknown>)["turns"]).toBeNull();
  });

  it("TC-015: turns is null when invocations have numTurns=null or undefined (not number)", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        // numTurns is explicitly null (non-number → should not be added)
        { ...makeInvocation(), numTurns: null } as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // null is not a number → should not contribute
    expect((row as unknown as Record<string, unknown>)["turns"]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsTable — new columns (TC-014 secondary, TC-021 secondary)
// ---------------------------------------------------------------------------

describe("job-stats metrics — renderJobStatsTable with Turns column", () => {
  let renderJobStatsTable: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsTable"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsTable, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  it("includes 'Turns' column header when rendering a table with turn data", () => {
    // Use a row with turns set (would come from deriveRunStat in real usage)
    const rows = [
      {
        slug: "metrics-feature",
        date: "2026-01-15",
        durationSec: 300,
        convergence: 2,
        costUsd: 1.5,
        outcome: "archived",
        turns: 13,
        costBasis: "measured" as const,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // TC-014: Turns column must appear in the table
    // FAILS until implementation adds Turns column to renderJobStatsTable
    expect(output).toMatch(/turn/i);
    expect(output).toContain("13");
  });

  it("shows '-' for turns when turns is null", () => {
    const rows = [
      {
        slug: "no-turns-slug",
        date: "2026-01-15",
        durationSec: 120,
        convergence: 1,
        costUsd: 0.5,
        outcome: "archived",
        turns: null,
        costBasis: null,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // null turns → "-" (consistent with other null fields)
    expect(output).toContain("-");
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsJson — turns and costBasis included in JSON
// ---------------------------------------------------------------------------

describe("job-stats metrics — renderJobStatsJson includes turns and costBasis", () => {
  let renderJobStatsJson: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsJson"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsJson, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  it("JSON output from deriveRunStat-built rows includes turns and costBasis fields", () => {
    // Simulate what deriveRunStat returns (with turns and costBasis always set)
    const rows = [
      {
        slug: "metrics-feature",
        date: "2026-01-15",
        durationSec: 300,
        convergence: 2,
        costUsd: 1.5,
        outcome: "archived",
        turns: 13,
        costBasis: "measured" as const,
      },
    ];
    const report = buildJobStatsReport(rows);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { runs: Record<string, unknown>[] };

    // TC-012/TC-021: costBasis must be in the JSON output
    // FAILS until implementation always sets costBasis in deriveRunStat and renders it
    const run = parsed.runs[0]!;
    expect(run).toHaveProperty("turns");
    expect(run["turns"]).toBe(13);
    expect(run).toHaveProperty("costBasis");
    expect(run["costBasis"]).toBe("measured");
  });

  it("JSON output with null turns and costBasis preserves null", () => {
    const rows = [
      {
        slug: "no-cost",
        date: "2026-01-15",
        durationSec: 60,
        convergence: 1,
        costUsd: null,
        outcome: "archived",
        turns: null,
        costBasis: null,
      },
    ];
    const report = buildJobStatsReport(rows);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { runs: Record<string, unknown>[] };

    const run = parsed.runs[0]!;
    // null values must appear as null in JSON, not omitted
    expect(run["turns"]).toBeNull();
    expect(run["costBasis"]).toBeNull();
  });
});
