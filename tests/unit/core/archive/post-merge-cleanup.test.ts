/**
 * Unit tests for src/core/archive/post-merge-cleanup.ts
 *
 * TC-PMC-001: worktreePath=null, noWorktree=false → 警告が出る、worktree 削除は呼ばれない
 * TC-PMC-002: worktreePath set, noWorktree=false → worktree 削除が呼ばれる、警告は出ない
 * TC-PMC-003: worktreePath=null, noWorktree=true → 警告なし、worktree 削除なし
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { FinishFs } from "../../../../src/core/finish/types.js";
import { runPostMergeCleanup } from "../../../../src/core/archive/post-merge-cleanup.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SLUG = "my-slug";
const CWD = "/tmp/repo";
const WORKTREE_PATH = "/tmp/wt/my-slug-abc12345";

function makeWorktreeManager(): WorktreeManager {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSpawnFn(): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }) as unknown as SpawnFn;
}

function makeFs(): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(false),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    readFile: vi.fn().mockResolvedValue(""),
    rm: vi.fn().mockResolvedValue(undefined),
  } as unknown as FinishFs;
}

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-PMC-001: worktreePath=null, noWorktree=false → 警告が出る、worktree 削除なし
// ---------------------------------------------------------------------------

describe("TC-PMC-001: worktreePath=null, noWorktree=false → worktree 未解決警告が出る", () => {
  it("stderrWrite に worktree path 未解決の警告メッセージが含まれる", async () => {
    const manager = makeWorktreeManager();

    await runPostMergeCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: null,
      worktreePath: null,
      noWorktree: false,
      baseBranch: "main",
      spawn: makeSpawnFn(),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    // Warning must mention the slug and instruct how to clean up
    const allStderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(allStderr).toContain(SLUG);
    expect(allStderr).toContain("worktree path could not be resolved");
    expect(allStderr).toContain("git worktree prune");
  });

  it("manager.remove は呼ばれない", async () => {
    const manager = makeWorktreeManager();

    await runPostMergeCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: null,
      worktreePath: null,
      noWorktree: false,
      baseBranch: "main",
      spawn: makeSpawnFn(),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    expect(manager.remove).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PMC-002: worktreePath set, noWorktree=false → worktree 削除が呼ばれる、警告なし
// ---------------------------------------------------------------------------

describe("TC-PMC-002: worktreePath set, noWorktree=false → worktree 削除が呼ばれる", () => {
  it("manager.remove が worktreePath と cwd で呼ばれる", async () => {
    const manager = makeWorktreeManager();

    await runPostMergeCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: null,
      worktreePath: WORKTREE_PATH,
      noWorktree: false,
      baseBranch: "main",
      spawn: makeSpawnFn(),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    expect(manager.remove).toHaveBeenCalledWith(WORKTREE_PATH, CWD);
  });

  it("worktree 未解決の警告は stderr に出ない", async () => {
    const manager = makeWorktreeManager();

    await runPostMergeCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: null,
      worktreePath: WORKTREE_PATH,
      noWorktree: false,
      baseBranch: "main",
      spawn: makeSpawnFn(),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    const allStderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(allStderr).not.toContain("worktree path could not be resolved");
  });
});

// ---------------------------------------------------------------------------
// TC-PMC-003: worktreePath=null, noWorktree=true → 警告なし、worktree 削除なし
// ---------------------------------------------------------------------------

describe("TC-PMC-003: worktreePath=null, noWorktree=true → 警告なし、worktree 削除なし", () => {
  it("--no-worktree モードでは manager.remove を呼ばない", async () => {
    const manager = makeWorktreeManager();

    await runPostMergeCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: null,
      worktreePath: null,
      noWorktree: true,
      baseBranch: "main",
      spawn: makeSpawnFn(),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    expect(manager.remove).not.toHaveBeenCalled();
  });

  it("--no-worktree モードでは worktree 未解決の警告は stderr に出ない", async () => {
    const manager = makeWorktreeManager();

    await runPostMergeCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: null,
      worktreePath: null,
      noWorktree: true,
      baseBranch: "main",
      spawn: makeSpawnFn(),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    const allStderr = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(allStderr).not.toContain("worktree path could not be resolved");
  });
});
