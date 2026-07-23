/**
 * Unit tests for WorktreeManager.
 *
 * Tests use spawn mocks (DI) so no real git operations occur.
 * fs.rm is injected via rmFn DI to avoid module-level mock conflicts.
 * detectPmFn is injected to avoid real filesystem access in tests.
 *
 * TC-WTM-001: create — happy path (worktree add + bun install succeed → returns path)
 * TC-WTM-002: create — git worktree add fails → throws
 * TC-WTM-003: create — bun install fails → cleans up worktree and throws
 * TC-WTM-004: remove — calls git worktree remove + fs.rm
 * TC-WTM-005: prune — calls git worktree prune
 * TC-WTM-006: buildWorktreePath — path format is .git/specrunner-worktrees/<slug>-<jobId[:8]>
 * TC-WTM-018: create — pnpm detected → pnpm install --frozen-lockfile
 * TC-WTM-019: create — npm fallback → npm ci
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createWorktreeManager, buildWorktreePath } from "../../../src/core/worktree/manager.js";
import type { SpawnFn, SpawnResult } from "../../../src/util/spawn.js";
import type { PackageManager } from "../../../src/util/detect-pm.js";
import type { WorkspaceSetupPlan } from "../../../src/core/worktree/setup.js";

afterEach(() => {
  vi.clearAllMocks();
});

function makeSpawn(
  responses: Array<Partial<SpawnResult>>,
): SpawnFn & { calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  let i = 0;
  const fn = vi.fn(async (cmd: string, args: string[], _opts: { cwd: string }) => {
    calls.push({ cmd, args });
    const r = responses[i] ?? { exitCode: 0, stdout: "", stderr: "" };
    i++;
    return { exitCode: 0, stdout: "", stderr: "", ...r };
  }) as unknown as SpawnFn & { calls: typeof calls };
  Object.assign(fn, { calls });
  return fn;
}

/** Create a vi.fn() rmFn suitable for injection into createWorktreeManager. */
function makeRmFn(): ((path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>) & ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(undefined) as unknown as
    ((path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>) & ReturnType<typeof vi.fn>;
}

/** Stub detectPmFn that always returns the given PM. */
function makePmStub(pm: PackageManager): (_cwd: string) => Promise<PackageManager> {
  return () => Promise.resolve(pm);
}

// TC-WTM-006: buildWorktreePath path format
describe("TC-WTM-006: buildWorktreePath", () => {
  it("formats path as .git/specrunner-worktrees/<slug>-<jobId[:8]>", () => {
    const result = buildWorktreePath("/repo", "my-slug", "abcdef1234567890");
    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");
  });

  it("uses exactly 8 characters from jobId", () => {
    const result = buildWorktreePath("/repo", "slug", "12345678-LONG-UUID");
    expect(result).toContain("slug-12345678");
  });
});

// TC-WTM-001: create — happy path
describe("TC-WTM-001: create — happy path", () => {
  it("calls git worktree add then bun install and returns worktree path", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890");

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");

    const cmds = spawn.calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
    expect(cmds[0]).toContain("git worktree add --detach");
    expect(cmds[0]).toContain("my-slug-abcdef12");
    // No baseRef provided → uses HEAD
    expect(cmds[0]).toContain("HEAD");
    expect(cmds[1]).toBe("bun install --frozen-lockfile");
  });
});

// TC-WTM-008: create — baseRef argument
describe("TC-WTM-008: create — baseRef argument", () => {
  it("uses provided baseRef instead of HEAD when creating worktree", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main");

    const addCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("add"),
    );
    expect(addCall).toBeDefined();
    expect(addCall?.args).toContain("origin/main");
    // HEAD should NOT appear in the worktree add args
    expect(addCall?.args).not.toContain("HEAD");
  });

  it("uses HEAD when baseRef is omitted (backward compat)", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    await manager.create("/repo", "slug", "aaaa1111");

    const addCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("add"),
    );
    expect(addCall).toBeDefined();
    expect(addCall?.args).toContain("HEAD");
    expect(addCall?.args).not.toContain("origin/main");
  });
});

