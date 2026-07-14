/**
 * Unit tests for LocalRuntime.listWorktreeChanges and commitRoundArtifacts.
 *
 * D3 (round-owned-git-effects): verifies the two new seams on LocalRuntime
 * that ParallelReviewRound uses to detect uncommitted worktree changes and
 * perform scoped staging after fan-out.
 *
 * All git I/O is stubbed via injected spawnFn so no real git process is spawned.
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { LocalRuntime } from "../local.js";
import { EventBus } from "../../event/event-bus.js";
import type { SpawnFn as UtilSpawnFn } from "../../../util/spawn.js";
import type { SpawnFn as GitExecSpawnFn } from "../../../util/git-exec.js";
import type { CommitPushInfra } from "../../step/commit-push.js";

// ---------------------------------------------------------------------------
// Helpers — util/spawn.ts SpawnFn (async)
// ---------------------------------------------------------------------------

function makeUtilSpawnFn(
  exitCode: number,
  stdout: string,
): UtilSpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr: "" }) as unknown as UtilSpawnFn;
}

function makeThrowingUtilSpawnFn(): UtilSpawnFn {
  return vi.fn().mockRejectedValue(new Error("spawn ENOENT")) as unknown as UtilSpawnFn;
}

function makeRuntime(spawnFn?: UtilSpawnFn): LocalRuntime {
  return new LocalRuntime({
    cwd: "/tmp/fake-repo",
    githubClient: {} as never,
    spawnFn,
  });
}

// ---------------------------------------------------------------------------
// Helpers — git-exec.ts SpawnFn (sync ChildProcess)
// ---------------------------------------------------------------------------

function makeInfra(gitExecSpawnFn: GitExecSpawnFn): CommitPushInfra {
  return {
    spawnFn: gitExecSpawnFn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
  };
}

const CWD = "/tmp/fake-worktree";

// ---------------------------------------------------------------------------
// listWorktreeChanges
// ---------------------------------------------------------------------------

describe("LocalRuntime.listWorktreeChanges — git fails", () => {
  it("git status exits non-zero → returns {kind:'unavailable'} with exit code in reason", async () => {
    const runtime = makeRuntime(makeUtilSpawnFn(1, ""));
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("1");
    }
  });

  it("spawnFn throws → catch → returns {kind:'unavailable'} with error message in reason", async () => {
    const runtime = makeRuntime(makeThrowingUtilSpawnFn());
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("spawn ENOENT");
    }
  });
});

describe("LocalRuntime.listWorktreeChanges — git succeeds", () => {
  it("empty output → returns {kind:'success', paths:[]}", async () => {
    const runtime = makeRuntime(makeUtilSpawnFn(0, ""));
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result).toEqual({ kind: "success", paths: [] });
  });

  it("single modified file → parsed correctly", async () => {
    // NUL-separated: " M path/to/file.ts\0"
    const runtime = makeRuntime(makeUtilSpawnFn(0, " M path/to/file.ts\0"));
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result).toEqual({ kind: "success", paths: ["path/to/file.ts"] });
  });

  it("multiple entries → all paths returned", async () => {
    const stdout = [
      " M specrunner/changes/x/result.md",
      "?? untracked.ts",
    ].join("\0") + "\0";
    const runtime = makeRuntime(makeUtilSpawnFn(0, stdout));
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.paths).toContain("specrunner/changes/x/result.md");
      expect(result.paths).toContain("untracked.ts");
      expect(result.paths).toHaveLength(2);
    }
  });

  it("entry shorter than 4 chars → skipped", async () => {
    // Part "M" (length 1) → skipped; only the valid entry is returned
    const stdout = "M\0 M src/foo.ts\0";
    const runtime = makeRuntime(makeUtilSpawnFn(0, stdout));
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result).toEqual({ kind: "success", paths: ["src/foo.ts"] });
  });

  it("deleted file entry → path returned", async () => {
    const stdout = "D  specrunner/changes/x/old.md\0";
    const runtime = makeRuntime(makeUtilSpawnFn(0, stdout));
    const result = await runtime.listWorktreeChanges(CWD);
    expect(result).toEqual({ kind: "success", paths: ["specrunner/changes/x/old.md"] });
  });
});

// ---------------------------------------------------------------------------
// commitRoundArtifacts
// ---------------------------------------------------------------------------

describe("LocalRuntime.commitRoundArtifacts — empty stagePaths", () => {
  it("empty stagePaths → no git calls (no-op)", async () => {
    const runtime = makeRuntime();
    // With empty stagePaths, commitScopedPaths returns before any git call.
    // Pass a dummy infra; if it were called, the test would fail with ENOENT.
    const gitSpawnFn = vi.fn() as unknown as GitExecSpawnFn;
    const infra = makeInfra(gitSpawnFn);
    await runtime.commitRoundArtifacts([], CWD, "change/x", "custom-reviewers", "x", infra);
    expect(gitSpawnFn).not.toHaveBeenCalled();
  });
});

describe("LocalRuntime.commitRoundArtifacts — with declared paths", () => {
  it("staged changes → commit message is '<coordinator>: <slug>'", async () => {
    const capturedCommitArgs: string[][] = [];
    const gitExecSpawnFn: GitExecSpawnFn = (_bin, args, _opts) => {
      capturedCommitArgs.push([...args]);
      const proc = new EventEmitter() as unknown as ChildProcess;
      const stdoutEE = new EventEmitter();
      const stderrEE = new EventEmitter();
      proc.stdout = stdoutEE as never;
      proc.stderr = stderrEE as never;
      proc.stdin = { end: () => {} } as never;
      // add → 0, diff → 1 (changes), commit → 0, push → 0
      const responses: Record<string, number> = {
        add: 0, diff: 1, commit: 0, push: 0,
      };
      const firstArg = args[0] ?? "unknown";
      const exitCode = responses[firstArg] ?? 0;
      setImmediate(() => proc.emit("close", exitCode));
      return proc;
    };

    const infra = makeInfra(gitExecSpawnFn);
    await runtime_with_infra(infra);

    // Verify commit message format
    const commitCall = capturedCommitArgs.find((a) => a[0] === "commit");
    expect(commitCall).toBeDefined();
    expect(commitCall).toContain("-m");
    expect(commitCall).toContain("custom-reviewers: my-feature");
  });

  async function runtime_with_infra(infra: CommitPushInfra) {
    const runtime = makeRuntime();
    await runtime.commitRoundArtifacts(
      ["specrunner/changes/my-feature/result.md"],
      CWD,
      "change/my-feature",
      "custom-reviewers",
      "my-feature",
      infra,
    );
  }

  it("delegates to commitScopedPaths with correct args (add uses pathspec)", async () => {
    const { fn, calls } = makeGitExecSpawnFnWithCalls([
      { exitCode: 0 }, // add
      { exitCode: 1 }, // diff: changes present
      { exitCode: 0 }, // commit
      { exitCode: 0 }, // push
    ]);
    const infra = makeInfra(fn);
    const runtime = makeRuntime();
    await runtime.commitRoundArtifacts(
      ["specrunner/changes/my-feature/result.md"],
      CWD,
      "change/my-feature",
      "custom-reviewers",
      "my-feature",
      infra,
    );
    // add call must have pathspec (-- <path>)
    const addCall = calls.find((c) => c[0] === "add");
    expect(addCall).toContain("--");
    expect(addCall).toContain("specrunner/changes/my-feature/result.md");
  });
});

function makeGitExecSpawnFnWithCalls(
  responses: Array<{ exitCode: number; stdout?: string }>,
): { fn: GitExecSpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  const fn = makeGitExecSpawnFnCapturing(responses, calls);
  return { fn, calls };
}

function makeGitExecSpawnFnCapturing(
  responses: Array<{ exitCode: number; stdout?: string }>,
  calls: string[][],
): GitExecSpawnFn {
  let idx = 0;
  return (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    const proc = new EventEmitter() as unknown as ChildProcess;
    const stdoutEE = new EventEmitter();
    proc.stdout = stdoutEE as never;
    proc.stderr = new EventEmitter() as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => {
      if (response.stdout) stdoutEE.emit("data", Buffer.from(response.stdout));
      proc.emit("close", response.exitCode);
    });
    return proc;
  };
}
