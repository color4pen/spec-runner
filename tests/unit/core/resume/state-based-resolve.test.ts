/**
 * Unit tests for the updated resolveJobStateBySlug (state-based, not time-based).
 *
 * TC-033: non-terminal job is chosen over a newer terminal job
 *   (spec.md > Requirement: change-scoped slug resolution > Scenario: non-terminal chosen over newer terminal)
 * TC-034: multiple non-terminal jobs stop with candidate enumeration
 *   (spec.md > Requirement: change-scoped slug resolution > Scenario: multiple non-terminal stop)
 * TC-035: zero non-terminal jobs → null returned (tasks.md > T-06)
 * TC-036: CLI callers handle the ambiguous-breach throw gracefully (tasks.md > T-06, should)
 *
 * Source: spec.md, tasks.md > T-06
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveJobStateBySlug } from "../../../../src/core/resume/resolve-job.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-state-resolve-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let jobIdCounter = 0;

async function writeJobState(opts: {
  slug: string;
  status: string;
  updatedAt: string;
  dir?: string; // override directory (default: specrunner/changes/<slug>)
}): Promise<string> {
  const jobId = `test-job-state-${++jobIdCounter}-${Date.now()}`;
  const dir = opts.dir ?? path.join(tempDir, "specrunner", "changes", opts.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: opts.updatedAt,
      request: {
        path: `/specrunner/changes/${opts.slug}/request.md`,
        title: "Test",
        type: "new-feature",
        slug: opts.slug,
      },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "design",
      status: opts.status,
      branch: null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    }),
  );
  await fs.writeFile(path.join(dir, "events.jsonl"), "");
  return jobId;
}

// ---------------------------------------------------------------------------
// TC-033: non-terminal job is chosen over a newer terminal job
// (spec.md Scenario: non-terminal chosen over newer terminal)
// ---------------------------------------------------------------------------

describe("TC-033: non-terminal job is chosen over a newer terminal job", () => {
  it("returns the awaiting-resume job even though the canceled job has a newer updatedAt", async () => {
    const SLUG = "resolve-tc033";

    // Job A: awaiting-resume, older timestamp — the one we want
    const jobIdA = await writeJobState({
      slug: SLUG,
      status: "awaiting-resume",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });

    // Job B: canceled (terminal), NEWER timestamp — should be ignored
    const canceledDir = path.join(tempDir, "specrunner", "changes", "canceled", `${SLUG}-${jobIdA.slice(0, 8)}`);
    const jobIdB = await writeJobState({
      slug: SLUG,
      status: "canceled",
      updatedAt: "2026-01-02T10:00:00.000Z", // newer!
      dir: canceledDir,
    });

    const result = await resolveJobStateBySlug(SLUG, tempDir);

    expect(result).not.toBeNull();
    expect(result!.jobId).toBe(jobIdA);
    expect(result!.status).toBe("awaiting-resume");
    expect(result!.jobId).not.toBe(jobIdB);
  });
});

// ---------------------------------------------------------------------------
// TC-034: multiple non-terminal jobs stop with candidate enumeration
// (spec.md Scenario: multiple non-terminal jobs stop with candidate enumeration)
// ---------------------------------------------------------------------------

describe("TC-034: multiple non-terminal jobs stop with candidate enumeration", () => {
  it("throws SLUG_OCCUPANCY_AMBIGUOUS when there are two non-terminal jobs", async () => {
    const SLUG = "resolve-tc034";

    // Write two non-terminal jobs for the same slug in two different locations
    await writeJobState({
      slug: SLUG,
      status: "running",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });

    const wtDir = path.join(tempDir, ".git", "specrunner-worktrees", "wt1", "specrunner", "changes", SLUG);
    await writeJobState({
      slug: SLUG,
      status: "awaiting-resume",
      updatedAt: "2026-01-02T10:00:00.000Z",
      dir: wtDir,
    });

    await expect(resolveJobStateBySlug(SLUG, tempDir)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("thrown error code is SLUG_OCCUPANCY_AMBIGUOUS", async () => {
    const SLUG = "resolve-tc034b";

    await writeJobState({
      slug: SLUG,
      status: "running",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });

    const wtDir = path.join(tempDir, ".git", "specrunner-worktrees", "wt2", "specrunner", "changes", SLUG);
    await writeJobState({
      slug: SLUG,
      status: "awaiting-resume",
      updatedAt: "2026-01-02T10:00:00.000Z",
      dir: wtDir,
    });

    try {
      await resolveJobStateBySlug(SLUG, tempDir);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS);
    }
  });

  it("error message enumerates both jobIds and statuses", async () => {
    const SLUG = "resolve-tc034c";

    const jobIdA = await writeJobState({
      slug: SLUG,
      status: "running",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });

    const wtDir = path.join(tempDir, ".git", "specrunner-worktrees", "wt3", "specrunner", "changes", SLUG);
    const jobIdB = await writeJobState({
      slug: SLUG,
      status: "awaiting-resume",
      updatedAt: "2026-01-02T10:00:00.000Z",
      dir: wtDir,
    });

    try {
      await resolveJobStateBySlug(SLUG, tempDir);
      expect.fail("should have thrown");
    } catch (err) {
      const msg = (err as SpecRunnerError).message;
      expect(msg).toContain(jobIdA);
      expect(msg).toContain(jobIdB);
    }
  });

  it("error message references specrunner doctor", async () => {
    const SLUG = "resolve-tc034d";

    await writeJobState({
      slug: SLUG,
      status: "failed",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });

    const wtDir = path.join(tempDir, ".git", "specrunner-worktrees", "wt4", "specrunner", "changes", SLUG);
    await writeJobState({
      slug: SLUG,
      status: "terminated",
      updatedAt: "2026-01-02T10:00:00.000Z",
      dir: wtDir,
    });

    try {
      await resolveJobStateBySlug(SLUG, tempDir);
      expect.fail("should have thrown");
    } catch (err) {
      const msg = (err as SpecRunnerError).message;
      expect(msg).toContain("doctor");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-035: zero non-terminal jobs → null returned
// ---------------------------------------------------------------------------

describe("TC-035: zero non-terminal jobs → null returned", () => {
  it("returns null when all jobs are terminal", async () => {
    const SLUG = "resolve-tc035";

    const canceledDir = path.join(tempDir, "specrunner", "changes", "canceled", `${SLUG}-12345678`);
    await writeJobState({
      slug: SLUG,
      status: "canceled",
      updatedAt: "2026-01-01T10:00:00.000Z",
      dir: canceledDir,
    });

    const result = await resolveJobStateBySlug(SLUG, tempDir);
    expect(result).toBeNull();
  });

  it("returns null when slug has no state at all", async () => {
    const result = await resolveJobStateBySlug("nonexistent-slug-tc035", tempDir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-036: CLI callers handle the ambiguous-breach throw gracefully (should)
// ---------------------------------------------------------------------------

describe("TC-036: CLI callers handle the ambiguous-breach throw gracefully", () => {
  it("SLUG_OCCUPANCY_AMBIGUOUS error has a non-zero exit code that callers can use", async () => {
    // Verify the error structure so CLI callers can catch and exit properly
    const SLUG = "resolve-tc036";

    await writeJobState({
      slug: SLUG,
      status: "running",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });

    const wtDir = path.join(tempDir, ".git", "specrunner-worktrees", "wt5", "specrunner", "changes", SLUG);
    await writeJobState({
      slug: SLUG,
      status: "awaiting-resume",
      updatedAt: "2026-01-02T10:00:00.000Z",
      dir: wtDir,
    });

    try {
      await resolveJobStateBySlug(SLUG, tempDir);
      expect.fail("should have thrown");
    } catch (err) {
      // Should be a SpecRunnerError with a non-zero exitCode
      expect(err).toBeInstanceOf(SpecRunnerError);
      expect((err as SpecRunnerError).exitCode).toBeGreaterThan(0);
    }
  });
});