// TC-WTM-002: create — git worktree add fails
describe("TC-WTM-002: create — git worktree add fails", () => {
  it("throws with error message from stderr", async () => {
    const spawn = makeSpawn([
      { exitCode: 1, stderr: "fatal: worktree already exists" },
    ]);

    const manager = createWorktreeManager(spawn);
    await expect(manager.create("/repo", "slug", "aaaa1111bbbb2222")).rejects.toThrow(
      "git worktree add failed",
    );

    // bun install should NOT be called
    expect(spawn.calls.length).toBe(1);
  });
});

// TC-WTM-003: create — bun install fails → cleanup
describe("TC-WTM-003: create — bun install fails → cleanup", () => {
  it("removes worktree and throws when bun install fails", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add (success)
      { exitCode: 1, stderr: "error: lockfile mismatch" }, // bun install (fail)
      { exitCode: 0 }, // git worktree remove (cleanup)
    ]);
    const rm = makeRmFn();

    const manager = createWorktreeManager(spawn, rm, undefined, makePmStub("bun"));
    await expect(manager.create("/repo", "slug", "aaaa1111bbbb2222")).rejects.toThrow(
      "bun install failed",
    );

    // Cleanup: git worktree remove was called
    const removeCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("remove"),
    );
    expect(removeCall).toBeDefined();

    // fs.rm was called as belt-and-suspenders cleanup
    expect(rm).toHaveBeenCalled();
  });
});

// TC-WTM-004: remove
describe("TC-WTM-004: remove", () => {
  it("calls git worktree remove --force and fs.rm", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree remove
    ]);
    const rm = makeRmFn();

    const manager = createWorktreeManager(spawn, rm);
    const worktreePath = "/repo/.git/specrunner-worktrees/my-slug-abcdef12";
    await manager.remove(worktreePath, "/repo");

    const removeCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("remove"),
    );
    expect(removeCall).toBeDefined();
    expect(removeCall?.args).toContain("--force");
    expect(removeCall?.args).toContain(worktreePath);

    expect(rm).toHaveBeenCalledWith(worktreePath, {
      recursive: true,
      force: true,
    });
  });

  it("uses the provided repoRoot as cwd for git commands", async () => {
    const spawn = makeSpawn([{ exitCode: 0 }]);
    const manager = createWorktreeManager(spawn);

    await manager.remove("/my/project/.git/specrunner-worktrees/slug-12345678", "/my/project");

    // spawn should be called with cwd = /my/project
    const spawnMock = spawn as unknown as { mock: { calls: unknown[][] } };
    const firstCallOpts = spawnMock.mock.calls[0]?.[2];
    expect(firstCallOpts).toEqual(
      expect.objectContaining({ cwd: "/my/project" }),
    );
  });
});

// TC-WTM-005: prune
describe("TC-WTM-005: prune", () => {
  it("calls git worktree prune with repoRoot as cwd", async () => {
    const spawn = makeSpawn([{ exitCode: 0 }]);
    const manager = createWorktreeManager(spawn);

    await manager.prune("/repo");

    expect(spawn.calls.length).toBe(1);
    expect(spawn.calls[0]!.cmd).toBe("git");
    expect(spawn.calls[0]!.args).toEqual(["worktree", "prune"]);
  });
});

// TC-WTM-009: create — branchName specified → uses -b flag
describe("TC-WTM-009: create — branchName specified uses -b flag", () => {
  it("passes -b <branchName> when branchName is provided", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-feature-abcdef12");

    const addCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("add"),
    );
    expect(addCall).toBeDefined();
    expect(addCall?.args).toContain("-b");
    expect(addCall?.args).toContain("feat/my-feature-abcdef12");
    // --detach should NOT appear
    expect(addCall?.args).not.toContain("--detach");
  });

  it("passes --no-track with -b so the branch does not inherit upstream from the base ref", async () => {
    // Without --no-track, branching from origin/<base> sets the new branch's upstream to
    // origin/<base>, making a bare `git push` in the worktree target the base branch
    // (push.default=upstream). The upstream must instead be bound to the feature branch
    // by the first pipeline push (-u).
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-feature-abcdef12");

    const addCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("add"),
    );
    expect(addCall?.args).toContain("--no-track");
  });

  it("uses --detach when branchName is omitted (backward compat)", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main");

    const addCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("add"),
    );
    expect(addCall).toBeDefined();
    expect(addCall?.args).toContain("--detach");
    // -b should NOT appear
    expect(addCall?.args).not.toContain("-b");
  });
});

