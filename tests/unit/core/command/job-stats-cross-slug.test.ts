/**
 * IO fixture tests for job-stats cross-slug cost segregation.
 *
 * TC-CROSS-001: same base-slug, two jobIds in separate dirs → each row gets its own cost
 * TC-CROSS-002: legacy (no-jobId) invocations are not cross-contaminated between dirs
 * TC-CROSS-003: usage.json absent → costUsd is null, row is not dropped
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** claude-haiku-4-5 pricing: $0.8/MTok input */
const HAIKU_MODEL = "claude-haiku-4-5";

function makeStateJson(opts: {
  jobId: string;
  slug: string;
  date?: string;
  status?: string;
}): string {
  const { jobId, slug, date = "2026-05-01", status = "archived" } = opts;
  return JSON.stringify({
    version: 2,
    jobId,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T11:00:00.000Z`,
    request: {
      path: `/repo/specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug,
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status,
    branch: `fix/${slug}`,
    history: [],
    error: null,
    pipelineId: "standard-v1",
    steps: {},
  });
}

function makeUsageJson(invocations: Array<{ jobId?: string; inputTokens: number }>): string {
  return JSON.stringify({
    commandInvocations: invocations.map((inv) => ({
      command: "job",
      timestamp: "2026-05-01T10:30:00.000Z",
      modelUsage: {
        [HAIKU_MODEL]: {
          inputTokens: inv.inputTokens,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
      ...(inv.jobId !== undefined ? { jobId: inv.jobId } : {}),
      stepName: "implementer",
    })),
  });
}

/** Create an archive fixture at specrunner/changes/archive/<date>-<slug>/ */
async function createArchiveFixture(
  tmpDir: string,
  slug: string,
  opts: {
    jobId: string;
    date?: string;
    invocations?: Array<{ jobId?: string; inputTokens: number }>;
    withUsage?: boolean;
  },
): Promise<void> {
  const { jobId, date = "2026-05-01", invocations, withUsage = true } = opts;
  const datedSlug = `${date}-${slug}`;
  const dir = path.join(tmpDir, "specrunner", "changes", "archive", datedSlug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "state.json"),
    makeStateJson({ jobId, slug, date, status: "archived" }),
  );
  if (withUsage && invocations) {
    await fs.writeFile(path.join(dir, "usage.json"), makeUsageJson(invocations));
  }
}

/** Create an active fixture at specrunner/changes/<slug>/ */
async function createActiveFixture(
  tmpDir: string,
  slug: string,
  opts: {
    jobId: string;
    date?: string;
    invocations?: Array<{ jobId?: string; inputTokens: number }>;
    withUsage?: boolean;
  },
): Promise<void> {
  const { jobId, date = "2026-06-01", invocations, withUsage = true } = opts;
  const dir = path.join(tmpDir, "specrunner", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "state.json"),
    makeStateJson({ jobId, slug, date, status: "awaiting-archive" }),
  );
  if (withUsage && invocations) {
    await fs.writeFile(path.join(dir, "usage.json"), makeUsageJson(invocations));
  }
}

// ---------------------------------------------------------------------------
// TC-CROSS-001: same base-slug, two jobIds, separate dirs → each row own cost
// ---------------------------------------------------------------------------

describe("TC-CROSS-001: same base-slug, two jobIds — no cost misassignment", () => {
  let tmpDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-stats-cross-001-"));
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("archived and active rows each show their own cost; total = sum (not doubled)", async () => {
    const ARCHIVED_JOB_ID = "aaaaaaaa-0000-0000-0000-000000000001";
    const ACTIVE_JOB_ID = "bbbbbbbb-0000-0000-0000-000000000002";

    // Archive: 1M input tokens → $0.80 (haiku $0.8/MTok)
    await createArchiveFixture(tmpDir, "foo", {
      jobId: ARCHIVED_JOB_ID,
      date: "2026-05-01",
      invocations: [{ jobId: ARCHIVED_JOB_ID, inputTokens: 1_000_000 }],
    });

    // Active: 2M input tokens → $1.60
    await createActiveFixture(tmpDir, "foo", {
      jobId: ACTIVE_JOB_ID,
      date: "2026-06-01",
      invocations: [{ jobId: ACTIVE_JOB_ID, inputTokens: 2_000_000 }],
    });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    expect(exitCode).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const parsed = JSON.parse(output) as {
      runs: Array<{ slug: string; costUsd: number | null }>;
      summary: { costUsdTotal: number | null };
    };

    // Both rows must be present
    expect(parsed.runs).toHaveLength(2);
    const allSlugs = parsed.runs.map((r) => r.slug);
    expect(allSlugs.every((s) => s === "foo")).toBe(true);

    // Costs must be segregated, not merged or swapped
    const costs = parsed.runs.map((r) => r.costUsd).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(costs[0]).toBeCloseTo(0.80, 4); // archived row: 1M * $0.8/MTok
    expect(costs[1]).toBeCloseTo(1.60, 4); // active row: 2M * $0.8/MTok

    // Total must equal sum (no double-counting)
    expect(parsed.summary.costUsdTotal).toBeCloseTo(0.80 + 1.60, 4);
  });
});

