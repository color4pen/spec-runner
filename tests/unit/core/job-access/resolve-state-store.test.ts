/**
 * Unit tests for resolveStateStoreByJobId.
 *
 * TC-021: sidecar kind=local + worktree state.json present → worktree slug store returned
 * TC-024: sidecar kind=managed → jobId-based store returned
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveStateStoreByJobId } from "../../../../src/core/job-access/resolve-state-store.js";
import { getJobStateJsonPath } from "../../../../src/util/xdg.js";
import { livenessJsonPath, managedMarkerPath, slugStateJsonPath } from "../../../../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-state-store-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Write a minimal slug-mode state.json + events.jsonl at
 * {root}/specrunner/changes/{slug}/.
 */
async function writeSlugState(root: string, slug: string, jobId: string): Promise<void> {
  const changeDir = path.join(root, "specrunner", "changes", slug);
  await fs.mkdir(changeDir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { title: "Test", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
    step: "design",
    status: "awaiting-resume",
    branch: `change/${slug}`,
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };
  await fs.writeFile(path.join(changeDir, "state.json"), JSON.stringify(stateJson), "utf-8");
  await fs.writeFile(path.join(changeDir, "events.jsonl"), "", "utf-8");
}

/**
 * Write a liveness sidecar → kind=local entry.
 */
async function writeLivenessSidecar(
  repoRoot: string,
  slug: string,
  jobId: string,
  worktreePath: string | null,
): Promise<void> {
  const sidecarAbsPath = path.join(repoRoot, livenessJsonPath(slug));
  await fs.mkdir(path.dirname(sidecarAbsPath), { recursive: true });
  await fs.writeFile(
    sidecarAbsPath,
    JSON.stringify({ pid: 99999, session: null, worktreePath, jobId }),
    "utf-8",
  );
}

/**
 * Write a managed marker → kind=managed entry.
 */
async function writeManagedMarker(
  repoRoot: string,
  slug: string,
  jobId: string,
): Promise<void> {
  const markerAbsPath = path.join(repoRoot, managedMarkerPath(slug));
  await fs.mkdir(path.dirname(markerAbsPath), { recursive: true });
  await fs.writeFile(markerAbsPath, JSON.stringify({ jobId }), "utf-8");
}

// ---------------------------------------------------------------------------
// TC-021: kind=local + worktree state.json present → worktree slug store
// ---------------------------------------------------------------------------

describe("TC-021: resolveStateStoreByJobId — kind=local + worktree present → worktree slug store", () => {
  it("returns a slug store rooted at the worktree path", async () => {
    const slug = "my-feature";
    const jobId = "aaaa0001-0000-0000-0000-000000000001";

    // Create a worktree directory with slug state.json
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId.slice(0, 8)}`);
    await writeSlugState(worktreePath, slug, jobId);

    // Write liveness sidecar pointing to that worktree
    await writeLivenessSidecar(tempDir, slug, jobId, worktreePath);

    const store = await resolveStateStoreByJobId(tempDir, jobId);

    // Store must be non-null
    expect(store).not.toBeNull();

    // The store must read the slug-state from the worktree (load should succeed and return correct jobId)
    const state = await store!.load();
    expect(state.jobId).toBe(jobId);

    // No jobs-dir entry should have been created
    const jobsDirEntry = getJobStateJsonPath(tempDir, jobId);
    await expect(fs.access(jobsDirEntry)).rejects.toThrow();
  });

  it("returns a store that persists to the worktree slug path (not jobs-dir)", async () => {
    const slug = "persist-check";
    const jobId = "aaaa0002-0000-0000-0000-000000000002";

    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId.slice(0, 8)}`);
    await writeSlugState(worktreePath, slug, jobId);
    await writeLivenessSidecar(tempDir, slug, jobId, worktreePath);

    const store = await resolveStateStoreByJobId(tempDir, jobId);
    expect(store).not.toBeNull();

    // Load → mutate → persist via the returned store
    const current = await store!.load();
    await store!.persist({ ...current, status: "awaiting-resume" });

    // Verify the write landed in the worktree slug path
    const slugStatePath = path.join(worktreePath, slugStateJsonPath(slug));
    const raw = await fs.readFile(slugStatePath, "utf-8");
    const written = JSON.parse(raw) as { status: string };
    expect(written.status).toBe("awaiting-resume");

    // Verify no jobs-dir entry was created
    await expect(fs.access(getJobStateJsonPath(tempDir, jobId))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-024: kind=managed → .specrunner/local/<slug>/ store returned (D4)
// ---------------------------------------------------------------------------

describe("TC-024: resolveStateStoreByJobId — kind=managed → local/slug store", () => {
  it("returns a non-null store that persists to .specrunner/local/<slug>/", async () => {
    const slug = "managed-job";
    const jobId = "bbbb0001-0000-0000-0000-000000000001";

    // Write managed marker (kind=managed, no liveness.json)
    await writeManagedMarker(tempDir, slug, jobId);

    const store = await resolveStateStoreByJobId(tempDir, jobId);

    // Managed store must be non-null
    expect(store).not.toBeNull();

    // Persist a minimal state via the returned store
    const minimalState = {
      version: 1 as const,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: null },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "design" as import("../../../../src/state/schema.js").StepName,
      status: "awaiting-resume" as const,
      branch: null,
      history: [],
      error: null,
      pipelineId: "standard",
    };
    await store!.persist(minimalState);

    // Verify the write landed in .specrunner/local/<slug>/ (not jobs-dir)
    const localSlugDir = path.join(tempDir, ".specrunner", "local", slug);
    const jobStateFile = path.join(localSlugDir, "state.json");
    const raw = await fs.readFile(jobStateFile, "utf-8");
    const written = JSON.parse(raw) as { jobId: string; status: string };
    expect(written.jobId).toBe(jobId);
    expect(written.status).toBe("awaiting-resume");

    // Verify no jobs-dir entry was created
    await expect(fs.access(getJobStateJsonPath(tempDir, jobId))).rejects.toThrow();
  });
});