// TC-WTM-010: lock contention retry succeeds on 2nd attempt
describe("TC-WTM-010: lock contention retry succeeds on 2nd attempt", () => {
  it("retries on lock contention, returns worktree path on success", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr }, // git worktree add (1st attempt — lock contention)
      { exitCode: 0 },                    // git worktree add (2nd attempt — success)
      { exitCode: 0 },                    // bun install
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn, makePmStub("bun"));
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890");

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");
    expect(spawn.calls.length).toBe(3);
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });
});

// TC-WTM-011: lock contention exhausts retries → throws
describe("TC-WTM-011: lock contention exhausts all retries", () => {
  it("throws after 3 failed attempts, sleepFn called twice", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr },
      { exitCode: 128, stderr: lockErr },
      { exitCode: 128, stderr: lockErr },
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn);
    await expect(manager.create("/repo", "my-slug", "abcdef1234567890")).rejects.toThrow(
      "git worktree add failed",
    );

    // Sleep is called after attempt 1 and attempt 2 — not after the final failure
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });
});

// TC-WTM-012: non-lock-contention error does not retry
describe("TC-WTM-012: non-lock-contention error does not retry", () => {
  it("throws immediately without retrying for unrelated errors", async () => {
    const spawn = makeSpawn([
      { exitCode: 1, stderr: "fatal: worktree already exists" },
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn);
    await expect(manager.create("/repo", "my-slug", "abcdef1234567890")).rejects.toThrow(
      "git worktree add failed",
    );

    expect(spawn.calls.length).toBe(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// TC-WTM-013: lock contention → branch exists → retry without -b succeeds
describe("TC-WTM-013: lock contention → branch exists → retry without -b", () => {
  it("switches to existing-branch args when rev-parse shows branch already exists", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr }, // git worktree add (attempt 1, lock contention)
      { exitCode: 0 },                    // git rev-parse (branch exists)
      { exitCode: 0 },                    // git worktree add (attempt 2, success without -b)
      { exitCode: 0 },                    // bun install
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn, makePmStub("bun"));
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch");

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");

    const worktreeAddCalls = spawn.calls.filter(
      (c) => c.cmd === "git" && c.args.includes("worktree") && c.args.includes("add"),
    );
    expect(worktreeAddCalls.length).toBe(2);

    // 2nd worktree add must NOT contain -b
    const secondAdd = worktreeAddCalls[1]!;
    expect(secondAdd.args).not.toContain("-b");
    // branchName is the last arg
    expect(secondAdd.args[secondAdd.args.length - 1]).toBe("feat/my-branch");
  });
});

// TC-WTM-014: lock contention → branch not exists → retry with -b succeeds
describe("TC-WTM-014: lock contention → branch not exists → retry with -b", () => {
  it("keeps -b args when rev-parse shows branch does not exist", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr }, // git worktree add (attempt 1, lock contention)
      { exitCode: 1 },                    // git rev-parse (branch does NOT exist)
      { exitCode: 0 },                    // git worktree add (attempt 2, success with -b)
      { exitCode: 0 },                    // bun install
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn, makePmStub("bun"));
    await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch");

    const worktreeAddCalls = spawn.calls.filter(
      (c) => c.cmd === "git" && c.args.includes("worktree") && c.args.includes("add"),
    );
    expect(worktreeAddCalls.length).toBe(2);

    // 2nd worktree add must still contain -b
    const secondAdd = worktreeAddCalls[1]!;
    expect(secondAdd.args).toContain("-b");
    expect(secondAdd.args).toContain("feat/my-branch");
  });
});

// TC-WTM-015: all retries fail → branch cleanup called
describe("TC-WTM-015: all retries fail → branch cleanup", () => {
  it("calls git branch -D after exhausting all retries with branchName", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr }, // attempt 1 fail
      { exitCode: 0 },                    // rev-parse (branch exists)
      { exitCode: 128, stderr: lockErr }, // attempt 2 fail
      { exitCode: 0 },                    // rev-parse (branch exists)
      { exitCode: 128, stderr: lockErr }, // attempt 3 fail (MAX_RETRIES)
      { exitCode: 0 },                    // git branch -D (cleanup)
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn);
    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch"),
    ).rejects.toThrow("git worktree add failed");

    const cleanupCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("-D"),
    );
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall?.args).toContain("feat/my-branch");
  });
});

