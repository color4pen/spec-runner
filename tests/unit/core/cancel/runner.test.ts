/**
 * Tests for cancelSingleJob and cancelAllTerminated.
 *
 * cancelSingleJob:
 * - 各 status (running / awaiting-resume / awaiting-merge / failed / terminated / canceled / archived) の動作
 * - awaiting-merge + --force なし → reject
 * - awaiting-merge + --force あり → 成功
 * - archived → reject
 * - canceled → idempotent (state 未変更)
 * - --purge で sidecar 物理削除
 * - running + pid kill 成功 / 失敗
 * - running + state.pid が null → warning + 続行
 * - worktree cleanup の best-effort (失敗時 warning)
 * - branch 削除の best-effort (失敗時 warning)
 * - cancel 後の canceled/<slug>-<jobId8>/state.json に status: canceled, error.code: USER_CANCELED, canceledAt が記録
 *
 * 新規 acceptance テスト（TC-001 ～ TC-007, TC-012, TC-025, TC-026）:
 * - worktree-only ジョブの cancel で canceled/ に記録が残る（記録喪失の回帰防止）
 * - request.md が canceled/ に保全される
 * - 同名 slug を同日に 2 回 cancel しても canceled/ で衝突しない
 * - cancel 後に worktree と local/remote branch が削除される
 * - --purge 時は canceled/ に墓標が作られない
 * - 冪等 canceled 再 cancel で state が不変
 * - canceled/ が存在しても JobStateStore.list が canceled を slug と誤認しない
 *
 * cancelAllTerminated:
 * - failed / terminated / canceled のみ対象
 * - archived は対象外
 * - --yes スキップ
 * - non-TTY + --yes なし → reject
 * - 0 件 → early return
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as nodefs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { cancelSingleJob, cancelAllTerminated } from "../../../../src/core/cancel/runner.js";
import type { CancelDeps } from "../../../../src/core/cancel/runner.js";
import { JobStateStore, buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { JobState, JobStatus } from "../../../../src/state/schema.js";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";
import { buildWorktreePath } from "../../../../src/core/worktree/manager.js";
import type { SpawnResult } from "../../../../src/util/spawn.js";
import { canceledChangeFolderPath, canceledDirName } from "../../../../src/util/paths.js";

// ---------- Test fixtures ----------

let tempDir: string;

beforeEach(async () => {
  tempDir = await nodefs.mkdtemp(path.join(os.tmpdir(), "specrunner-cancel-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await nodefs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Create a job state with a specific status using worktree-only layout:
 *  - state.json / events.jsonl / request.md are written to the worktree change folder
 *    (NOT to main checkout — worktree-only reproduces the real local runtime).
 *  - Liveness sidecar at .specrunner/local/<slug>/liveness.json points to worktreeDir.
 *  - worktreeDir = extras.worktreePath ?? buildWorktreePath(tempDir, slug, jobId)
 *    so that JobStateStore.list finds the job via section 2 (worktrees scan).
 */
async function makeJob(
  status: JobStatus = "failed",
  extras: Partial<{
    pid: number | null | undefined;
    branch: string;
    worktreePath: string;
    slug: string;
  }> = {},
): Promise<{ jobId: string; slug: string; worktreeDir: string }> {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });
  const jobId = state.jobId;
  const slug = extras.slug ?? `cancel-${jobId.slice(0, 8)}`;
  const pid = "pid" in extras ? (extras.pid ?? null) : null;

  // Worktree directory — defaults to buildWorktreePath so JobStateStore.list can find it
  const worktreeDir = extras.worktreePath ?? buildWorktreePath(tempDir, slug, jobId);

  // Write state to worktree change folder (NOT main checkout)
  const slugDir = path.join(worktreeDir, "specrunner", "changes", slug);
  await nodefs.mkdir(slugDir, { recursive: true });
  await nodefs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      request: { path: "/test/request.md", title: "Test", type: "new-feature" },
      repository: state.repository,
      session: null,
      step: "init",
      status,
      pid: pid ?? null,
      branch: extras.branch ?? null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    }),
  );
  await nodefs.writeFile(path.join(slugDir, "events.jsonl"), "");

  // Write request.md to the worktree change folder (evacuation copy target)
  await nodefs.writeFile(path.join(slugDir, "request.md"), `# Test Request for ${slug}\n`);

  // Write liveness sidecar so loadStateByJobId can find the job via worktreePath
  const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
  await nodefs.mkdir(livenessDir, { recursive: true });
  await nodefs.writeFile(
    path.join(livenessDir, "liveness.json"),
    JSON.stringify({
      jobId,
      worktreePath: worktreeDir,
      pid,
    }),
  );

  return { jobId, slug, worktreeDir };
}

