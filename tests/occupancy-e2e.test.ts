/**
 * Integration / E2E test for slug occupancy enforcement.
 *
 * TC-051: full loop — halt → refused start → cancel → successful start
 *   (request.md 受け入れ基準; spec.md > Scenario: end-to-end occupancy scenario; tasks.md > T-11)
 *
 * Scenario:
 *   1. A job for slug S reaches status awaiting-resume (halt) with its liveness sidecar written.
 *   2. `assertSlugUnoccupied(repoRoot, "S")` is called → refuses with SLUG_OCCUPIED.
 *      No new state file, worktree, or liveness sidecar is created.
 *   3. The prior halted job is canceled via cancelSingleJob.
 *      The prior job's own-jobId sidecar is deleted.
 *   4. `assertSlugUnoccupied(repoRoot, "S")` is called again → no error; the guard passes.
 *
 * This test will be RED until assertSlugUnoccupied is implemented in
 * src/core/occupancy/guard.ts and cancelSingleJob's sidecar teardown is
 * jobId-scoped (T-04, T-05).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { assertSlugUnoccupied } from "../src/core/occupancy/guard.js";
import { cancelSingleJob } from "../src/core/cancel/runner.js";
import type { CancelDeps } from "../src/core/cancel/runner.js";
import { buildInitialJobState } from "../src/store/job-state-store.js";
import { SpecRunnerError, ERROR_CODES } from "../src/errors.js";
import { livenessJsonPath } from "../src/util/paths.js";
import type { WorktreeManager } from "../src/core/worktree/manager.js";
import type { SpawnResult } from "../src/util/spawn.js";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-occupancy-e2e-"));
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

async function writeJobState(opts: {
  slug: string;
  status: string;
  jobId?: string;
}): Promise<string> {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });
  const jobId = opts.jobId ?? state.jobId;
  const slugDir = path.join(tempDir, "specrunner", "changes", opts.slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId,
      createdAt: state.createdAt,
      updatedAt: new Date().toISOString(),
      request: { path: "/test/request.md", title: "Test", type: "new-feature", slug: opts.slug },
      repository: state.repository,
      session: null,
      step: "implementer",
      status: opts.status,
      pid: null,
      branch: null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    }),
  );
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "");
  return jobId;
}

async function writeLivenessSidecar(slug: string, jobId: string, pid?: number | null): Promise<void> {
  const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(livenessDir, { recursive: true });
  await fs.writeFile(
    path.join(livenessDir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath: null, pid: pid ?? null }),
  );
}

function makeCancelDeps(): CancelDeps {
  const spawnOk: (cmd: string, args: string[]) => Promise<SpawnResult> = vi.fn().mockResolvedValue({
    exitCode: 0,
    stdout: "",
    stderr: "",
  });
  const worktreeManager: WorktreeManager = {
    create: vi.fn().mockResolvedValue("/fake/worktree"),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
  return {
    spawn: spawnOk as CancelDeps["spawn"],
    worktreeManager,
    sleep: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(false),
    repoRoot: tempDir,
  };
}

// ---------------------------------------------------------------------------
// TC-051: full loop — halt → refused start → cancel → successful start
// ---------------------------------------------------------------------------

describe("TC-051: full occupancy enforcement loop", () => {
  it("step 1→2: assertSlugUnoccupied throws SLUG_OCCUPIED when slug has awaiting-resume job", async () => {
    const SLUG = "e2e-tc051";
    const jobId = await writeJobState({ slug: SLUG, status: "awaiting-resume" });
    await writeLivenessSidecar(SLUG, jobId);

    await expect(assertSlugUnoccupied(tempDir, SLUG)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("step 1→2: thrown error code is SLUG_OCCUPIED", async () => {
    const SLUG = "e2e-tc051b";
    const jobId = await writeJobState({ slug: SLUG, status: "awaiting-resume" });
    await writeLivenessSidecar(SLUG, jobId);

    try {
      await assertSlugUnoccupied(tempDir, SLUG);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED ?? "SLUG_OCCUPIED");
    }
  });

  it("step 3: cancelSingleJob deletes the prior job's own liveness sidecar", async () => {
    const SLUG = "e2e-tc051c";
    const jobId = await writeJobState({ slug: SLUG, status: "awaiting-resume" });
    await writeLivenessSidecar(SLUG, jobId);

    const deps = makeCancelDeps();
    await cancelSingleJob({ jobId, force: true, purge: false, deps });

    const sidecarPath = path.join(tempDir, livenessJsonPath(SLUG));
    await expect(fs.access(sidecarPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("step 4: assertSlugUnoccupied passes after the prior job is canceled", async () => {
    const SLUG = "e2e-tc051d";
    const jobId = await writeJobState({ slug: SLUG, status: "awaiting-resume" });
    await writeLivenessSidecar(SLUG, jobId);

    // Step 2: guard refuses
    await expect(assertSlugUnoccupied(tempDir, SLUG)).rejects.toBeInstanceOf(SpecRunnerError);

    // Step 3: cancel the prior job
    const deps = makeCancelDeps();
    await cancelSingleJob({ jobId, force: true, purge: false, deps });

    // Step 4: guard now allows a new start
    await expect(assertSlugUnoccupied(tempDir, SLUG)).resolves.not.toThrow();
  });

  it("full loop: no new state file created after refused start", async () => {
    const SLUG = "e2e-tc051e";
    const jobId = await writeJobState({ slug: SLUG, status: "awaiting-resume" });
    await writeLivenessSidecar(SLUG, jobId);

    // Attempt to assert (simulates start guard)
    let guardError: Error | null = null;
    try {
      await assertSlugUnoccupied(tempDir, SLUG);
    } catch (err) {
      guardError = err as Error;
    }

    // The guard should have thrown (refused the start)
    expect(guardError).toBeInstanceOf(SpecRunnerError);

    // Only one state file should exist (the prior one, unchanged)
    const stateFiles = await fs.readdir(path.join(tempDir, "specrunner", "changes", SLUG));
    const stateJsonCount = stateFiles.filter((f) => f === "state.json").length;
    expect(stateJsonCount).toBe(1);

    // The original state file should still be awaiting-resume (not modified by refused start)
    const stateRaw = await fs.readFile(
      path.join(tempDir, "specrunner", "changes", SLUG, "state.json"),
      "utf-8",
    );
    const stateObj = JSON.parse(stateRaw) as { status: string };
    expect(stateObj.status).toBe("awaiting-resume");
  });
});