// TC-WTM-016: --detach mode, all retries fail → no branch cleanup
describe("TC-WTM-016: detach mode all retries fail → no branch cleanup", () => {
  it("does not call git branch -D when branchName is undefined", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr }, // attempt 1 fail (detach, no rev-parse)
      { exitCode: 128, stderr: lockErr }, // attempt 2 fail
      { exitCode: 128, stderr: lockErr }, // attempt 3 fail (MAX_RETRIES)
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    // No branchName → detach mode
    const manager = createWorktreeManager(spawn, undefined, sleepFn);
    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main"),
    ).rejects.toThrow("git worktree add failed");

    const cleanupCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("-D"),
    );
    expect(cleanupCall).toBeUndefined();
  });
});

// TC-WTM-017: all retries fail → branch -D fails → original error propagates
describe("TC-WTM-017: all retries fail → branch cleanup failure does not propagate", () => {
  it("throws original worktree add error even when git branch -D fails", async () => {
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr }, // attempt 1 fail
      { exitCode: 0 },                    // rev-parse (branch exists)
      { exitCode: 128, stderr: lockErr }, // attempt 2 fail
      { exitCode: 0 },                    // rev-parse (branch exists)
      { exitCode: 128, stderr: lockErr }, // attempt 3 fail (MAX_RETRIES)
      { exitCode: 1, stderr: "error: branch not found" }, // git branch -D (cleanup fails)
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn);
    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch"),
    ).rejects.toThrow("git worktree add failed");
  });
});

// TC-WTM-018: create — pnpm detected → pnpm install --frozen-lockfile
describe("TC-WTM-018: create — pnpm detected → pnpm install --frozen-lockfile", () => {
  it("uses pnpm install --frozen-lockfile when pnpm stub is injected", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // pnpm install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("pnpm"));
    await manager.create("/repo", "my-slug", "abcdef1234567890");

    const cmds = spawn.calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
    expect(cmds[1]).toBe("pnpm install --frozen-lockfile");
  });
});

// TC-WTM-019: create — npm fallback → npm ci
describe("TC-WTM-019: create — npm fallback → npm ci", () => {
  it("uses npm ci when npm stub is injected", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // npm ci
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("npm"));
    await manager.create("/repo", "my-slug", "abcdef1234567890");

    const cmds = spawn.calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
    expect(cmds[1]).toBe("npm ci");
  });
});

// TC-WTM-007: worktreePath in JobState — backward compat
describe("TC-WTM-007: JobState worktreePath backward compat", () => {
  it("validateJobState accepts state without worktreePath", async () => {
    const { validateJobState } = await import("../../../src/state/schema.js");
    const raw = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "init",
      status: "running",
      branch: null,
      history: [],
      error: null,
    };

    // Should not throw
    const state = validateJobState(raw);
    // worktreePath should be absent (undefined), not an error
    expect("worktreePath" in state ? state.worktreePath : undefined).toBeUndefined();
  });

  it("validateJobState accepts state with worktreePath=null", async () => {
    const { validateJobState } = await import("../../../src/state/schema.js");
    const raw = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "init",
      status: "running",
      branch: null,
      history: [],
      error: null,
      worktreePath: null,
    };

    const state = validateJobState(raw);
    expect(state.worktreePath).toBeNull();
  });

  it("validateJobState accepts state with worktreePath=string", async () => {
    const { validateJobState } = await import("../../../src/state/schema.js");
    const raw = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "init",
      status: "running",
      branch: null,
      history: [],
      error: null,
      worktreePath: "/repo/.git/specrunner-worktrees/my-slug-abcdef12",
    };

    const state = validateJobState(raw);
    expect(state.worktreePath).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");
  });
});

// ─── Plan-based setup tests (T-04) ────────────────────────────────────────────