/** Build a minimal CancelDeps mock. */
function makeDeps(overrides: Partial<CancelDeps> = {}): CancelDeps {
  const spawnOk: (cmd: string, args: string[]) => Promise<SpawnResult> = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
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
    ...overrides,
  };
}

/**
 * Load the canceled state from canceled/<slug>-<jobId8>/ in the repo root.
 * This is the authoritative post-cancel location.
 */
async function loadCanceledState(jobId: string, slug: string): Promise<JobState> {
  const store = new JobStateStore(jobId, tempDir, {
    changeDir: path.join(tempDir, canceledChangeFolderPath(canceledDirName(slug, jobId))),
  });
  return (await store.load()) as JobState;
}

/**
 * Load state from the worktree change folder (used for idempotent-cancel checks,
 * where no evacuation or persist runs).
 */
async function loadWorktreeState(jobId: string, slug: string, worktreeDir: string): Promise<JobState> {
  const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: worktreeDir });
  return (await store.load()) as JobState;
}

/**
 * Return true when the sidecar directory for a job is absent.
 * cancelSingleJob --purge / cancelAllTerminated delete .specrunner/local/<slug>/.
 */
async function sidecarAbsent(slug: string): Promise<boolean> {
  const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
  try {
    await nodefs.access(sidecarDir);
    return false; // exists
  } catch {
    return true; // ENOENT
  }
}

// ---------------------------------------------------------------------------
// cancelSingleJob — status dispatch
// ---------------------------------------------------------------------------

describe("cancelSingleJob — archived status", () => {
  it("rejects with exit 1 and message", async () => {
    const { jobId } = await makeJob("archived");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/archived/i);
  });

  it("does NOT delete sidecar", async () => {
    const { jobId, slug } = await makeJob("archived");
    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });
    expect(await sidecarAbsent(slug)).toBe(false);
  });
});

describe("cancelSingleJob — awaiting-merge status", () => {
  it("rejects without --force", async () => {
    const { jobId } = await makeJob("awaiting-archive");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/--force/);
  });

  it("succeeds with --force", async () => {
    const { jobId, slug } = await makeJob("awaiting-archive");
    const result = await cancelSingleJob({ jobId, force: true, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();
  });
});

describe("cancelSingleJob — running status", () => {
  it("kills pid and transitions to canceled", async () => {
    const { jobId, slug } = await makeJob("running", { pid: 1234 });
    const kill = vi.fn();
    const isAlive = vi.fn().mockReturnValue(false);
    const deps = makeDeps({ kill, isAlive });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");

    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();
  });

  it("continues with warning when pid is null", async () => {
    const { jobId } = await makeJob("running", { pid: null });
    const deps = makeDeps();

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("no PID recorded")]),
    );
  });

  it("continues with warning when kill fails (EPERM)", async () => {
    const { jobId } = await makeJob("running", { pid: 9999 });
    const err = new Error("EPERM") as NodeJS.ErrnoException;
    err.code = "EPERM";
    const kill = vi.fn().mockImplementation(() => { throw err; });
    const deps = makeDeps({ kill });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("EPERM")]),
    );
  });
});

describe("cancelSingleJob — awaiting-resume status", () => {
  it("transitions to canceled", async () => {
    const { jobId, slug } = await makeJob("awaiting-resume");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();
  });
});

describe("cancelSingleJob — failed status", () => {
  it("transitions to canceled", async () => {
    const { jobId, slug } = await makeJob("failed");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();
  });
});

describe("cancelSingleJob — terminated status", () => {
  it("transitions to canceled", async () => {
    const { jobId, slug } = await makeJob("terminated");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();
  });
});

