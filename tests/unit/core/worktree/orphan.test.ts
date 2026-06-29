/**
 * Unit tests for src/core/worktree/orphan.ts
 *
 * T-01 acceptance criteria:
 * - scanOrphanWorktrees returns an entry for a worktree with no non-terminal state
 * - scanOrphanWorktrees omits a worktree mapped to a non-terminal state
 * - scanOrphanWorktrees returns [] when the base dir is absent or git worktree list fails
 * - inspectWorktreeWork returns hasWork: true for non-empty status --porcelain
 * - inspectWorktreeWork returns hasWork: true for rev-list --count > 0
 * - inspectWorktreeWork returns hasWork: false only when both are clean
 * - inspectWorktreeWork returns hasWork: true on git error (fail-safe)
 */
import { describe, it, expect, vi } from "vitest";
import { scanOrphanWorktrees, inspectWorktreeWork, NON_TERMINAL_STATUSES } from "../../../../src/core/worktree/orphan.js";
import type { SpawnFn, SpawnResult } from "../../../../src/util/spawn.js";
import type { JobState } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = "/repo";
const BASE = `${REPO_ROOT}/.git/specrunner-worktrees`;

function makeSpawnResult(stdout: string, exitCode = 0, stderr = ""): SpawnResult {
  return { exitCode, stdout, stderr };
}

/**
 * Build a minimal porcelain output string for git worktree list --porcelain.
 * Includes the main worktree first, then the given specrunner worktrees.
 */
function makePorcelainOutput(worktrees: Array<{ path: string; branch?: string | null }>): string {
  const blocks: string[] = [];
  // Main worktree (always first)
  blocks.push(`worktree ${REPO_ROOT}\nHEAD abc123\nbranch refs/heads/main`);
  for (const wt of worktrees) {
    let block = `worktree ${wt.path}\nHEAD def456`;
    if (wt.branch) {
      block += `\nbranch refs/heads/${wt.branch}`;
    } else if (wt.branch === null) {
      block += "\ndetached";
    }
    blocks.push(block);
  }
  return blocks.join("\n\n") + "\n\n";
}

function makeJobState(
  slug: string,
  jobId: string,
  status: JobState["status"],
): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    request: { path: "/test/request.md", title: "Test", type: "new-feature", slug },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "init",
    status,
    pid: null,
    branch: null,
    error: null,
    history: [],
    worktreePath: null,
  } as unknown as JobState;
}

// ---------------------------------------------------------------------------
// NON_TERMINAL_STATUSES
// ---------------------------------------------------------------------------

