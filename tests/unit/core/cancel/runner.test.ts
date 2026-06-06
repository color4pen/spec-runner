/**
 * Tests for cancelSingleJob and cancelAllTerminated.
 *
 * cancelSingleJob:
 * - 各 status (running / awaiting-resume / awaiting-merge / failed / terminated / canceled / archived) の動作
 * - awaiting-merge + --force なし → reject
 * - awaiting-merge + --force あり → 成功
 * - archived → reject
 * - canceled → idempotent (state 未変更)
 * - --purge で state file 物理削除
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
import { JobStateStore } from "../../../../src/store/job-state-store.js";
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

/** Create a job state with a specific status patched via the store. */
async function makeJob(
  status: JobStatus = "failed",
  extras: Partial<{ pid: number | null | undefined; branch: string; worktreePath: string }> = {},
) {
  const state = await JobStateStore.create(tempDir, {
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });

  // Patch via the store (split layout)
  const store = new JobStateStore(state.jobId, tempDir);
  const loaded = await store.load();
  const patch: Record<string, unknown> = { status };
  if ("pid" in extras) patch["pid"] = extras.pid ?? null;
  if (extras.branch !== undefined) patch["branch"] = extras.branch;
  if (extras.worktreePath !== undefined) patch["worktreePath"] = extras.worktreePath;
  await store.update(loaded, patch as Parameters<typeof store.update>[1]);
  return { jobId: state.jobId };
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

async function loadState(jobId: string): Promise<JobState> {
  return (await new JobStateStore(jobId, tempDir).load()) as JobState;
}

async function stateFileExists(jobId: string): Promise<boolean> {
  const jobsDir = path.join(tempDir, ".specrunner", "jobs");
  try {
    // Check split-layout subdirectory (new format)
    await nodefs.access(path.join(jobsDir, jobId, "state.json"));
    return true;
  } catch {
    return false;
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

  it("does NOT delete state file", async () => {
    const { jobId } = await makeJob("archived");
    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });
    expect(await stateFileExists(jobId)).toBe(true);
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
    const { jobId } = await makeJob("awaiting-archive");
    const result = await cancelSingleJob({ jobId, force: true, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadState(jobId);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — running status", () => {
  it("kills pid and transitions to canceled", async () => {
    const { jobId } = await makeJob("running", { pid: 1234 });
    const kill = vi.fn();
    const isAlive = vi.fn().mockReturnValue(false);
    const deps = makeDeps({ kill, isAlive });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");

    const state = await loadState(jobId);
    expect(state.status).toBe("canceled");
  });

  it("continues with warning when pid is null", async () => {
    // Explicitly set pid: null to trigger "no PID recorded" branch
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
    const { jobId } = await makeJob("awaiting-resume");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadState(jobId);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — failed status", () => {
  it("transitions to canceled", async () => {
    const { jobId } = await makeJob("failed");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadState(jobId);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — terminated status", () => {
  it("transitions to canceled", async () => {
    const { jobId } = await makeJob("terminated");
    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    const state = await loadState(jobId);
    expect(state.status).toBe("canceled");
  });
});

describe("cancelSingleJob — canceled status (idempotent)", () => {
  it("succeeds without changing state", async () => {
    const { jobId } = await makeJob("canceled");

    // Record the state before
    const stateBefore = await loadState(jobId);

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    expect(result.exitCode).toBe(0);

    // State file should still exist
    expect(await stateFileExists(jobId)).toBe(true);

    // Status should still be canceled (not modified)
    const stateAfter = await loadState(jobId);
    expect(stateAfter.status).toBe("canceled");
    // updatedAt should NOT change (no write happened)
    expect(stateAfter.updatedAt).toBe(stateBefore.updatedAt);
  });

  it("deletes state file with --purge even for idempotent case", async () => {
    const { jobId } = await makeJob("canceled");
    await cancelSingleJob({ jobId, force: false, purge: true, deps: makeDeps() });

    expect(await stateFileExists(jobId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cancelSingleJob — state file content after cancel
// ---------------------------------------------------------------------------

describe("cancelSingleJob — state file content", () => {
  it("records status=canceled, error.code=USER_CANCELED, canceledAt on cancel", async () => {
    const { jobId } = await makeJob("failed");
    const before = new Date();

    await cancelSingleJob({ jobId, force: false, purge: false, deps: makeDeps() });

    const state = await loadState(jobId);
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
  it("deletes state file after cancel", async () => {
    const { jobId } = await makeJob("failed");
    await cancelSingleJob({ jobId, force: false, purge: true, deps: makeDeps() });

    expect(await stateFileExists(jobId)).toBe(false);
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
    const { jobId: j1 } = await makeJob("failed");
    const { jobId: j2 } = await makeJob("terminated");
    const { jobId: j3 } = await makeJob("canceled");
    await makeJob("running");        // should NOT be removed
    await makeJob("awaiting-archive"); // should NOT be removed

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.exitCode).toBe(0);

    // State files for targeted jobs should be gone
    expect(await stateFileExists(j1)).toBe(false);
    expect(await stateFileExists(j2)).toBe(false);
    expect(await stateFileExists(j3)).toBe(false);
  });

  it("does NOT target archived jobs", async () => {
    const { jobId: archivedId } = await makeJob("archived");
    await makeJob("failed");

    const result = await cancelAllTerminated({ yes: true, repoRoot: tempDir });

    expect(result.exitCode).toBe(0);

    // archived job state file must remain
    expect(await stateFileExists(archivedId)).toBe(true);
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
    const { jobId } = await makeJob("failed");
    const { Readable } = await import("node:stream");
    const ttyStdin = new Readable({ read() {} }) as NodeJS.ReadStream;
    (ttyStdin as unknown as { isTTY: boolean }).isTTY = true;

    const resultPromise = cancelAllTerminated({ yes: false, stdin: ttyStdin, repoRoot: tempDir });
    ttyStdin.push("y\n");
    ttyStdin.push(null);
    const result = await resultPromise;

    expect(result.exitCode).toBe(0);
    expect(await stateFileExists(jobId)).toBe(false);
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
