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
 * - cancel 後の state file に status: canceled, error.code: USER_CANCELED, canceledAt が記録
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
import type { SpawnResult } from "../../../../src/util/spawn.js";

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
 * Create a job state with a specific status and write it to:
 *  1. Slug canonical dir at specrunner/changes/<slug>/ (for cancelSingleJob load/persist)
 *  2. Liveness sidecar at .specrunner/local/<slug>/liveness.json (for loadStateByJobId)
 *
 * cancelSingleJob loads via loadStateByJobId → liveness sidecar → slug canonical dir.
 * cancelSingleJob persists via resolveStateStoreByJobId → liveness sidecar → slug canonical dir.
 */
async function makeJob(
  status: JobStatus = "failed",
  extras: Partial<{ pid: number | null | undefined; branch: string; worktreePath: string }> = {},
): Promise<{ jobId: string; slug: string }> {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });
  const jobId = state.jobId;
  const slug = `cancel-${jobId.slice(0, 8)}`;

  const pid = "pid" in extras ? (extras.pid ?? null) : null;

  // Write slug canonical state (what cancelSingleJob reads/writes)
  const slugDir = path.join(tempDir, "specrunner", "changes", slug);
  await nodefs.mkdir(slugDir, { recursive: true });
  await nodefs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      request: { path: "/test/request.md", title: "Test", type: "new-feature", slug },
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

  // Write liveness sidecar so loadStateByJobId can find the job
  const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
  await nodefs.mkdir(livenessDir, { recursive: true });
  await nodefs.writeFile(
    path.join(livenessDir, "liveness.json"),
    JSON.stringify({
      jobId,
      worktreePath: extras.worktreePath ?? null,
      pid,
    }),
  );

  return { jobId, slug };
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

/** Load the latest state for a job via its slug canonical store. */
async function loadState(jobId: string, slug: string): Promise<JobState> {
  const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
  return (await store.load()) as JobState;
}

/**
 * Return true when the sidecar directory for a job is absent.
 * cancelSingleJob --purge deletes .specrunner/local/<slug>/.
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

    const state = await loadState(jobId, slug);
    expect(state.status).toBe("canceled");
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

    const state = await loadState(jobId, slug);
    expect(state.status).toBe("canceled");
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

    const state = await loadState(jobId, slug);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — failed status", () => {
  it("transitions to canceled", async () => {
    const { jobId, slug } = await makeJob("failed");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadState(jobId, slug);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — terminated status", () => {
  it("transitions to canceled", async () => {
    const { jobId, slug } = await makeJob("terminated");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadState(jobId, slug);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — canceled status (idempotent)", () => {
  it("succeeds without changing state", async () => {
    const { jobId, slug } = await makeJob("canceled");

    // Record the state before
    const stateBefore = await loadState(jobId, slug);

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    // Status should still be canceled (not modified)
    const stateAfter = await loadState(jobId, slug);
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
  it("records status=canceled, error.code=USER_CANCELED, canceledAt on cancel", async () => {
    const { jobId, slug } = await makeJob("failed");
    const before = new Date();

    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    const state = await loadState(jobId, slug);
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
    const { jobId } = await makeJob("failed", { worktreePath: "/fake/worktree" });
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

    // Write slug canonical state
    const slugDir = path.join(tempDir, "specrunner", "changes", slug);
    await nodefs.mkdir(slugDir, { recursive: true });
    await nodefs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(state));
    await nodefs.writeFile(path.join(slugDir, "events.jsonl"), "");

    // Write liveness sidecar with jobId as a number (not string)
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
    // Should not throw — the guard rejects the sidecar worktreePath and falls through
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
// cancelAllTerminated
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