describe("NON_TERMINAL_STATUSES", () => {
  it("contains running, awaiting-resume, awaiting-archive, failed, terminated", () => {
    expect(NON_TERMINAL_STATUSES.has("running")).toBe(true);
    expect(NON_TERMINAL_STATUSES.has("awaiting-resume")).toBe(true);
    expect(NON_TERMINAL_STATUSES.has("awaiting-archive")).toBe(true);
    expect(NON_TERMINAL_STATUSES.has("failed")).toBe(true);
    expect(NON_TERMINAL_STATUSES.has("terminated")).toBe(true);
  });

  it("does not contain archived or canceled", () => {
    expect(NON_TERMINAL_STATUSES.has("archived")).toBe(false);
    expect(NON_TERMINAL_STATUSES.has("canceled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scanOrphanWorktrees
// ---------------------------------------------------------------------------

describe("scanOrphanWorktrees", () => {
  it("returns entry for a worktree with no non-terminal state", async () => {
    const jobId = "aabbccdd-1234-5678-abcd-000000000000";
    const slug = "my-feature";
    const worktreePath = `${BASE}/${slug}-${jobId.slice(0, 8)}`;

    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult(makePorcelainOutput([{ path: worktreePath, branch: `feat/${slug}-${jobId.slice(0, 8)}` }])),
    );

    // No states at all → worktree is orphan
    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.worktreePath).toBe(worktreePath);
    expect(result[0]!.dirName).toBe(`${slug}-${jobId.slice(0, 8)}`);
    expect(result[0]!.branch).toBe(`feat/${slug}-${jobId.slice(0, 8)}`);
  });

  it("omits a worktree mapped to a non-terminal state", async () => {
    const jobId = "aabbccdd-1234-5678-abcd-111111111111";
    const slug = "active-job";
    const dirName = `${slug}-${jobId.slice(0, 8)}`;
    const worktreePath = `${BASE}/${dirName}`;

    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult(makePorcelainOutput([{ path: worktreePath, branch: `feat/${dirName}` }])),
    );

    // State exists for this worktree (running = non-terminal)
    const state = makeJobState(slug, jobId, "running");

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [state],
    });

    expect(result).toHaveLength(0);
  });

  it("treats archived job worktree as orphan (archived = terminal)", async () => {
    const jobId = "aabbccdd-1234-5678-abcd-222222222222";
    const slug = "archived-job";
    const dirName = `${slug}-${jobId.slice(0, 8)}`;
    const worktreePath = `${BASE}/${dirName}`;

    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult(makePorcelainOutput([{ path: worktreePath, branch: `feat/${dirName}` }])),
    );

    const state = makeJobState(slug, jobId, "archived");

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [state],
    });

    // archived is terminal → worktree is orphan
    expect(result).toHaveLength(1);
    expect(result[0]!.worktreePath).toBe(worktreePath);
  });

  it("handles multiple worktrees: some orphans, some protected", async () => {
    const activeJobId = "aaaaaaaa-0000-0000-0000-000000000001";
    const orphanJobId = "bbbbbbbb-0000-0000-0000-000000000002";
    const activeSlug = "active";
    const orphanSlug = "orphan";
    const activeDirName = `${activeSlug}-${activeJobId.slice(0, 8)}`;
    const orphanDirName = `${orphanSlug}-${orphanJobId.slice(0, 8)}`;

    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult(
        makePorcelainOutput([
          { path: `${BASE}/${activeDirName}`, branch: `feat/${activeDirName}` },
          { path: `${BASE}/${orphanDirName}`, branch: `feat/${orphanDirName}` },
        ]),
      ),
    );

    const activeState = makeJobState(activeSlug, activeJobId, "running");

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [activeState],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.dirName).toBe(orphanDirName);
  });

  it("returns [] when git worktree list fails (exitCode non-zero)", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult("", 1, "fatal: not a git repo"),
    );

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [],
    });

    expect(result).toHaveLength(0);
  });

  it("returns [] when spawn throws", async () => {
    const spawn: SpawnFn = vi.fn().mockRejectedValue(new Error("spawn failed"));

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [],
    });

    expect(result).toHaveLength(0);
  });

  it("returns [] when there are no specrunner-worktrees in porcelain output", async () => {
    // Only main worktree, no specrunner-worktrees
    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult(`worktree ${REPO_ROOT}\nHEAD abc123\nbranch refs/heads/main\n\n`),
    );

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [],
    });

    expect(result).toHaveLength(0);
  });

  it("parses branch as null for detached HEAD worktree", async () => {
    const jobId = "cccccccc-1234-5678-abcd-000000000000";
    const slug = "detached-job";
    const worktreePath = `${BASE}/${slug}-${jobId.slice(0, 8)}`;

    const spawn: SpawnFn = vi.fn().mockResolvedValue(
      makeSpawnResult(
        makePorcelainOutput([{ path: worktreePath, branch: null }]),
      ),
    );

    const result = await scanOrphanWorktrees({
      repoRoot: REPO_ROOT,
      spawn,
      listStates: async () => [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.branch).toBeNull();
  });

  it("all non-terminal statuses protect their worktrees", async () => {
    const statuses: Array<JobState["status"]> = [
      "running",
      "awaiting-resume",
      "awaiting-archive",
      "failed",
      "terminated",
    ];

    for (const status of statuses) {
      const jobId = `aaaaaaaa-0000-0000-0000-00000000000${statuses.indexOf(status)}`;
      const slug = `job-${status}`;
      const dirName = `${slug}-${jobId.slice(0, 8)}`;
      const worktreePath = `${BASE}/${dirName}`;

      const spawn: SpawnFn = vi.fn().mockResolvedValue(
        makeSpawnResult(makePorcelainOutput([{ path: worktreePath, branch: `feat/${dirName}` }])),
      );

      const state = makeJobState(slug, jobId, status);

      const result = await scanOrphanWorktrees({
        repoRoot: REPO_ROOT,
        spawn,
        listStates: async () => [state],
      });

      expect(result, `status=${status} should protect the worktree`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// inspectWorktreeWork
// ---------------------------------------------------------------------------

describe("inspectWorktreeWork", () => {
  it("returns hasWork: false when both status and rev-list are clean", async () => {
    const spawn: SpawnFn = vi.fn()
      .mockResolvedValueOnce(makeSpawnResult("")) // git status --porcelain → empty
      .mockResolvedValueOnce(makeSpawnResult("0\n")); // rev-list --count → 0

    const result = await inspectWorktreeWork("/some/worktree", spawn);

    expect(result.hasWork).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("returns hasWork: true when git status --porcelain is non-empty", async () => {
    const spawn: SpawnFn = vi.fn()
      .mockResolvedValueOnce(makeSpawnResult(" M modified-file.ts\n")) // dirty
      .mockResolvedValueOnce(makeSpawnResult("0\n"));

    const result = await inspectWorktreeWork("/some/worktree", spawn);

    expect(result.hasWork).toBe(true);
    expect(result.reasons.some((r) => r.includes("uncommitted"))).toBe(true);
  });

  it("returns hasWork: true when rev-list --count > 0 (unpushed commits)", async () => {
    const spawn: SpawnFn = vi.fn()
      .mockResolvedValueOnce(makeSpawnResult("")) // clean status
      .mockResolvedValueOnce(makeSpawnResult("3\n")); // 3 unpushed commits

    const result = await inspectWorktreeWork("/some/worktree", spawn);

    expect(result.hasWork).toBe(true);
    expect(result.reasons.some((r) => r.includes("unpushed"))).toBe(true);
  });

  it("returns hasWork: true with reason when git status fails (fail-safe)", async () => {
    const spawn: SpawnFn = vi.fn()
      .mockResolvedValueOnce(makeSpawnResult("", 128, "fatal: not a git repo"));

    const result = await inspectWorktreeWork("/some/worktree", spawn);

    expect(result.hasWork).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns hasWork: true with reason when spawn throws (fail-safe)", async () => {
    const spawn: SpawnFn = vi.fn().mockRejectedValue(new Error("spawn error"));

    const result = await inspectWorktreeWork("/some/worktree", spawn);

    expect(result.hasWork).toBe(true);
    expect(result.reasons.some((r) => r.includes("spawn error"))).toBe(true);
  });

  it("returns hasWork: true when rev-list fails (fail-safe)", async () => {
    const spawn: SpawnFn = vi.fn()
      .mockResolvedValueOnce(makeSpawnResult("")) // clean status
      .mockResolvedValueOnce(makeSpawnResult("", 128, "fatal: bad HEAD")); // rev-list fails

    const result = await inspectWorktreeWork("/some/worktree", spawn);

    expect(result.hasWork).toBe(true);
  });
});
