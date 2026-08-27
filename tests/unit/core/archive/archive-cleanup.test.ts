/**
 * Unit tests for src/core/archive/cleanup.ts
 *
 * TC-PMC-001: worktreePath=null, noWorktree=false → 警告が出る、worktree 削除は呼ばれない
 * TC-PMC-002: worktreePath set, noWorktree=false → worktree 削除が呼ばれる、警告は出ない
 * TC-PMC-003: worktreePath=null, noWorktree=true → 警告なし、worktree 削除なし
 * TC-018: deleteRemoteBranch: false → push --delete は発行されない、git branch -D は発行される
 * TC-019: deleteRemoteBranch 未指定（既定 true）→ runArchiveCleanup の既定動作（remote branch 削除を含む）
 * TC-020: deleteRemoteBranch: false → remote branch 保持の advisory が stdout に出力される
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { FinishFs } from "../../../../src/core/finish/types.js";
import { runArchiveCleanup } from "../../../../src/core/archive/cleanup.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SLUG = "my-slug";
const CWD = "/tmp/repo";
const BRANCH = "change/my-slug-abc12345";
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

    await runArchiveCleanup({
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

    await runArchiveCleanup({
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

    await runArchiveCleanup({
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

    await runArchiveCleanup({
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

    await runArchiveCleanup({
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

    await runArchiveCleanup({
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

// ---------------------------------------------------------------------------
// TC-018: deleteRemoteBranch: false → push --delete が発行されない
// ---------------------------------------------------------------------------

describe("TC-018: deleteRemoteBranch: false → git push origin --delete は発行されない", () => {
  it("git push origin --delete is NOT called when deleteRemoteBranch is false", async () => {
    const spawn = makeSpawnFn();

    await runArchiveCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: BRANCH,
      worktreePath: null,
      noWorktree: true,
      baseBranch: "main",
      spawn,
      fs: makeFs(),
      deleteRemoteBranch: false,
    });

    const allCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const remoteDeleteCall = allCalls.find(
      (c) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "push" &&
        (c[1] as string[]).includes("--delete"),
    );
    expect(remoteDeleteCall).toBeUndefined();
  });

  it("git branch -D IS called even when deleteRemoteBranch is false", async () => {
    const spawn = makeSpawnFn();

    await runArchiveCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: BRANCH,
      worktreePath: null,
      noWorktree: true,
      baseBranch: "main",
      spawn,
      fs: makeFs(),
      deleteRemoteBranch: false,
    });

    const allCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const localDeleteCall = allCalls.find(
      (c) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "branch" &&
        (c[1] as string[])[1] === "-D" &&
        (c[1] as string[])[2] === BRANCH,
    );
    expect(localDeleteCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-019: deleteRemoteBranch 未指定（既定 true）→ git push origin --delete が発行される
// ---------------------------------------------------------------------------

describe("TC-019: deleteRemoteBranch 未指定（既定 true）→ push --delete が発行される", () => {
  it("git push origin --delete IS called when deleteRemoteBranch is not specified (defaults to true)", async () => {
    const spawn = makeSpawnFn();

    await runArchiveCleanup({
      slug: SLUG,
      cwd: CWD,
      branch: BRANCH,
      worktreePath: null,
      noWorktree: true,
      baseBranch: "main",
      spawn,
      fs: makeFs(),
      // deleteRemoteBranch not specified → defaults to true
    });

    const allCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const remoteDeleteCall = allCalls.find(
      (c) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "push" &&
        (c[1] as string[]).includes("--delete") &&
        (c[1] as string[]).includes(BRANCH),
    );
    expect(remoteDeleteCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-020: deleteRemoteBranch: false → remote branch 保持の advisory が stdout に出力される
// ---------------------------------------------------------------------------

describe("TC-020: deleteRemoteBranch: false → remote branch 保持の advisory が stdout に出力される", () => {
  it("advisory message mentions branch retention and git fetch for restoration", async () => {
    const stdoutCalls: string[] = [];
    const stdoutWrite = (msg: string) => stdoutCalls.push(msg);

    await runArchiveCleanup(
      {
        slug: SLUG,
        cwd: CWD,
        branch: BRANCH,
        worktreePath: null,
        noWorktree: true,
        baseBranch: "main",
        spawn: makeSpawnFn(),
        fs: makeFs(),
        deleteRemoteBranch: false,
      },
      stdoutWrite,
    );

    const combined = stdoutCalls.join("\n");
    // Should mention the branch was kept
    expect(combined).toMatch(/kept|保持|preserve/i);
    // Should mention git fetch for restoration
    expect(combined).toContain(`git fetch origin ${BRANCH}`);
  });
});