// TC-WTM-020: commands plan — sh -c execution, no install
describe("TC-WTM-020: create — { kind: 'commands' } executes sh -c and skips install", () => {
  it("runs sh -c for each command in order, does not call detectPm or install", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // sh -c uv sync
    ]);
    const rm = makeRmFn();

    // Track whether detectPm was called
    let detectPmCallCount = 0;
    const trackingDetectPm = async (_cwd: string): Promise<PackageManager> => {
      detectPmCallCount++;
      return "bun";
    };

    const plan: WorkspaceSetupPlan = { kind: "commands", commands: [{ run: "uv sync" }] };
    const manager = createWorktreeManager(spawn, rm, undefined, trackingDetectPm);
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", undefined, plan);

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");

    // detectPm should NOT be called (we used commands plan)
    expect(detectPmCallCount).toBe(0);

    // Exactly 2 calls: git worktree add + sh -c
    expect(spawn.calls.length).toBe(2);
    expect(spawn.calls[0]!.cmd).toBe("git");
    expect(spawn.calls[0]!.args).toContain("add");
    expect(spawn.calls[1]!.cmd).toBe("sh");
    expect(spawn.calls[1]!.args).toEqual(["-c", "uv sync"]);
  });

  it("runs sh -c commands with worktreePath as cwd", async () => {
    const capturedCwds: string[] = [];
    const spawnWithTracking: SpawnFn & { calls: Array<{ cmd: string; args: string[] }> } = (() => {
      const calls: Array<{ cmd: string; args: string[] }> = [];
      const fn = vi.fn(async (cmd: string, args: string[], opts: { cwd: string }) => {
        calls.push({ cmd, args });
        capturedCwds.push(opts.cwd);
        return { exitCode: 0, stdout: "", stderr: "" };
      }) as unknown as SpawnFn & { calls: typeof calls };
      Object.assign(fn, { calls });
      return fn;
    })();

    const plan: WorkspaceSetupPlan = { kind: "commands", commands: [{ run: "uv sync" }] };
    const manager = createWorktreeManager(spawnWithTracking, makeRmFn(), undefined, makePmStub("bun"));
    await manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", undefined, plan);

    // sh -c should be called with worktreePath as cwd
    const worktreePath = "/repo/.git/specrunner-worktrees/my-slug-abcdef12";
    expect(capturedCwds[1]).toBe(worktreePath);
  });
});

// TC-002: fail-fast — multiple commands, cmd1 fails → cmd2 not spawned
describe("TC-002: commands plan fail-fast — cmd1 失敗で cmd2 は spawn されない", () => {
  it("does not execute second command when first command exits non-zero", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 },                                    // git worktree add
      { exitCode: 1, stderr: "command not found: uv" },  // sh -c cmd1 (fail)
      { exitCode: 0 },                                    // git worktree remove (cleanup)
      // cmd2 must never be reached
    ]);
    const rm = makeRmFn();

    const plan: WorkspaceSetupPlan = {
      kind: "commands",
      commands: [
        { run: "uv sync" },
        { run: "pip install -r requirements.txt" },
      ],
    };
    const manager = createWorktreeManager(spawn, rm, undefined, makePmStub("bun"));

    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", undefined, undefined, plan),
    ).rejects.toThrow("Setup command 'uv sync' failed (exit 1)");

    // Only cmd1 (uv sync) should have been spawned via sh -c; cmd2 must be absent
    const shCalls = spawn.calls.filter((c) => c.cmd === "sh" && c.args[0] === "-c");
    expect(shCalls).toHaveLength(1);
    expect(shCalls[0]!.args[1]).toBe("uv sync");
  });
});

// TC-WTM-021: commands plan — failure triggers cleanup
describe("TC-WTM-021: create — commands plan failure cleans up worktree", () => {
  it("calls git worktree remove + rm when a command exits non-zero", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 },                                    // git worktree add
      { exitCode: 1, stderr: "command not found: uv" },  // sh -c uv sync (fail)
      { exitCode: 0 },                                    // git worktree remove (cleanup)
    ]);
    const rm = makeRmFn();

    const plan: WorkspaceSetupPlan = { kind: "commands", commands: [{ run: "uv sync" }] };
    const manager = createWorktreeManager(spawn, rm, undefined, makePmStub("bun"));

    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", undefined, plan),
    ).rejects.toThrow("Setup command 'uv sync' failed (exit 1)");

    // Cleanup: git worktree remove was called
    const removeCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.includes("remove"),
    );
    expect(removeCall).toBeDefined();
    expect(rm).toHaveBeenCalled();
  });

  it("uses cmd.name as label in error message when name is set", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 },
      { exitCode: 2, stderr: "deps failed" },
      { exitCode: 0 },
    ]);
    const rm = makeRmFn();

    const plan: WorkspaceSetupPlan = {
      kind: "commands",
      commands: [{ name: "install-deps", run: "pip install -r requirements.txt" }],
    };
    const manager = createWorktreeManager(spawn, rm, undefined, makePmStub("bun"));

    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", undefined, undefined, plan),
    ).rejects.toThrow("Setup command 'install-deps' failed (exit 2)");
  });

  it("uses cmd.run as label when name is absent", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 },
      { exitCode: 1, stderr: "error" },
      { exitCode: 0 },
    ]);
    const rm = makeRmFn();

    const plan: WorkspaceSetupPlan = {
      kind: "commands",
      commands: [{ run: "go mod download" }],
    };
    const manager = createWorktreeManager(spawn, rm, undefined, makePmStub("bun"));

    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", undefined, undefined, plan),
    ).rejects.toThrow("Setup command 'go mod download' failed (exit 1)");
  });
});