describe("cancelSingleJob — canceled status (idempotent)", () => {
  it("succeeds without changing state", async () => {
    const { jobId, slug, worktreeDir } = await makeJob("canceled");

    // Record the state before
    const stateBefore = await loadWorktreeState(jobId, slug, worktreeDir);

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    // Status should still be canceled (not modified — worktreeManager.remove is mocked, dir persists)
    const stateAfter = await loadWorktreeState(jobId, slug, worktreeDir);
    expect(stateAfter.status).toBe("canceled");
    // updatedAt should NOT change (no write happened)
    expect(stateAfter.updatedAt).toBe(stateBefore.updatedAt);
  });

  it("deletes sidecar with --purge even for idempotent case", async () => {
    const { jobId, slug } = await makeJob("canceled");
    await cancelSingleJob({ jobId, force: false, purge: true, deps: makeDeps() });

    expect(await sidecarAbsent(slug)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — state file content after cancel
// ---------------------------------------------------------------------------

describe("cancelSingleJob — state file content", () => {
  it("records status=canceled, error.code=USER_CANCELED, canceledAt in canceled/ dir", async () => {
    const { jobId, slug } = await makeJob("failed");
    const before = new Date();

    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();

    const canceledAt = new Date(state.canceledAt!);
    expect(canceledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — --purge
// ---------------------------------------------------------------------------

describe("cancelSingleJob — --purge flag", () => {
  it("deletes sidecar after cancel", async () => {
    const { jobId, slug } = await makeJob("failed");
    await cancelSingleJob({ jobId, force: false, purge: true, deps: makeDeps() });

    expect(await sidecarAbsent(slug)).toBe(true);
  });

  it("still performs cleanup before deletion", async () => {
    const { jobId } = await makeJob("failed", { branch: "change/my-branch-abc123" });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const deps = makeDeps({ spawn: spawnFn });

    await cancelSingleJob({ jobId, force: false, purge: true, deps });

    // Branch deletion was attempted
    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["branch", "-D", "change/my-branch-abc123"]),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — cleanup best-effort
// ---------------------------------------------------------------------------

describe("cancelSingleJob — cleanup best-effort", () => {
  it("emits warning when worktree removal fails", async () => {
    const { jobId } = await makeJob("failed");
    const worktreeManager: WorktreeManager = {
      create: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error("git failed")),
      prune: vi.fn().mockResolvedValue(undefined),
    };
    const deps = makeDeps({ worktreeManager });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("failed to remove worktree")]),
    );
  });

  it("emits warning when local branch deletion fails", async () => {
    const { jobId } = await makeJob("failed", { branch: "change/my-slug-abc123" });
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "branch not found" });
    const deps = makeDeps({ spawn: spawnFn });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("failed to delete local branch")]),
    );
  });

  it("emits warning when remote branch deletion fails", async () => {
    const { jobId } = await makeJob("failed", { branch: "change/my-slug-abc123" });
    let callCount = 0;
    const spawnFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        // 2nd call = remote push --delete
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "remote branch not found" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    const deps = makeDeps({ spawn: spawnFn });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("failed to delete remote branch")]),
    );
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — non-existent job
// ---------------------------------------------------------------------------

describe("cancelSingleJob — job not found", () => {
  it("returns exit 1 with message", async () => {
    const result = await cancelSingleJob({
      jobId: "nonexistent-uuid-0000",
      force: false,
      purge: false,
      deps: makeDeps(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — sidecar jobId typeof guard (T2.2)
// ---------------------------------------------------------------------------

describe("cancelSingleJob — sidecar jobId is a non-string (numeric)", () => {
  it("falls through to convention path without throwing when sidecar jobId is a number", async () => {
    // Write a job with a worktreePath in the liveness sidecar, but jobId as a number
    const state = {
      version: 1,
      jobId: "numeric-sidecar-jobid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/test/request.md", title: "Test", type: "new-feature", slug: "numeric-sidecar-test" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "init",
      status: "failed",
      pid: null,
      branch: null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    };
    const slug = "numeric-sidecar-test";

    // Write slug canonical state (accessible via resolveCanonicalStateDir fallback)
    const slugDir = path.join(tempDir, "specrunner", "changes", slug);
    await nodefs.mkdir(slugDir, { recursive: true });
    await nodefs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(state));
    await nodefs.writeFile(path.join(slugDir, "events.jsonl"), "");

    // Write liveness sidecar with jobId as a number (not string) — skipped by listLocalSidecars
    const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
    await nodefs.mkdir(livenessDir, { recursive: true });
    await nodefs.writeFile(
      path.join(livenessDir, "liveness.json"),
      JSON.stringify({
        jobId: 12345, // number, not string
        worktreePath: "/some/worktree/that/does/not/exist",
        pid: null,
      }),
    );

    const deps = makeDeps();
    // Should not throw — sidecar is skipped (numeric jobId), cancel returns "not found"
    const result = await cancelSingleJob({
      jobId: "numeric-sidecar-jobid",
      force: false,
      purge: false,
      deps,
    });

    // Best-effort completes (either success or clean failure, not an exception)
    expect(result).toBeDefined();
    // The sidecar worktreePath was NOT used (guard filtered it)
    // worktreeManager.remove may have been called with convention path, not /some/worktree/...
    const removeCalls = (deps.worktreeManager.remove as ReturnType<typeof vi.fn>).mock.calls;
    const usedSidecarPath = removeCalls.some(
      (args: unknown[]) => args[0] === "/some/worktree/that/does/not/exist",
    );
    expect(usedSidecarPath).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — --restore-draft flag
// ---------------------------------------------------------------------------

describe("cancelSingleJob — --restore-draft flag", () => {
  it("writes drafts/<slug>/request.md and returns info entry when restoreDraft: true", async () => {
    const worktreePath = path.join(tempDir, "wt");
    const { jobId, slug } = await makeJob("failed", { worktreePath });

    // Overwrite request.md content for this test
    const sourceDir = path.join(worktreePath, "specrunner", "changes", slug);
    await nodefs.mkdir(sourceDir, { recursive: true });
    await nodefs.writeFile(path.join(sourceDir, "request.md"), "# Test Request\n");

    const result = await cancelSingleJob({ jobId, force: false, purge: false, restoreDraft: true, deps: makeDeps() });

    expect(result.exitCode).toBe(0);
    expect(result.info).toEqual(expect.arrayContaining([expect.stringContaining("Restored draft")]));

    const draftContent = await nodefs.readFile(
      path.join(tempDir, "specrunner", "drafts", slug, "request.md"),
      "utf-8",
    );
    expect(draftContent).toBe("# Test Request\n");
  });

  it("does NOT write draft when restoreDraft: false", async () => {
    const worktreePath = path.join(tempDir, "wt");
    const { jobId, slug } = await makeJob("failed", { worktreePath });

    await cancelSingleJob({ jobId, force: false, purge: false, restoreDraft: false, deps: makeDeps() });

    const draftFilePath = path.join(tempDir, "specrunner", "drafts", slug, "request.md");
    await expect(nodefs.access(draftFilePath)).rejects.toThrow();
  });

  it("does NOT write draft when restoreDraft is omitted (default)", async () => {
    const worktreePath = path.join(tempDir, "wt");
    const { jobId, slug } = await makeJob("failed", { worktreePath });

    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    const draftFilePath = path.join(tempDir, "specrunner", "drafts", slug, "request.md");
    await expect(nodefs.access(draftFilePath)).rejects.toThrow();
  });

  it("does not overwrite existing draft and returns warning", async () => {
    const worktreePath = path.join(tempDir, "wt");
    const { jobId, slug } = await makeJob("failed", { worktreePath });

    // Overwrite request.md in worktree
    const sourceDir = path.join(worktreePath, "specrunner", "changes", slug);
    await nodefs.mkdir(sourceDir, { recursive: true });
    await nodefs.writeFile(path.join(sourceDir, "request.md"), "# New Content\n");

    // Pre-create existing draft
    const draftDir = path.join(tempDir, "specrunner", "drafts", slug);
    await nodefs.mkdir(draftDir, { recursive: true });
    await nodefs.writeFile(path.join(draftDir, "request.md"), "# Existing Content\n");

    const result = await cancelSingleJob({ jobId, force: false, purge: false, restoreDraft: true, deps: makeDeps() });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("draft already exists")]),
    );

    // Verify not overwritten
    const content = await nodefs.readFile(path.join(draftDir, "request.md"), "utf-8");
    expect(content).toBe("# Existing Content\n");
  });

  it("returns warning and skips when source request.md is missing", async () => {
    const worktreePath = path.join(tempDir, "wt");
    const { jobId, slug } = await makeJob("failed", { worktreePath });

    // Remove request.md that makeJob wrote (simulate missing)
    const sourceDir = path.join(worktreePath, "specrunner", "changes", slug);
    await nodefs.rm(path.join(sourceDir, "request.md"), { force: true });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, restoreDraft: true, deps: makeDeps() });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("no request.md to restore")]),
    );

    const draftFilePath = path.join(tempDir, "specrunner", "drafts", slug, "request.md");
    await expect(nodefs.access(draftFilePath)).rejects.toThrow();
  });

  it("restore happens before worktree removal (draft written even though remove is called)", async () => {
    const worktreePath = path.join(tempDir, "wt");
    const { jobId, slug } = await makeJob("failed", { worktreePath });

    // Overwrite with specific content for this test
    const sourceDir = path.join(worktreePath, "specrunner", "changes", slug);
    await nodefs.writeFile(path.join(sourceDir, "request.md"), "# Ordering Test\n");

    const worktreeManager: WorktreeManager = {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    const result = await cancelSingleJob({
      jobId, force: false, purge: false, restoreDraft: true,
      deps: makeDeps({ worktreeManager }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.info).toEqual(expect.arrayContaining([expect.stringContaining("Restored draft")]));
    // worktreeManager.remove was also called (cleanup ran after restore)
    expect(worktreeManager.remove).toHaveBeenCalled();

    const content = await nodefs.readFile(
      path.join(tempDir, "specrunner", "drafts", slug, "request.md"),
      "utf-8",
    );
    expect(content).toBe("# Ordering Test\n");
  });
});

// ---------------------------------------------------------------------------
// TC-001 / TC-003: Record loss regression prevention
// Worktree-only ジョブを cancel すると、worktree 撤去後も canceled/ に記録が残る
// ---------------------------------------------------------------------------

describe("cancelSingleJob — TC-001/TC-003: record loss regression prevention", () => {
  it("persists USER_CANCELED/canceledAt to canceled/ even after worktree directory is removed", async () => {
    const { jobId, slug } = await makeJob("failed");
    const before = new Date();

    // worktreeManager.remove actually deletes the worktree directory to reproduce the bug
    const worktreeManager: WorktreeManager = {
      create: vi.fn(),
      remove: vi.fn().mockImplementation(async (wtPath: string) => {
        await nodefs.rm(wtPath, { recursive: true, force: true });
      }),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    await cancelSingleJob({
      jobId, force: false, purge: false,
      deps: makeDeps({ worktreeManager }),
    });

    // Worktree is gone — canceled/ state must survive
    const state = await loadCanceledState(jobId, slug);
    expect(state.status).toBe("canceled");
    expect(state.error?.code).toBe("USER_CANCELED");
    expect(state.canceledAt).toBeDefined();
    const canceledAt = new Date(state.canceledAt!);
    expect(canceledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("TC-022: makeJob does NOT write canonical state.json to main checkout (worktree-only)", async () => {
    const { jobId: _jid, slug } = await makeJob("failed");
    const canonicalStatePath = path.join(tempDir, "specrunner", "changes", slug, "state.json");
    await expect(nodefs.access(canonicalStatePath)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-002: request.md is preserved in canceled/
// ---------------------------------------------------------------------------

describe("cancelSingleJob — TC-002: request.md preserved in canceled/", () => {
  it("request.md is present in canceled/<slug>-<jobId8>/ after cancel", async () => {
    const { jobId, slug } = await makeJob("failed");
    const expectedContent = `# Test Request for ${slug}\n`;

    // Actual worktree removal to simulate real scenario
    const worktreeManager: WorktreeManager = {
      create: vi.fn(),
      remove: vi.fn().mockImplementation(async (wtPath: string) => {
        await nodefs.rm(wtPath, { recursive: true, force: true });
      }),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    await cancelSingleJob({
      jobId, force: false, purge: false,
      deps: makeDeps({ worktreeManager }),
    });

    const canceledDir = path.join(tempDir, canceledChangeFolderPath(canceledDirName(slug, jobId)));
    const requestMdContent = await nodefs.readFile(path.join(canceledDir, "request.md"), "utf-8");
    expect(requestMdContent).toBe(expectedContent);
  });
});

// ---------------------------------------------------------------------------
// TC-004: Same-slug cancels do NOT collide in canceled/
// ---------------------------------------------------------------------------

describe("cancelSingleJob — TC-004: same-slug no collision", () => {
  it("two jobs with same slug produce separate canceled/ dirs", async () => {
    const sharedSlug = "shared-slug";

    // Cancel jobIdA first (liveness sidecar → jobIdA), THEN create jobIdB.
    // This avoids the second makeJob overwriting the liveness sidecar before jobIdA is canceled.
    const { jobId: jobIdA } = await makeJob("failed", { slug: sharedSlug });
    await cancelSingleJob({ jobId: jobIdA, force: false, purge: false, deps: makeDeps() });

    // Now create jobIdB with the same slug (overwrites sidecar with jobIdB)
    const { jobId: jobIdB } = await makeJob("failed", { slug: sharedSlug });
    await cancelSingleJob({ jobId: jobIdB, force: false, purge: false, deps: makeDeps() });

    const canceledDirA = path.join(tempDir, canceledChangeFolderPath(canceledDirName(sharedSlug, jobIdA)));
    const canceledDirB = path.join(tempDir, canceledChangeFolderPath(canceledDirName(sharedSlug, jobIdB)));

    // Both dirs exist and are distinct
    await expect(nodefs.access(canceledDirA)).resolves.toBeUndefined();
    await expect(nodefs.access(canceledDirB)).resolves.toBeUndefined();
    expect(canceledDirA).not.toBe(canceledDirB);

    // Each records its own jobId
    const stateA = await loadCanceledState(jobIdA, sharedSlug);
    const stateB = await loadCanceledState(jobIdB, sharedSlug);
    expect(stateA.jobId).toBe(jobIdA);
    expect(stateB.jobId).toBe(jobIdB);
  });
});

// ---------------------------------------------------------------------------
// TC-005: cancel maintains cleanup (worktree + branches deleted)
// ---------------------------------------------------------------------------

describe("cancelSingleJob — TC-005: cleanup maintained", () => {
  it("calls worktreeManager.remove and branch deletion spawn commands", async () => {
    const { jobId } = await makeJob("failed", { branch: "change/test-slug-abc12345" });
    const worktreeManager: WorktreeManager = {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };
    const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await cancelSingleJob({
      jobId, force: false, purge: false,
      deps: makeDeps({ worktreeManager, spawn: spawnFn }),
    });

    expect(worktreeManager.remove).toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["branch", "-D", "change/test-slug-abc12345"]),
      expect.anything(),
    );
    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["push", "origin", "--delete", "change/test-slug-abc12345"]),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-006: --purge leaves no gravestone in canceled/
// ---------------------------------------------------------------------------

describe("cancelSingleJob — TC-006: --purge no gravestone", () => {
  it("does NOT create canceled/ dir when --purge is set", async () => {
    const { jobId, slug } = await makeJob("failed");

    await cancelSingleJob({ jobId, force: false, purge: true, deps: makeDeps() });

    const canceledDir = path.join(tempDir, canceledChangeFolderPath(canceledDirName(slug, jobId)));
    await expect(nodefs.access(canceledDir)).rejects.toThrow();
  });

  it("--purge still deletes sidecar", async () => {
    const { jobId, slug } = await makeJob("failed");
    await cancelSingleJob({ jobId, force: false, purge: true, deps: makeDeps() });
    expect(await sidecarAbsent(slug)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-007: already-canceled job remains idempotent (no new canceled/ dir, state unchanged)
// ---------------------------------------------------------------------------

describe("cancelSingleJob — TC-007: idempotent already-canceled", () => {
  it("does not create a new canceled/ dir for already-canceled job", async () => {
    const { jobId, slug } = await makeJob("canceled");

    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    const canceledDir = path.join(tempDir, canceledChangeFolderPath(canceledDirName(slug, jobId)));
    await expect(nodefs.access(canceledDir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-012: canceled/ exists but JobStateStore.list skips it (does not scan it as a slug)
// ---------------------------------------------------------------------------

describe("TC-012: JobStateStore.list skips canceled/ subdirectory", () => {
  it("does not scan canceled/ as a slug dir, completes without error", async () => {
    // Create a canceled/ dir in main checkout (simulating real gravestone)
    const canceledDirPath = path.join(tempDir, "specrunner", "changes", "canceled", "some-slug-12345678");
    await nodefs.mkdir(canceledDirPath, { recursive: true });
    // Do NOT write a state.json — canceled/ subdirs are not slug dirs

    // Also create a real job via worktree so list has something valid to return
    const { slug: validSlug } = await makeJob("failed");
    void validSlug;

    // list should complete without throwing
    let result: Awaited<ReturnType<typeof JobStateStore.list>> | undefined;
    await expect(async () => {
      result = await JobStateStore.list(tempDir);
    }).not.toThrow();

    // "canceled" should not appear as a slug in the results
    const slugsFound = result?.map((s) => s.request?.slug).filter(Boolean) ?? [];
    expect(slugsFound).not.toContain("canceled");
  });

  it("archive skip is still intact (regression)", async () => {
    // Create archive/ dir in main checkout
    const archiveDirPath = path.join(tempDir, "specrunner", "changes", "archive");
    await nodefs.mkdir(archiveDirPath, { recursive: true });

    // list should complete without throwing
    await expect(JobStateStore.list(tempDir)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-025: various statuses with worktree-only layout end up in canceled/ with correct records
// ---------------------------------------------------------------------------

describe("TC-025: worktree-only jobs of various statuses all record to canceled/", () => {
  const statuses: JobStatus[] = ["awaiting-resume", "failed", "terminated"];

  for (const status of statuses) {
    it(`status=${status} → canceled/ has USER_CANCELED / canceledAt`, async () => {
      const { jobId, slug } = await makeJob(status);
      await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });
      const state = await loadCanceledState(jobId, slug);
      expect(state.status).toBe("canceled");
      expect(state.error?.code).toBe("USER_CANCELED");
      expect(state.canceledAt).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// cancelAllTerminated — TC-026
// ---------------------------------------------------------------------------

describe("cancelAllTerminated", () => {
  it("returns 0 removed with message when no targeted jobs exist", async () => {
    await makeJob("running");

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("No terminated jobs to remove.");
  });

  it("removes failed / terminated / canceled jobs with --yes", async () => {
    const { slug: s1 } = await makeJob("failed");
    const { slug: s2 } = await makeJob("terminated");
    const { slug: s3 } = await makeJob("canceled");
    await makeJob("running");        // should NOT be removed
    await makeJob("awaiting-archive"); // should NOT be removed

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.exitCode).toBe(0);

    // Sidecars for targeted jobs should be gone
    expect(await sidecarAbsent(s1)).toBe(true);
    expect(await sidecarAbsent(s2)).toBe(true);
    expect(await sidecarAbsent(s3)).toBe(true);
  });

  it("does NOT target archived jobs", async () => {
    const { slug: archivedSlug } = await makeJob("archived");
    await makeJob("failed");

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.exitCode).toBe(0);

    // archived job sidecar must remain
    expect(await sidecarAbsent(archivedSlug)).toBe(false);
  });

  it("rejects non-TTY without --yes", async () => {
    await makeJob("failed");

    const { Readable } = await import("node:stream");
    const fakeStdin = new Readable({ read() {} });

    const result = await cancelAllTerminated({ yes: false, stdin: fakeStdin, repoRoot: tempDir });

    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/--yes/);
  });

  it("TTY + y 入力で削除される (TC-27)", async () => {
    const { slug } = await makeJob("failed");
    const { Readable } = await import("node:stream");
    const ttyStdin = new Readable({ read() {} }) as NodeJS.ReadStream;
    (ttyStdin as unknown as { isTTY: boolean }).isTTY = true;

    const resultPromise = cancelAllTerminated({ yes: false, stdin: ttyStdin, repoRoot: tempDir });
    ttyStdin.push("y\n");
    ttyStdin.push(null);
    const result = await resultPromise;

    expect(result.exitCode).toBe(0);
    expect(await sidecarAbsent(slug)).toBe(true);
  });

  it("shows count of targets before deletion", async () => {
    await makeJob("failed");
    await makeJob("terminated");

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.info).toContain("Found 2 terminated job(s) to remove.");
  });

  it("only targets failed/terminated/canceled, not archived/running/awaiting-merge/awaiting-resume", async () => {
    await makeJob("running");
    await makeJob("awaiting-resume");
    await makeJob("awaiting-archive");
    await makeJob("archived");
    await makeJob("failed");

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.info).toContain("Found 1 terminated job(s) to remove.");
  });
});
