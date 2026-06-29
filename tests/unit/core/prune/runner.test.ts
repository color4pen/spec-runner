/**
 * Unit tests for src/core/prune/runner.ts
 *
 * T-03 acceptance criteria:
 * - Dry-run lists orphans and deletes nothing
 * - --force removes the worktree and deletes the local branch for a clean orphan
 * - A second --force run is a no-op (no orphans, no removal calls)
 * - An orphan with uncommitted changes or unpushed commits is skipped under --force
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pruneOrphanWorktrees } from "../../../../src/core/prune/runner.js";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";
import type { SpawnFn, SpawnResult } from "../../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// Mock the orphan module
// ---------------------------------------------------------------------------

vi.mock("../../../../src/core/worktree/orphan.js", () => ({
  scanOrphanWorktrees: vi.fn(),
  inspectWorktreeWork: vi.fn(),
  NON_TERMINAL_STATUSES: new Set(["running", "awaiting-resume", "awaiting-archive", "failed", "terminated"]),
}));

import {
  scanOrphanWorktrees,
  inspectWorktreeWork,
} from "../../../../src/core/worktree/orphan.js";

const mockScan = scanOrphanWorktrees as ReturnType<typeof vi.fn>;
const mockInspect = inspectWorktreeWork as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = "/repo";
const ORPHAN_PATH = `${REPO_ROOT}/.git/specrunner-worktrees/my-feature-aabbccdd`;
const ORPHAN_BRANCH = "feat/my-feature-aabbccdd";

function makeOrphan(path = ORPHAN_PATH, branch: string | null = ORPHAN_BRANCH) {
  return { worktreePath: path, dirName: "my-feature-aabbccdd", branch };
}

function makeSpawnResult(stdout = "", exitCode = 0, stderr = ""): SpawnResult {
  return { exitCode, stdout, stderr };
}

function makeWorktreeManager(): WorktreeManager & {
  remove: ReturnType<typeof vi.fn>;
  prune: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pruneOrphanWorktrees", () => {
  let manager: ReturnType<typeof makeWorktreeManager>;
  let spawn: SpawnFn & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = makeWorktreeManager();
    spawn = vi.fn().mockResolvedValue(makeSpawnResult());
  });

  // --- No orphans ---

  it("returns success message when no orphans found", async () => {
    mockScan.mockResolvedValue([]);

    const result = await pruneOrphanWorktrees({
      force: false,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(/no orphan worktrees/i);
  });

  // --- Dry-run ---

  it("dry-run: lists orphans and does NOT call remove or branch -D", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });

    const result = await pruneOrphanWorktrees({
      force: false,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(/dry-run/i);
    expect(result.info).toHaveLength(1);
    expect(result.info![0]).toContain(ORPHAN_PATH);
    expect(manager.remove).not.toHaveBeenCalled();

    // Check no branch -D was called via spawn
    const branchDeleteCalls = (spawn.mock.calls as unknown[][]).filter(
      (c) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[]).includes("-D"),
    );
    expect(branchDeleteCalls).toHaveLength(0);
  });

  it("dry-run: includes branch info in info line", async () => {
    mockScan.mockResolvedValue([makeOrphan(ORPHAN_PATH, ORPHAN_BRANCH)]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });

    const result = await pruneOrphanWorktrees({
      force: false,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.info![0]).toContain(ORPHAN_BRANCH);
  });

  // --- Force: clean orphan ---

  it("--force: removes worktree and deletes local branch for clean orphan", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });

    const result = await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(manager.remove).toHaveBeenCalledWith(ORPHAN_PATH, REPO_ROOT);

    const branchDeleteCalls = (spawn.mock.calls as unknown[][]).filter(
      (c) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[]).includes("-D"),
    );
    expect(branchDeleteCalls).toHaveLength(1);
    const args = branchDeleteCalls[0]![1] as string[];
    expect(args).toContain(ORPHAN_BRANCH);
  });

  it("--force: skips branch -D when branch is null", async () => {
    mockScan.mockResolvedValue([makeOrphan(ORPHAN_PATH, null)]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });

    await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    const branchDeleteCalls = (spawn.mock.calls as unknown[][]).filter(
      (c) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[]).includes("-D"),
    );
    expect(branchDeleteCalls).toHaveLength(0);
  });

  // --- Idempotent re-run ---

  it("second --force run is a no-op when no orphans remain", async () => {
    // First run finds no orphans (simulates state after successful prune)
    mockScan.mockResolvedValue([]);

    const result = await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(/no orphan worktrees/i);
    expect(manager.remove).not.toHaveBeenCalled();
  });

  // --- Work guard ---

  it("--force: skips orphan with uncommitted changes and emits warning", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({
      hasWork: true,
      reasons: ["has uncommitted or untracked changes"],
    });

    const result = await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(manager.remove).not.toHaveBeenCalled();
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes(ORPHAN_PATH))).toBe(true);
  });

  it("--force: skips orphan with unpushed commits and emits warning", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({
      hasWork: true,
      reasons: ["has 3 unpushed commit(s)"],
    });

    const result = await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(manager.remove).not.toHaveBeenCalled();
    expect(result.warnings).toBeDefined();
  });

  it("dry-run: skips orphan with work and still does not delete", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: true, reasons: ["has uncommitted changes"] });

    const result = await pruneOrphanWorktrees({
      force: false,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(manager.remove).not.toHaveBeenCalled();
    // info should be empty (no deletable orphans)
    expect(result.info ?? []).toHaveLength(0);
  });

  // --- Best-effort cleanup warnings ---

  it("--force: continues with warning when worktree remove fails", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });
    manager.remove.mockRejectedValue(new Error("remove failed"));

    const result = await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    // exitCode stays 0 (best-effort)
    expect(result.exitCode).toBe(0);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("remove failed"))).toBe(true);
  });

  it("--force: continues with warning when branch -D fails", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });
    spawn.mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "branch not found" }); // branch -D fails

    const result = await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    // exitCode stays 0 (best-effort)
    expect(result.exitCode).toBe(0);
    expect(result.warnings).toBeDefined();
  });

  // --- Prune stale refs ---

  it("calls worktreeManager.prune before processing orphans", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });

    await pruneOrphanWorktrees({
      force: true,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(manager.prune).toHaveBeenCalledWith(REPO_ROOT);
  });

  it("continues with warning when worktreeManager.prune fails", async () => {
    mockScan.mockResolvedValue([makeOrphan()]);
    mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });
    manager.prune.mockRejectedValue(new Error("prune failed"));

    const result = await pruneOrphanWorktrees({
      force: false,
      deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
    });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("git worktree prune failed")]),
    );
  });
});