// TC-WTM-022: skip plan — no install, no commands
describe("TC-WTM-022: create — { kind: 'skip' } skips all setup", () => {
  it("does not call install or any setup command, returns worktreePath", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add only
    ]);
    const rm = makeRmFn();

    // Track whether detectPm was called
    let detectPmCallCount = 0;
    const trackingDetectPm = async (_cwd: string): Promise<PackageManager> => {
      detectPmCallCount++;
      return "bun";
    };

    const plan: WorkspaceSetupPlan = { kind: "skip" };
    const manager = createWorktreeManager(spawn, rm, undefined, trackingDetectPm);
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890", undefined, undefined, plan);

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");
    // Only git worktree add was called
    expect(spawn.calls.length).toBe(1);
    expect(spawn.calls[0]!.cmd).toBe("git");
    expect(spawn.calls[0]!.args).toContain("add");
    // detectPm should NOT be called
    expect(detectPmCallCount).toBe(0);
    // rm should NOT be called
    expect(rm).not.toHaveBeenCalled();
  });
});

// TC-WTM-023: commands plan with empty array — no commands run
describe("TC-WTM-023: create — commands plan with empty array runs nothing", () => {
  it("empty commands array does not call any setup commands", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add only
    ]);

    const plan: WorkspaceSetupPlan = { kind: "commands", commands: [] };
    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890", undefined, undefined, plan);

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");
    // Only git worktree add was called
    expect(spawn.calls.length).toBe(1);
  });
});

// TC-WTM-025: preserveBranchOnFailure=true + worktree add fails → no git branch -D
describe("TC-WTM-025: preserveBranchOnFailure=true + worktree add fails → no branch cleanup", () => {
  it("does NOT call git branch -D when preserveBranchOnFailure is true", async () => {
    // Non-lock-contention failure so it fails on first attempt without retry
    const spawn = makeSpawn([
      { exitCode: 1, stderr: "fatal: worktree at path already registered" }, // immediate fail
    ]);

    const manager = createWorktreeManager(spawn, undefined, vi.fn().mockResolvedValue(undefined));
    await expect(
      manager.create(
        "/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch",
        { kind: "skip" },
        true, // preserveBranchOnFailure: cannot prove ownership → must NOT delete branch
      ),
    ).rejects.toThrow("git worktree add failed");

    // Verify git branch -D was NOT called (branch ownership cannot be proven)
    const cleanupCall = spawn.calls.find((c) => c.cmd === "git" && c.args.includes("-D"));
    expect(cleanupCall).toBeUndefined();
  });

  it("still throws the original worktree add error with preserveBranchOnFailure=true", async () => {
    const spawn = makeSpawn([
      { exitCode: 128, stderr: "fatal: not a git repository" },
    ]);
    const manager = createWorktreeManager(spawn, undefined, vi.fn().mockResolvedValue(undefined));
    await expect(
      manager.create("/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch", { kind: "skip" }, true),
    ).rejects.toThrow("git worktree add failed");
  });
});