// ---------------------------------------------------------------------------
// TC-CROSS-002: legacy invocations (no jobId) stay within their own dir
// ---------------------------------------------------------------------------

describe("TC-CROSS-002: legacy (no-jobId) invocations do not cross-contaminate", () => {
  let tmpDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-stats-cross-002-"));
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("each row accumulates only its own dir's legacy invocations; total = sum", async () => {
    const ARCHIVED_JOB_ID = "cccccccc-0000-0000-0000-000000000003";
    const ACTIVE_JOB_ID = "dddddddd-0000-0000-0000-000000000004";

    // Archive: legacy invocation (no jobId), 1M input → $0.80
    await createArchiveFixture(tmpDir, "bar", {
      jobId: ARCHIVED_JOB_ID,
      date: "2026-05-01",
      invocations: [{ inputTokens: 1_000_000 }], // no jobId = legacy
    });

    // Active: legacy invocation (no jobId), 2M input → $1.60
    await createActiveFixture(tmpDir, "bar", {
      jobId: ACTIVE_JOB_ID,
      date: "2026-06-01",
      invocations: [{ inputTokens: 2_000_000 }], // no jobId = legacy
    });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    expect(exitCode).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const parsed = JSON.parse(output) as {
      runs: Array<{ slug: string; costUsd: number | null }>;
      summary: { costUsdTotal: number | null };
    };

    expect(parsed.runs).toHaveLength(2);

    // Each row should only see its own dir's legacy invocations
    const costs = parsed.runs.map((r) => r.costUsd).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(costs[0]).toBeCloseTo(0.80, 4); // archived dir: 1M tokens
    expect(costs[1]).toBeCloseTo(1.60, 4); // active dir: 2M tokens

    // Total = sum, not doubled (no cross-contamination)
    expect(parsed.summary.costUsdTotal).toBeCloseTo(0.80 + 1.60, 4);
  });
});

// ---------------------------------------------------------------------------
// TC-CROSS-003: usage.json absent → costUsd null, row not dropped
// ---------------------------------------------------------------------------

describe("TC-CROSS-003: missing usage.json → costUsd null, row retained", () => {
  let tmpDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-stats-cross-003-"));
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("row with no usage.json has null costUsd and is present in output", async () => {
    const BAZ_JOB_ID = "eeeeeeee-0000-0000-0000-000000000005";

    // Active fixture without usage.json
    await createActiveFixture(tmpDir, "baz", {
      jobId: BAZ_JOB_ID,
      date: "2026-06-01",
      withUsage: false,
    });

    const { runJobStats } = await import("../../../../src/core/command/job-stats.js");
    const exitCode = await runJobStats({ cwd: tmpDir, json: true });

    expect(exitCode).toBe(0);
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const parsed = JSON.parse(output) as {
      runs: Array<{ slug: string; costUsd: number | null }>;
      summary: { runCount: number };
    };

    // Row must be present (not dropped)
    const bazRun = parsed.runs.find((r) => r.slug === "baz");
    expect(bazRun).toBeDefined();

    // costUsd must be null (not 0, not missing)
    expect(bazRun!.costUsd).toBeNull();

    // runCount reflects the row
    expect(parsed.summary.runCount).toBeGreaterThanOrEqual(1);
  });
});
