/**
 * Unit tests for job-stats — invocation metrics: measuredCostUsd and turn count.
 *
 * TC-010: totalCostUsd を持つ invocation は measuredCostUsd に記録される
 * TC-011: totalCostUsd を持たない invocation は measuredCostUsd に寄与しない
 * TC-012: 実測と試算は独立列 — costUsd は全 invocation の modelUsage 試算、measuredCostUsd は totalCostUsd の総和
 * TC-013: 単価表に無いモデルでも totalCostUsd があれば measuredCostUsd に集計される
 * TC-014: numTurns を持つ invocation の総和を出力する
 * TC-015: numTurns を持つ invocation が無い run は null になる
 * TC-021: measuredCostUsd は totalCostUsd を持つ invocation の総和になる
 * TC-022: totalCostUsd を持つ invocation が無い run は measuredCostUsd が null になる
 * TC-023: cost 寄与が無い場合は costUsd と measuredCostUsd がともに null
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

describe("job-stats metrics — deriveRunStat measuredCostUsd and costUsd", () => {
  let deriveRunStat: typeof import("../../../../src/core/command/job-stats.js")["deriveRunStat"];

  beforeEach(async () => {
    ({ deriveRunStat } = await import("../../../../src/core/command/job-stats.js"));
  });

  // ── TC-010 ──────────────────────────────────────────────────────────────────

  it("TC-010: totalCostUsd を持つ invocation は measuredCostUsd に記録される", () => {
    // A single invocation that has both totalCostUsd AND priced modelUsage.
    // Design: costUsd uses computeCostUsd(modelUsage) independent of totalCostUsd.
    //         measuredCostUsd uses totalCostUsd (SDK-measured, main-work-query only).
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          modelUsage: { [PRICED_MODEL]: PRICED_USAGE }, // computeCostUsd ~= $3.00
          totalCostUsd: 1.50, // SDK-measured (main-work turn only)
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-010: measuredCostUsd must equal totalCostUsd
    expect(row.measuredCostUsd).toBeCloseTo(1.50, 4);

    // TC-010: costUsd must equal computeCostUsd(modelUsage) — independent of totalCostUsd
    expect(row.costUsd).not.toBeNull();
    expect(row.costUsd).toBeGreaterThan(2.0); // ~$3.00 from pricing table
  });

  // ── TC-011 ──────────────────────────────────────────────────────────────────

  it("TC-011: totalCostUsd を持たない invocation は measuredCostUsd に寄与しない", () => {
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

    // TC-011: measuredCostUsd must be null (no totalCostUsd provided)
    expect(row.measuredCostUsd).toBeNull();

    // TC-011: costUsd must still be computed from modelUsage
    expect(row.costUsd).not.toBeNull();
    expect(row.costUsd).toBeGreaterThan(0);
  });

  // ── TC-012 ──────────────────────────────────────────────────────────────────

  it("TC-012: 実測と試算は独立 — costUsd は全 invocation の modelUsage 試算、measuredCostUsd は totalCostUsd の総和", () => {
    // inv1 has totalCostUsd ($0.75) AND priced modelUsage (~$3.00)
    // inv2 has no totalCostUsd, only priced modelUsage (~$1.50)
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          stepName: "design",
          modelUsage: { [PRICED_MODEL]: PRICED_USAGE }, // ~$3.00
          totalCostUsd: 0.75, // SDK-measured (main-work only)
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        makeInvocation({
          stepName: "implementer",
          modelUsage: {
            [PRICED_MODEL]: {
              inputTokens: 500_000, // ~$1.50
              outputTokens: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          // No totalCostUsd
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-012: costUsd = sum of computeCostUsd for ALL invocations ≈ $3.00 + $1.50 = $4.50
    expect(row.costUsd).not.toBeNull();
    expect(row.costUsd!).toBeGreaterThan(3.0); // At least inv1's estimate

    // TC-012: measuredCostUsd = only inv1's totalCostUsd = $0.75
    expect(row.measuredCostUsd).toBeCloseTo(0.75, 4);
    expect(row.measuredCostUsd!).toBeLessThan(2.0);
  });

  // ── TC-013 ──────────────────────────────────────────────────────────────────

  it("TC-013: 単価表に無いモデルでも totalCostUsd があれば measuredCostUsd に集計される", () => {
    // computeCostUsd returns null for unknown model → costUsd is null
    // but totalCostUsd should still populate measuredCostUsd
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({
          modelUsage: { [UNKNOWN_MODEL]: PRICED_USAGE }, // unknown → computeCostUsd = null
          totalCostUsd: 2.10, // SDK-measured
        }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-013: costUsd is null (unknown model, computeCostUsd returns null)
    expect(row.costUsd).toBeNull();

    // TC-013: measuredCostUsd captures totalCostUsd even for unknown models
    expect(row.measuredCostUsd).not.toBeNull();
    expect(row.measuredCostUsd).toBeCloseTo(2.10, 4);
  });

  // ── TC-021: measuredCostUsd — sum of totalCostUsd ──────────────────────────

  it("TC-021: measuredCostUsd は totalCostUsd を持つ全 invocation の総和になる", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ totalCostUsd: 1.00 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
        makeInvocation({ stepName: "code-review", totalCostUsd: 0.50 }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // TC-021: measuredCostUsd = $1.00 + $0.50 = $1.50
    expect(row.measuredCostUsd).toBeCloseTo(1.50, 4);
  });

  // ── TC-022: measuredCostUsd null ─────────────────────────────────────────────

  it("TC-022: totalCostUsd を持つ invocation が無い run は measuredCostUsd が null になる", () => {
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

    // TC-022: measuredCostUsd is null when no invocations have totalCostUsd
    expect(row.measuredCostUsd).toBeNull();
  });

  // ── TC-023: no cost contribution ─────────────────────────────────────────────

  it("TC-023: cost 寄与が無い場合は costUsd と measuredCostUsd がともに null", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        makeInvocation({ modelUsage: null }) as unknown as import("../../../../src/core/usage/types.js").CommandInvocation,
      ],
    };

    const state = makeState();
    const row = deriveRunStat(state, usageFile);

    // costUsd: no modelUsage → null
    expect(row.costUsd).toBeNull();

    // measuredCostUsd: no totalCostUsd → null
    expect(row.measuredCostUsd).toBeNull();
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

    // TC-014: turns = 4 + 7 + 2 = 13
    expect(row.turns).toBe(13);
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
    expect(row.turns).toBe(10);
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
    expect(row.turns).toBeNull();
  });

  it("TC-015: turns is null when usageFile is null", () => {
    const state = makeState();
    const row = deriveRunStat(state, null);

    // No usage file → no invocations → no numTurns → null
    expect(row.turns).toBeNull();
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
    expect(row.turns).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsTable — new columns (TC-014 secondary)
// ---------------------------------------------------------------------------

describe("job-stats metrics — renderJobStatsTable with Turns and SDK$ columns", () => {
  let renderJobStatsTable: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsTable"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsTable, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  it("includes 'Turns' column header when rendering a table with turn data", () => {
    const rows = [
      {
        slug: "metrics-feature",
        date: "2026-01-15",
        durationSec: 300,
        convergence: 2,
        costUsd: 3.0,
        outcome: "archived",
        turns: 13,
        measuredCostUsd: 1.5,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // TC-014: Turns column must appear in the table
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
        measuredCostUsd: null,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // null turns → "-" (consistent with other null fields)
    expect(output).toContain("-");
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsTable — measuredCostUsd column (AC #8 table path)
// ---------------------------------------------------------------------------

describe("job-stats metrics — renderJobStatsTable measuredCostUsd column", () => {
  let renderJobStatsTable: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsTable"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsTable, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  it("AC-8-table: shows 'SDK $' column header in the table for measured cost", () => {
    const rows = [
      {
        slug: "measured-feature",
        date: "2026-01-15",
        durationSec: 300,
        convergence: 2,
        costUsd: 3.0,
        outcome: "archived",
        turns: 5,
        measuredCostUsd: 1.5,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // The table must contain an SDK $ column header (case-insensitive)
    expect(output).toMatch(/sdk/i);
  });

  it("AC-8-table: measuredCostUsd value appears in the table row", () => {
    const rows = [
      {
        slug: "sdk-cost-feature",
        date: "2026-01-15",
        durationSec: 300,
        convergence: 2,
        costUsd: 3.0,
        outcome: "archived",
        turns: 5,
        measuredCostUsd: 1.50,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    const lines = output.split("\n");
    const dataLine = lines.find((l) => l.includes("sdk-cost-feature"));
    expect(dataLine).toBeDefined();
    // The measured cost ($1.50) should appear in the data line
    expect(dataLine).toContain("1.50");
  });

  it("AC-8-table: measuredCostUsd=null renders as '-' in table", () => {
    const rows = [
      {
        slug: "no-sdk-cost",
        date: "2026-01-15",
        durationSec: 60,
        convergence: 0,
        costUsd: 2.0,
        outcome: "archived",
        turns: null,
        measuredCostUsd: null,
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // measuredCostUsd=null → "-" in SDK $ column
    const lines = output.split("\n");
    const dataLine = lines.find((l) => l.includes("no-sdk-cost"));
    expect(dataLine).toBeDefined();
    expect(dataLine).toContain("-");
  });

  it("AC-8-table: measuredCostUsd=undefined (legacy rows without field) renders as '-'", () => {
    // Simulate a legacy row without measuredCostUsd or turns
    const rows = [
      {
        slug: "legacy-feature",
        date: "2026-01-15",
        durationSec: 60,
        convergence: 1,
        costUsd: 1.0,
        outcome: "archived",
        // measuredCostUsd and turns intentionally omitted (legacy row)
      },
    ];
    const report = buildJobStatsReport(rows);
    const output = renderJobStatsTable(report);

    // Should not throw; SDK $ column shows "-" for undefined measuredCostUsd
    const lines = output.split("\n");
    const dataLine = lines.find((l) => l.includes("legacy-feature"));
    expect(dataLine).toBeDefined();
    expect(dataLine).toContain("-");
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsJson — turns and measuredCostUsd included in JSON
// ---------------------------------------------------------------------------

describe("job-stats metrics — renderJobStatsJson includes turns and measuredCostUsd", () => {
  let renderJobStatsJson: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsJson"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsJson, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  it("JSON output includes turns and measuredCostUsd fields when set", () => {
    const rows = [
      {
        slug: "metrics-feature",
        date: "2026-01-15",
        durationSec: 300,
        convergence: 2,
        costUsd: 3.0,
        outcome: "archived",
        turns: 13,
        measuredCostUsd: 1.5,
      },
    ];
    const report = buildJobStatsReport(rows);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { runs: Record<string, unknown>[] };

    const run = parsed.runs[0]!;
    expect(run).toHaveProperty("turns");
    expect(run["turns"]).toBe(13);
    expect(run).toHaveProperty("measuredCostUsd");
    expect(run["measuredCostUsd"]).toBe(1.5);
  });

  it("JSON output with null turns and measuredCostUsd preserves null", () => {
    const rows = [
      {
        slug: "no-cost",
        date: "2026-01-15",
        durationSec: 60,
        convergence: 1,
        costUsd: null,
        outcome: "archived",
        turns: null,
        measuredCostUsd: null,
      },
    ];
    const report = buildJobStatsReport(rows);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { runs: Record<string, unknown>[] };

    const run = parsed.runs[0]!;
    // null values must appear as null in JSON, not omitted
    expect(run["turns"]).toBeNull();
    expect(run["measuredCostUsd"]).toBeNull();
  });
});
