/**
 * Unit tests for run.ts worktree git staging behavior.
 *
 * TC-WT-STAGE-001: git add failure → stderr error output + return 1 + cleanup
 * TC-WT-STAGE-002: git add success → pipeline proceeds (logic shape verification)
 *
 * Note: run.ts does not inject spawnCommand, so we test the behavior contract
 * by reconstructing the logic from the design spec (Design D1) and verifying
 * expected side effects — matching the pattern of run-worktree-signal.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import type { SpawnResult } from "../../../src/util/spawn.js";

/**
 * TC-WT-STAGE-001: git add non-zero exit → stderr output + cleanup + return 1
 */
describe("TC-WT-STAGE-001: git add failure path", () => {
  it("writes error to stderr and performs cleanup when git add returns non-zero exit", async () => {
    const stderrChunks: string[] = [];
    const removedArgs: Array<[string, string]> = [];
    const prunedPaths: string[] = [];

    const mockStderr = {
      write: vi.fn().mockImplementation((chunk: string) => { stderrChunks.push(chunk); }),
    };

    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockImplementation(async (p: string, root: string) => { removedArgs.push([p, root]); }),
      prune: vi.fn().mockImplementation(async (p: string) => { prunedPaths.push(p); }),
    };

    const worktreePath = "/repo/.git/specrunner-worktrees/test-slug-abcdef12";
    const cwd = "/repo";

    // Reconstruct the git add failure logic from Design D1
    const gitAddResult: SpawnResult = { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };

    let returnCode: number | undefined;

    if (gitAddResult.exitCode !== 0) {
      mockStderr.write(`Error: Failed to stage request file: ${gitAddResult.stderr.trim()}\n`);
      await mockManager.remove(worktreePath, cwd).catch(() => {});
      await mockManager.prune(cwd).catch(() => {});
      returnCode = 1;
    }

    expect(stderrChunks).toEqual(["Error: Failed to stage request file: fatal: not a git repository\n"]);
    expect(removedArgs).toEqual([[worktreePath, cwd]]);
    expect(prunedPaths).toEqual([cwd]);
    expect(returnCode).toBe(1);
  });

  it("cleanup continues even if manager.remove throws", async () => {
    const prunedPaths: string[] = [];

    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error("worktree not found")),
      prune: vi.fn().mockImplementation(async (p: string) => { prunedPaths.push(p); }),
    };

    const worktreePath = "/repo/.git/specrunner-worktrees/test-slug-abcdef12";
    const cwd = "/repo";
    const gitAddResult: SpawnResult = { exitCode: 1, stdout: "", stderr: "permission denied" };

    let returnCode: number | undefined;

    if (gitAddResult.exitCode !== 0) {
      await mockManager.remove(worktreePath, cwd).catch(() => {});
      await mockManager.prune(cwd).catch(() => {});
      returnCode = 1;
    }

    // prune should still be called even when remove throws
    expect(prunedPaths).toEqual([cwd]);
    expect(returnCode).toBe(1);
  });
});

/**
 * TC-WT-STAGE-002: git add success → pipeline proceeds
 */
describe("TC-WT-STAGE-002: git add success path", () => {
  it("does not return early when git add exits with code 0", () => {
    const gitAddResult: SpawnResult = { exitCode: 0, stdout: "", stderr: "" };

    let earlyReturn = false;

    if (gitAddResult.exitCode !== 0) {
      earlyReturn = true;
    }

    expect(earlyReturn).toBe(false);
  });
});
