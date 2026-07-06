/**
 * Tests for src/core/command/job-stats.ts
 *
 * TC-JSTATS-001: deriveRunStat — date is YYYY-MM-DD from createdAt
 * TC-JSTATS-002: deriveRunStat — durationSec from min(startedAt)..max(endedAt)
 * TC-JSTATS-003: deriveRunStat — convergence counts non-skipped review steps
 * TC-JSTATS-004: deriveRunStat — convergence excludes skipped verdicts
 * TC-JSTATS-005: deriveRunStat — convergence includes custom reviewer steps
 * TC-JSTATS-006: deriveRunStat — convergence is null when steps is empty
 * TC-JSTATS-007: deriveRunStat — convergence is 0 when review steps ran 0 times
 * TC-JSTATS-008: deriveRunStat — costUsd sums priced invocations
 * TC-JSTATS-009: deriveRunStat — costUsd null when usageFile is null
 * TC-JSTATS-010: deriveRunStat — costUsd null when all modelUsage entries are null
 * TC-JSTATS-011: deriveRunStat — durationSec null when no valid timestamps
 * TC-JSTATS-012: deriveRunStat — date null for invalid createdAt
 * TC-JSTATS-013: buildJobStatsReport — sorts by date asc then slug asc
 * TC-JSTATS-014: buildJobStatsReport — median (odd count)
 * TC-JSTATS-015: buildJobStatsReport — median (even count, average of two middle)
 * TC-JSTATS-016: buildJobStatsReport — convergenceMean
 * TC-JSTATS-017: buildJobStatsReport — null rows excluded from aggregate
 * TC-JSTATS-018: buildJobStatsReport — all-null population → null summary fields
 * TC-JSTATS-019: renderJobStatsTable — 0 runs outputs "No runs found."
 * TC-JSTATS-020: renderJobStatsTable — shows column headers
 * TC-JSTATS-021: renderJobStatsTable — null cells shown as "-"
 * TC-JSTATS-022: renderJobStatsTable — shows summary block
 * TC-JSTATS-023: renderJobStatsJson — top-level keys are exactly ["runs", "summary"]
 * TC-JSTATS-024: renderJobStatsJson — row keys match spec
 * TC-JSTATS-025: renderJobStatsJson — summary keys match spec
 * TC-JSTATS-026: IO fixture test — normal run produces table and JSON output
 * TC-JSTATS-027: IO fixture test — usage.json absent → costUsd = null
 * TC-JSTATS-028: IO fixture test — all modelUsage null → costUsd = null
 * TC-JSTATS-029: IO fixture test — events.jsonl absent → durationSec = null, convergence = null
 * TC-JSTATS-030: IO fixture test — exit code is always 0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { NormalizedJobState } from "../../../../src/store/job-state-store.js";
import type { UsageFile } from "../../../../src/core/usage/types.js";
import type { JobStatRow } from "../../../../src/core/command/job-stats.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<NormalizedJobState> = {}): NormalizedJobState {
  return {
    version: 2,
    jobId: "aaaabbbb-0000-0000-0000-000000000001",
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T11:00:00.000Z",
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "My Feature", type: "new-feature", slug: "my-slug" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/my-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function _makeUsageFile(overrides: Partial<UsageFile> = {}): UsageFile {
  return {
    commandInvocations: [],
    ...overrides,
  };
}

function makeStepRun(
  verdict: string,
  startedAt: string,
  endedAt: string,
) {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt,
    endedAt,
  };
}

// ---------------------------------------------------------------------------
// deriveRunStat
// ---------------------------------------------------------------------------

describe("deriveRunStat", () => {
  let deriveRunStat: typeof import("../../../../src/core/command/job-stats.js")["deriveRunStat"];

  beforeEach(async () => {
    ({ deriveRunStat } = await import("../../../../src/core/command/job-stats.js"));
  });

  // TC-JSTATS-001
  it("TC-JSTATS-001: date is YYYY-MM-DD from createdAt", () => {
    const state = makeState({ createdAt: "2026-03-05T14:22:00.000Z" });
    const row = deriveRunStat(state, null);
    expect(row.date).toBe("2026-03-05");
  });

  // TC-JSTATS-012
  it("TC-JSTATS-012: date is null for invalid createdAt", () => {
    const state = makeState({ createdAt: "not-a-date" });
    const row = deriveRunStat(state, null);
    expect(row.date).toBeNull();
  });

  // TC-JSTATS-002
  it("TC-JSTATS-002: durationSec from min(startedAt) to max(endedAt)", () => {
    const state = makeState({
      steps: {
        "spec-review": [makeStepRun("approved", "2026-01-15T10:00:00.000Z", "2026-01-15T10:05:00.000Z")],
        "implementer": [makeStepRun("passed", "2026-01-15T10:05:00.000Z", "2026-01-15T10:10:00.000Z")],
      },
    });
    const row = deriveRunStat(state, null);
    // 10m = 600s
    expect(row.durationSec).toBe(600);
  });

  // TC-JSTATS-011
  it("TC-JSTATS-011: durationSec is null when no valid timestamps", () => {
    const state = makeState({
      steps: {
        "spec-review": [makeStepRun("approved", "invalid", "invalid")],
      },
    });
    const row = deriveRunStat(state, null);
    expect(row.durationSec).toBeNull();
  });

  // TC-JSTATS-003
  it("TC-JSTATS-003: convergence counts non-skipped review steps", () => {
    const state = makeState({
      steps: {
        "spec-review": [
          makeStepRun("needs-fix", "2026-01-15T10:00:00.000Z", "2026-01-15T10:01:00.000Z"),
          makeStepRun("approved", "2026-01-15T10:02:00.000Z", "2026-01-15T10:03:00.000Z"),
        ],
        "code-review": [
          makeStepRun("approved", "2026-01-15T10:04:00.000Z", "2026-01-15T10:05:00.000Z"),
        ],
        "implementer": [makeStepRun("passed", "2026-01-15T10:00:00.000Z", "2026-01-15T10:01:00.000Z")],
      },
    });
    const row = deriveRunStat(state, null);
    // 2 spec-review + 1 code-review = 3
    expect(row.convergence).toBe(3);
  });

  // TC-JSTATS-004
  it("TC-JSTATS-004: convergence excludes skipped verdicts", () => {
    const state = makeState({
      steps: {
        "spec-review": [
          makeStepRun("skipped", "2026-01-15T10:00:00.000Z", "2026-01-15T10:01:00.000Z"),
        ],
        "code-review": [
          makeStepRun("approved", "2026-01-15T10:02:00.000Z", "2026-01-15T10:03:00.000Z"),
        ],
      },
    });
    const row = deriveRunStat(state, null);
    // skipped spec-review excluded, 1 code-review
    expect(row.convergence).toBe(1);
  });

  // TC-JSTATS-005
  it("TC-JSTATS-005: convergence includes custom reviewer steps", () => {
    const state = makeState({
      steps: {
        "security": [
          makeStepRun("needs-fix", "2026-01-15T10:00:00.000Z", "2026-01-15T10:01:00.000Z"),
          makeStepRun("approved", "2026-01-15T10:02:00.000Z", "2026-01-15T10:03:00.000Z"),
        ],
      },
      reviewers: [{
        name: "security",
        maxIterations: 3,
        purpose: "Security review",
        criteria: "Check for vulnerabilities",
        judgment: "approve or needs-fix",
        freeText: "",
      }],
    });
    const row = deriveRunStat(state, null);
    expect(row.convergence).toBe(2);
  });

  // TC-JSTATS-006
  it("TC-JSTATS-006: convergence is null when steps is empty", () => {
    const state = makeState({ steps: {} });
    const row = deriveRunStat(state, null);
    expect(row.convergence).toBeNull();
  });

  // TC-JSTATS-007
  it("TC-JSTATS-007: convergence is 0 when review steps ran 0 times", () => {
    const state = makeState({
      steps: {
        "implementer": [makeStepRun("passed", "2026-01-15T10:00:00.000Z", "2026-01-15T10:01:00.000Z")],
      },
    });
    const row = deriveRunStat(state, null);
    // Non-empty steps but no review steps ran
    expect(row.convergence).toBe(0);
  });

  // TC-JSTATS-008
  it("TC-JSTATS-008: costUsd sums priced invocations", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-15T10:01:00.000Z",
          modelUsage: {
            "claude-sonnet-4-6": {
              inputTokens: 1_000_000,
              outputTokens: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "aaaabbbb-0000-0000-0000-000000000001",
          stepName: "implementer",
        },
      ],
    };
    const state = makeState();
    const row = deriveRunStat(state, usageFile);
    // claude-sonnet-4-6 input = $3/MTok → 1M * 3 / 1e6 = $3
    expect(row.costUsd).toBeGreaterThan(0);
    expect(row.costUsd).not.toBeNull();
  });

  // TC-JSTATS-009
  it("TC-JSTATS-009: costUsd is null when usageFile is null", () => {
    const state = makeState();
    const row = deriveRunStat(state, null);
    expect(row.costUsd).toBeNull();
  });

  // TC-JSTATS-010
  it("TC-JSTATS-010: costUsd is null when all modelUsage entries are null", () => {
    const usageFile: UsageFile = {
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-15T10:01:00.000Z",
          modelUsage: null,
          jobId: "aaaabbbb-0000-0000-0000-000000000001",
          stepName: "implementer",
        },
      ],
    };
    const state = makeState();
    const row = deriveRunStat(state, usageFile);
    expect(row.costUsd).toBeNull();
  });

  it("outcome equals state.status", () => {
    const state = makeState({ status: "archived" });
    const row = deriveRunStat(state, null);
    expect(row.outcome).toBe("archived");
  });

  it("slug equals getJobSlug(state)", () => {
    const state = makeState({ request: { path: "/r.md", title: "T", type: "new-feature", slug: "my-slug" } });
    const row = deriveRunStat(state, null);
    expect(row.slug).toBe("my-slug");
  });
});

// ---------------------------------------------------------------------------
// buildJobStatsReport
// ---------------------------------------------------------------------------

describe("buildJobStatsReport", () => {
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  function makeRow(overrides: Partial<JobStatRow> = {}) {
    return {
      slug: "foo",
      date: "2026-01-01",
      durationSec: 100,
      convergence: 2,
      costUsd: 1.0,
      outcome: "archived",
      ...overrides,
    };
  }

  // TC-JSTATS-013
  it("TC-JSTATS-013: sorts by date asc then slug asc", () => {
    const rows = [
      makeRow({ slug: "bravo", date: "2026-01-02" }),
      makeRow({ slug: "alpha", date: "2026-01-02" }),
      makeRow({ slug: "zeta", date: "2026-01-01" }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.runs[0]!.slug).toBe("zeta");
    expect(report.runs[1]!.slug).toBe("alpha");
    expect(report.runs[2]!.slug).toBe("bravo");
  });

  it("null dates sort last", () => {
    const rows = [
      makeRow({ slug: "no-date", date: null }),
      makeRow({ slug: "has-date", date: "2026-01-01" }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.runs[0]!.slug).toBe("has-date");
    expect(report.runs[1]!.slug).toBe("no-date");
  });

  // TC-JSTATS-014
  it("TC-JSTATS-014: median of odd count", () => {
    const rows = [
      makeRow({ costUsd: 1.0 }),
      makeRow({ costUsd: 3.0 }),
      makeRow({ costUsd: 2.0 }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.costUsdMedian).toBe(2.0);
  });

  // TC-JSTATS-015
  it("TC-JSTATS-015: median of even count is average of two middle values", () => {
    const rows = [
      makeRow({ costUsd: 1.0 }),
      makeRow({ costUsd: 2.0 }),
      makeRow({ costUsd: 3.0 }),
      makeRow({ costUsd: 4.0 }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.costUsdMedian).toBe(2.5);
  });

  // TC-JSTATS-016
  it("TC-JSTATS-016: convergenceMean is arithmetic mean", () => {
    const rows = [
      makeRow({ convergence: 1 }),
      makeRow({ convergence: 3 }),
      makeRow({ convergence: 2 }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.convergenceMean).toBeCloseTo(2.0);
  });

  // TC-JSTATS-017
  it("TC-JSTATS-017: null rows excluded from aggregate populations", () => {
    const rows = [
      makeRow({ costUsd: 2.0, durationSec: 60, convergence: 1 }),
      makeRow({ costUsd: null, durationSec: null, convergence: null }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.costUsdTotal).toBe(2.0);
    expect(report.summary.costUsdMedian).toBe(2.0);
    expect(report.summary.durationSecMedian).toBe(60);
    expect(report.summary.convergenceMean).toBe(1);
  });

  // TC-JSTATS-018
  it("TC-JSTATS-018: all-null population → null summary fields", () => {
    const rows = [
      makeRow({ costUsd: null, durationSec: null, convergence: null }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.costUsdTotal).toBeNull();
    expect(report.summary.costUsdMedian).toBeNull();
    expect(report.summary.durationSecMedian).toBeNull();
    expect(report.summary.convergenceMean).toBeNull();
  });

  it("costUsdTotal is sum of non-null costUsd values", () => {
    const rows = [
      makeRow({ costUsd: 1.5 }),
      makeRow({ costUsd: 2.5 }),
      makeRow({ costUsd: null }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.costUsdTotal).toBeCloseTo(4.0);
  });

  it("runCount is total row count including nulls", () => {
    const rows = [
      makeRow({ costUsd: 1.0 }),
      makeRow({ costUsd: null }),
    ];
    const report = buildJobStatsReport(rows);
    expect(report.summary.runCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsTable
// ---------------------------------------------------------------------------

describe("renderJobStatsTable", () => {
  let renderJobStatsTable: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsTable"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsTable, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  // TC-JSTATS-019
  it("TC-JSTATS-019: 0 runs outputs a no-runs message", () => {
    const report = buildJobStatsReport([]);
    const output = renderJobStatsTable(report);
    expect(output).toContain("No runs found");
    expect(output).toContain("0 run");
  });

  // TC-JSTATS-020
  it("TC-JSTATS-020: shows column headers Slug, Date, Duration, Convergence, Cost, Outcome", () => {
    const report = buildJobStatsReport([
      { slug: "foo", date: "2026-01-01", durationSec: 120, convergence: 1, costUsd: 1.0, outcome: "archived" },
    ]);
    const output = renderJobStatsTable(report);
    expect(output).toContain("Slug");
    expect(output).toContain("Date");
    expect(output).toContain("Duration");
    expect(output).toContain("Convergence");
    expect(output).toContain("Cost");
    expect(output).toContain("Outcome");
  });

  // TC-JSTATS-021
  it("TC-JSTATS-021: null cells shown as -", () => {
    const report = buildJobStatsReport([
      { slug: "foo", date: null, durationSec: null, convergence: null, costUsd: null, outcome: "canceled" },
    ]);
    const output = renderJobStatsTable(report);
    // There should be multiple "-" for null fields
    const dashCount = (output.match(/-/g) ?? []).length;
    expect(dashCount).toBeGreaterThanOrEqual(3);
  });

  // TC-JSTATS-022
  it("TC-JSTATS-022: shows summary block with run count", () => {
    const report = buildJobStatsReport([
      { slug: "foo", date: "2026-01-01", durationSec: 300, convergence: 2, costUsd: 1.5, outcome: "archived" },
    ]);
    const output = renderJobStatsTable(report);
    expect(output).toContain("Summary");
    expect(output).toContain("1 run");
  });

  it("shows slug in output row", () => {
    const report = buildJobStatsReport([
      { slug: "my-feature", date: "2026-01-01", durationSec: 60, convergence: 1, costUsd: 0.5, outcome: "archived" },
    ]);
    const output = renderJobStatsTable(report);
    expect(output).toContain("my-feature");
  });
});

// ---------------------------------------------------------------------------
// renderJobStatsJson
// ---------------------------------------------------------------------------

describe("renderJobStatsJson", () => {
  let renderJobStatsJson: typeof import("../../../../src/core/command/job-stats.js")["renderJobStatsJson"];
  let buildJobStatsReport: typeof import("../../../../src/core/command/job-stats.js")["buildJobStatsReport"];

  beforeEach(async () => {
    ({ renderJobStatsJson, buildJobStatsReport } = await import("../../../../src/core/command/job-stats.js"));
  });

  // TC-JSTATS-023
  it("TC-JSTATS-023: top-level keys are exactly ['runs', 'summary']", () => {
    const report = buildJobStatsReport([]);
    const parsed = JSON.parse(renderJobStatsJson(report)) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort();
    expect(keys).toEqual(["runs", "summary"]);
  });

  // TC-JSTATS-024
  it("TC-JSTATS-024: row keys match spec", () => {
    const report = buildJobStatsReport([
      { slug: "foo", date: "2026-01-01", durationSec: 60, convergence: 1, costUsd: 1.0, outcome: "archived" },
    ]);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { runs: Record<string, unknown>[] };
    const rowKeys = Object.keys(parsed.runs[0]!).sort();
    expect(rowKeys).toEqual(["convergence", "costUsd", "date", "durationSec", "outcome", "slug"]);
  });

  // TC-JSTATS-025
  it("TC-JSTATS-025: summary keys match spec", () => {
    const report = buildJobStatsReport([]);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { summary: Record<string, unknown> };
    const summaryKeys = Object.keys(parsed.summary).sort();
    expect(summaryKeys).toEqual([
      "convergenceMean",
      "costUsdMedian",
      "costUsdTotal",
      "durationSecMedian",
      "runCount",
    ]);
  });

  it("null values are preserved as null in JSON (not undefined)", () => {
    const report = buildJobStatsReport([
      { slug: "foo", date: null, durationSec: null, convergence: null, costUsd: null, outcome: "canceled" },
    ]);
    const parsed = JSON.parse(renderJobStatsJson(report)) as { runs: Array<Record<string, unknown>>; summary: Record<string, unknown> };
    expect(parsed.runs[0]!["date"]).toBeNull();
    expect(parsed.runs[0]!["costUsd"]).toBeNull();
    expect(parsed.summary["costUsdTotal"]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IO fixture tests: runJobStats
// ---------------------------------------------------------------------------

describe("runJobStats IO fixtures", () => {
  let tmpDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-stats-fixture-"));
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Create a minimal state.json + events.jsonl + usage.json under archive/<date>-<slug>/ */
  async function createArchiveFixture(slug: string, opts: {
    date?: string;
    withUsage?: boolean;
    allModelUsageNull?: boolean;
    withEvents?: boolean;
  } = {}) {
    const { date = "2026-01-01", withUsage = true, allModelUsageNull = false, withEvents = true } = opts;
    const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive", `${date}-${slug}`);
    await fs.mkdir(archiveDir, { recursive: true });

    // Minimal state.json
    const state = {
      version: 2,
      jobId: `aaaabbbb-0000-0000-0000-${slug.replace(/-/g, "").slice(0, 12).padEnd(12, "0")}`,
      createdAt: `${date}T10:00:00.000Z`,
      updatedAt: `${date}T11:00:00.000Z`,
      request: { path: `/repo/specrunner/changes/${slug}/request.md`, title: "T", type: "new-feature", slug },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "pr-create",
      status: "archived",
      branch: `feat/${slug}`,
      history: [],
      error: null,
      steps: withEvents ? {
        "implementer": [{
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "passed", findingsPath: null, error: null },
          startedAt: `${date}T10:00:00.000Z`,
          endedAt: `${date}T10:30:00.000Z`,
        }],
        "code-review": [{
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved", findingsPath: null, error: null },
          startedAt: `${date}T10:30:00.000Z`,
          endedAt: `${date}T10:35:00.000Z`,
        }],
      } : {},
    };
    await fs.writeFile(path.join(archiveDir, "state.json"), JSON.stringify(state));

    if (withEvents) {
      const stepAttempt = JSON.stringify({
        type: "step-attempt",
        step: "implementer",
        sessionId: null,
        outcome: { verdict: "passed", findingsPath: null, error: null },
        startedAt: `${date}T10:00:00.000Z`,
        endedAt: `${date}T10:30:00.000Z`,
      });
      await fs.writeFile(path.join(archiveDir, "events.jsonl"), stepAttempt + "\n");
    }

    if (withUsage) {
      const usageData = {
        commandInvocations: [{
          command: "job",
          timestamp: `${date}T10:30:00.000Z`,
          modelUsage: allModelUsageNull ? null : {
            "claude-sonnet-4-6": {
              inputTokens: 500_000,
              outputTokens: 100_000,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: state.jobId,
          stepName: "implementer",
        }],
      };
      await fs.writeFile(path.join(archiveDir, "usage.json"), JSON.stringify(usageData));
    }
  }

  // TC-JSTATS-026
  it("TC-JSTATS-026: normal run produces table output with slug and summary", async () => {
    await createArchiveFixture("my-feature", { date: "2026-01-01" });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: false });

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(exitCode).toBe(0);
    expect(output).toContain("my-feature");
    expect(output).toContain("Summary");
  });

  it("TC-JSTATS-026b: --json produces valid JSON with correct top-level keys", async () => {
    await createArchiveFixture("my-feature", { date: "2026-01-01" });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["runs", "summary"]);
  });

  // TC-JSTATS-027
  it("TC-JSTATS-027: usage.json absent → costUsd is null (shown as - in table)", async () => {
    await createArchiveFixture("no-usage", { date: "2026-01-02", withUsage: false });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    expect(exitCode).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const parsed = JSON.parse(output) as { runs: Array<Record<string, unknown>> };
    const run = parsed.runs.find((r) => r["slug"] === "no-usage");
    expect(run).toBeDefined();
    expect(run!["costUsd"]).toBeNull();
  });

  // TC-JSTATS-028
  it("TC-JSTATS-028: all modelUsage null → costUsd is null", async () => {
    await createArchiveFixture("null-usage", { date: "2026-01-03", withUsage: true, allModelUsageNull: true });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    expect(exitCode).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const parsed = JSON.parse(output) as { runs: Array<Record<string, unknown>> };
    const run = parsed.runs.find((r) => r["slug"] === "null-usage");
    expect(run).toBeDefined();
    expect(run!["costUsd"]).toBeNull();
  });

  // TC-JSTATS-029
  it("TC-JSTATS-029: events.jsonl absent → steps empty → durationSec null, convergence null", async () => {
    await createArchiveFixture("no-events", { date: "2026-01-04", withEvents: false });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    expect(exitCode).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const parsed = JSON.parse(output) as { runs: Array<Record<string, unknown>> };
    const run = parsed.runs.find((r) => r["slug"] === "no-events");
    expect(run).toBeDefined();
    // state.json has no steps when events absent (we set steps:{} for no-events fixture)
    expect(run!["durationSec"]).toBeNull();
    expect(run!["convergence"]).toBeNull();
  });

  // TC-JSTATS-030
  it("TC-JSTATS-030: exit code is always 0 even with no runs", async () => {
    // Empty specrunner/changes dir
    await fs.mkdir(path.join(tmpDir, "specrunner", "changes"), { recursive: true });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: false });
    expect(exitCode).toBe(0);
  });
});
