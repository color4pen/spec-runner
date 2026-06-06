/**
 * Tests for src/core/job-access/load-by-job-id.ts
 *
 * TC-021: active local job — loads from worktree slug dir
 * TC-022: archived local job — loads from changes/archive/ slug dir
 * TC-023: managed job — loads from jobs-dir (preserved)
 * TC-024: sidecar absent — falls back to jobs-dir readFile
 * TC-025: loadStateByJobId is read-only (no persist)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { loadStateByJobId } from "../src/core/job-access/load-by-job-id.js";
import { SpecRunnerError, ERROR_CODES } from "../src/errors.js";

// Wrap fs.writeFile in vi.fn() so we can verify it is not called during read-only operations.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile.bind(actual)),
  };
});

import * as fs from "node:fs/promises";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-load-by-jobid-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.mocked(fs.writeFile).mockClear();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Write a minimal slug state.json to the given directory.
 */
async function writeSlugState(dir: string, jobId: string, status: string, slug: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "init",
    status,
    branch: `change/${slug}`,
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(stateJson));
  await fs.writeFile(path.join(dir, "events.jsonl"), "");
}

/**
 * Write liveness.json sidecar for a local job.
 */
async function writeLiveness(slug: string, jobId: string, worktreePath: string | null): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath, pid: 1234 }),
  );
}

/**
 * Write marker.json sidecar for a managed job.
 */
async function writeMarker(slug: string, jobId: string): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "marker.json"),
    JSON.stringify({ slug, jobId, status: "running" }),
  );
}

// TC-021: active local job loads from worktree slug dir
describe("TC-021: active local job loads from worktree slug dir", () => {
  it("returns NormalizedJobState from worktree slug dir", async () => {
    const slug = "my-active-slug";
    const jobId = "aaaa1111-0000-0000-0000-000000000001";
    const worktreePath = path.join(tempDir, "worktrees", slug);

    // Write state to worktree slug dir
    const stateDir = path.join(worktreePath, "specrunner", "changes", slug);
    await writeSlugState(stateDir, jobId, "running", slug);

    // Write sidecar liveness.json
    await writeLiveness(slug, jobId, worktreePath);

    const loaded = await loadStateByJobId(tempDir, jobId);

    expect(loaded.jobId).toBe(jobId);
    expect(loaded.status).toBe("running");
  });
});

// TC-022: archived local job loads from changes/archive/
describe("TC-022: archived local job loads from changes/archive/", () => {
  it("returns NormalizedJobState from archive slug dir", async () => {
    const slug = "my-archived-slug";
    const jobId = "bbbb1111-0000-0000-0000-000000000001";
    const datedSlug = `2026-01-15-${slug}`;

    // Write state to archive dir
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", datedSlug);
    await writeSlugState(archiveDir, jobId, "archived", slug);

    // Write sidecar liveness.json with no worktreePath (worktree was deleted)
    await writeLiveness(slug, jobId, null);

    const loaded = await loadStateByJobId(tempDir, jobId);

    expect(loaded.jobId).toBe(jobId);
    expect(loaded.status).toBe("archived");
  });
});

// TC-023: managed job loads from .specrunner/local/<slug>/ (D4)
describe("TC-023: managed job loads from .specrunner/local/<slug>/", () => {
  it("loads from local/slug split layout for managed jobs", async () => {
    const slug = "my-managed-slug";
    const jobId = "cccc1111-0000-0000-0000-000000000001";

    // Write state to .specrunner/local/<slug>/ (co-located with marker)
    const localSlugDir = path.join(tempDir, ".specrunner", "local", slug);
    await writeSlugState(localSlugDir, jobId, "running", slug);

    // Write managed marker (kind="managed") in the same directory
    await writeMarker(slug, jobId);

    const loaded = await loadStateByJobId(tempDir, jobId);

    expect(loaded.jobId).toBe(jobId);
    expect(loaded.status).toBe("running");
  });
});

// TC-024: sidecar absent → throws JOB_NOT_FOUND
describe("TC-024: sidecar absent → throws JOB_NOT_FOUND", () => {
  it("throws SpecRunnerError(JOB_NOT_FOUND) when no sidecar exists", async () => {
    const jobId = "dddd1111-0000-0000-0000-000000000001";

    // No sidecar — loadStateByJobId must throw JOB_NOT_FOUND
    await expect(loadStateByJobId(tempDir, jobId)).rejects.toThrow(SpecRunnerError);

    try {
      await loadStateByJobId(tempDir, jobId);
    } catch (err: unknown) {
      expect(err instanceof SpecRunnerError).toBe(true);
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.JOB_NOT_FOUND);
    }
  });
});

// TC-025: loadStateByJobId is read-only
describe("TC-025: loadStateByJobId never calls persist", () => {
  it("does not call fs.writeFile during load", async () => {
    const jobId = "ffff1111-0000-0000-0000-000000000001";
    const slug = "readonly-test";
    const worktreePath = path.join(tempDir, "worktrees", slug);
    const stateDir = path.join(worktreePath, "specrunner", "changes", slug);
    await writeSlugState(stateDir, jobId, "running", slug);
    await writeLiveness(slug, jobId, worktreePath);

    // Clear any writeFile calls from setup
    vi.mocked(fs.writeFile).mockClear();

    await loadStateByJobId(tempDir, jobId);

    expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
  });
});