// TC-WTM-026: preserveBranchOnFailure=false (default) + worktree add fails → branch -D IS called
describe("TC-WTM-026: preserveBranchOnFailure=false + worktree add fails → branch cleanup called", () => {
  it("calls git branch -D when preserveBranchOnFailure is false (default new-run behavior)", async () => {
    const spawn = makeSpawn([
      { exitCode: 1, stderr: "fatal: worktree add failed" }, // immediate non-lock fail
      { exitCode: 0 }, // git branch -D (cleanup)
    ]);

    const manager = createWorktreeManager(spawn, undefined, vi.fn().mockResolvedValue(undefined));
    await expect(
      manager.create(
        "/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch",
        { kind: "skip" },
        false, // preserveBranchOnFailure=false: new-run owns this branch, may clean up
      ),
    ).rejects.toThrow("git worktree add failed");

    const cleanupCall = spawn.calls.find((c) => c.cmd === "git" && c.args.includes("-D"));
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall?.args).toContain("feat/my-branch");
  });
});

// TC-WTM-027: preserveBranchOnFailure=true + race (branch created between check and create)
// → no git branch -D even though the branch now exists (we don't own it)
describe("TC-WTM-027: preserveBranchOnFailure=true race scenario → no branch cleanup", () => {
  it("does NOT call git branch -D when a race causes worktree add to fail with branch pre-existing", async () => {
    // Simulate the race condition: another process created the branch between check and create.
    // git worktree add -b <branch> fails because the branch now exists.
    // With preserveBranchOnFailure=true, we must NOT delete the branch.
    const spawn = makeSpawn([
      { exitCode: 128, stderr: "fatal: A branch named 'feat/my-branch' already exists" }, // race: branch exists
      // Note: no rev-parse here — with new ownership proof model, materializer no longer calls rev-parse
    ]);

    const manager = createWorktreeManager(spawn, undefined, vi.fn().mockResolvedValue(undefined));
    await expect(
      manager.create(
        "/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch",
        { kind: "skip" },
        true, // preserveBranchOnFailure=true: cannot prove we created it → must NOT delete
      ),
    ).rejects.toThrow("git worktree add failed");

    // The branch was created by another process — must NOT be deleted
    const cleanupCall = spawn.calls.find((c) => c.cmd === "git" && c.args.includes("-D"));
    expect(cleanupCall).toBeUndefined();

    // Should NOT have called rev-parse (ownership proof via pre-check is no longer used)
    const revParseCall = spawn.calls.find(
      (c) => c.cmd === "git" && c.args.some((a) => a.includes("rev-parse")),
    );
    expect(revParseCall).toBeUndefined();
  });

  it("does NOT call git branch -D on lock-contention exhaustion with preserveBranchOnFailure=true", async () => {
    // Lock contention with preserveBranchOnFailure=true: even after all retries, branch is not deleted.
    const lockErr = "error: could not lock config file .git/config: File exists";
    const spawn = makeSpawn([
      { exitCode: 128, stderr: lockErr },  // attempt 1 lock contention
      { exitCode: 0 },                      // rev-parse (internal retry check; branch exists)
      { exitCode: 128, stderr: lockErr },  // attempt 2 lock contention
      { exitCode: 0 },                      // rev-parse
      { exitCode: 128, stderr: lockErr },  // attempt 3 (MAX_RETRIES) → fail
    ]);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const manager = createWorktreeManager(spawn, undefined, sleepFn);
    await expect(
      manager.create(
        "/repo", "my-slug", "abcdef1234567890", "origin/main", "feat/my-branch",
        { kind: "skip" },
        true, // preserveBranchOnFailure=true: never delete
      ),
    ).rejects.toThrow("git worktree add failed");

    // Branch must NOT be deleted
    const cleanupCall = spawn.calls.find((c) => c.cmd === "git" && c.args.includes("-D"));
    expect(cleanupCall).toBeUndefined();
  });
});

// TC-WTM-024: no plan argument → detect-install (backward compat)
describe("TC-WTM-024: create — no plan argument uses detect-install (backward compat)", () => {
  it("runs bun install when no plan is passed (existing behavior preserved)", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn, undefined, undefined, makePmStub("bun"));
    // No plan argument → default detect-install
    const result = await manager.create("/repo", "my-slug", "abcdef1234567890");

    expect(result).toBe("/repo/.git/specrunner-worktrees/my-slug-abcdef12");
    expect(spawn.calls.length).toBe(2);
    expect(spawn.calls[1]!.cmd).toBe("bun");
    expect(spawn.calls[1]!.args).toContain("install");
  });
});
