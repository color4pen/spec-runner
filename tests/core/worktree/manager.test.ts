/**
 * Unit tests for WorktreeManager.
 *
 * Tests use spawn mocks (DI) so no real git operations occur.
 * fs.rm is injected via rmFn DI to avoid module-level mock conflicts.
 *
 * TC-WTM-001: create — happy path (worktree add + bun install succeed → returns path)
 * TC-WTM-002: create — git worktree add fails → throws
 * TC-WTM-003: create — bun install fails → cleans up worktree and throws
 * TC-WTM-004: remove — calls git worktree remove + fs.rm
 * TC-WTM-005: prune — calls git worktree prune
 * TC-WTM-006: buildWorktreePath — path format is .git/specrunner-worktrees/<slug>-<jobId[:8]>
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createWorktreeManager, buildWorktreePath } from "../../../src/core/worktree/manager.js";
import type { SpawnFn, SpawnResult } from "../../../src/util/spawn.js";

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

    const manager = createWorktreeManager(spawn);
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

    const manager = createWorktreeManager(spawn);
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

    const manager = createWorktreeManager(spawn);
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

    const manager = createWorktreeManager(spawn, rm);
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

    const manager = createWorktreeManager(spawn);
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

  it("uses --detach when branchName is omitted (backward compat)", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // bun install
    ]);

    const manager = createWorktreeManager(spawn);
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

    const manager = createWorktreeManager(spawn, undefined, sleepFn);
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
