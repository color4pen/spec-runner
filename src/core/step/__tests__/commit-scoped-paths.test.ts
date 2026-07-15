/**
 * Unit tests for commitScopedPaths in commit-push.ts.
 *
 * D3 (round-owned-git-effects): verifies that scoped staging never calls
 * `git add -A` without a pathspec, and handles all branches correctly.
 *
 * Branches under test:
 *   1. stagePaths empty → no-op (no git calls)
 *   2. git add exits non-zero → throws commitEffectFailedError (COMMIT_AND_PUSH_FAILED)
 *   3. git add succeeds, no staged changes (diff exit 0) → return without commit
 *   4. git add succeeds, staged changes (diff exit 1) → commit + push
 *   5. git diff exits ≥2 → throws COMMIT_AND_PUSH_FAILED (not treated as "no changes")
 *   6. git commit exits non-zero → throws COMMIT_AND_PUSH_FAILED, push NOT called
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { commitScopedPaths } from "../commit-push.js";
import { EventBus } from "../../event/event-bus.js";
import type { SpawnFn } from "../../../util/git-exec.js";
import type { CommitPushInfra } from "../commit-push.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a git-exec.ts SpawnFn that returns fake ChildProcess instances.
 * Each call to the SpawnFn consumes the next entry from `responses`.
 * `calls` accumulates the args[] passed to each call for assertion.
 */
function makeGitSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  let idx = 0;
  const fn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    const proc = new EventEmitter() as unknown as ChildProcess;
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    proc.stdout = stdoutEE as never;
    proc.stderr = stderrEE as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => {
      if (response.stdout) stdoutEE.emit("data", Buffer.from(response.stdout));
      if (response.stderr) stderrEE.emit("data", Buffer.from(response.stderr));
      proc.emit("close", response.exitCode);
    });
    return proc;
  };
  return { fn, calls };
}

function makeInfra(gitSpawnFn: SpawnFn): CommitPushInfra {
  return {
    spawnFn: gitSpawnFn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
  };
}

const CWD = "/tmp/fake-repo";
const BRANCH = "change/my-feature";
const COMMIT_MSG = "custom-reviewers: my-feature";
const PATH_A = "specrunner/changes/my-feature/result-001.md";
const PATH_B = "specrunner/changes/my-feature/result-002.md";

// ---------------------------------------------------------------------------
// Branch 1: empty stagePaths → no-op
// ---------------------------------------------------------------------------

describe("commitScopedPaths — empty stagePaths → no git calls", () => {
  it("returns immediately without calling spawnFn", async () => {
    const { fn, calls } = makeGitSpawnFn([]);
    await commitScopedPaths([], CWD, BRANCH, COMMIT_MSG, makeInfra(fn));
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Branch 2: git add exits non-zero → throws COMMIT_AND_PUSH_FAILED
// ---------------------------------------------------------------------------

describe("commitScopedPaths — git add fails → throws COMMIT_AND_PUSH_FAILED", () => {
  it("exits non-zero on add → throws, no diff, no commit, no push", async () => {
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 128 }, // git add -A -- <paths> fails
    ]);
    await expect(
      commitScopedPaths([PATH_A], CWD, BRANCH, COMMIT_MSG, makeInfra(fn)),
    ).rejects.toMatchObject({ code: "COMMIT_AND_PUSH_FAILED" });
    // Only the add call should have been made
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("add");
    expect(calls[0]).toContain(PATH_A);
  });

  it("add args include -- pathspec separator (not git add -A without pathspec)", async () => {
    const { fn, calls } = makeGitSpawnFn([{ exitCode: 128 }]);
    await expect(
      commitScopedPaths([PATH_A, PATH_B], CWD, BRANCH, COMMIT_MSG, makeInfra(fn)),
    ).rejects.toMatchObject({ code: "COMMIT_AND_PUSH_FAILED" });
    const addCall = calls[0]!;
    // Must have: ["add", "-A", "--", PATH_A, PATH_B]
    expect(addCall[0]).toBe("add");
    expect(addCall[1]).toBe("-A");
    expect(addCall[2]).toBe("--");
    expect(addCall).toContain(PATH_A);
    expect(addCall).toContain(PATH_B);
    // Must NOT be plain "git add -A" (no pathspec)
    expect(addCall).not.toEqual(["add", "-A"]);
  });
});

// ---------------------------------------------------------------------------
// Branch 3: git add succeeds, no staged changes (diff exit 0) → no commit
// ---------------------------------------------------------------------------

describe("commitScopedPaths — add ok, no staged changes → no commit", () => {
  it("diff --cached --quiet exits 0 → returns without committing", async () => {
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 0 }, // git add succeeds
      { exitCode: 0 }, // git diff --cached --quiet: exit 0 = no changes
    ]);
    await commitScopedPaths([PATH_A], CWD, BRANCH, COMMIT_MSG, makeInfra(fn));
    // Should have made exactly 2 git calls (add + diff), no commit or push
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toBe("add");
    expect(calls[1]).toContain("diff");
  });
});

// ---------------------------------------------------------------------------
// Branch 4: git add succeeds, staged changes → commit + push
// ---------------------------------------------------------------------------

describe("commitScopedPaths — staged changes → commit and push", () => {
  it("diff exit 1 → commits with the given message and pushes to branch", async () => {
    const events = new EventBus();
    const pushEmitted: unknown[] = [];
    events.on("commit:push", (payload) => pushEmitted.push(payload));

    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 0 },                      // git add -A -- <paths>
      { exitCode: 1 },                      // git diff --cached --quiet: exit 1 = changes present
      { exitCode: 0, stdout: "sha123\n" },  // git commit -m ...
      { exitCode: 0 },                      // git push origin <branch>
    ]);
    const infra: CommitPushInfra = {
      spawnFn: fn,
      sleepFn: vi.fn(async () => {}),
      events,
    };

    await commitScopedPaths([PATH_A], CWD, BRANCH, COMMIT_MSG, infra);

    // commit call uses the provided message
    const commitCall = calls.find((c) => c[0] === "commit");
    expect(commitCall).toContain("-m");
    expect(commitCall).toContain(COMMIT_MSG);

    // push call targets the correct branch
    const pushCall = calls.find((c) => c[0] === "push");
    expect(pushCall).toContain("push");
    expect(pushCall).toContain(BRANCH);

    // commit:push event is emitted on success
    expect(pushEmitted).toHaveLength(1);
  });

  it("stagePaths are limited to declared paths (never bare git add -A)", async () => {
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 0 }, // add
      { exitCode: 1 }, // diff: changes
      { exitCode: 0 }, // commit
      { exitCode: 0 }, // push
    ]);
    await commitScopedPaths([PATH_A, PATH_B], CWD, BRANCH, COMMIT_MSG, makeInfra(fn));

    const addCall = calls[0]!;
    // add -A -- PATH_A PATH_B (pathspec-limited)
    expect(addCall).toEqual(["add", "-A", "--", PATH_A, PATH_B]);
  });
});

// ---------------------------------------------------------------------------
// Branch 5: git diff exits ≥2 → throws COMMIT_AND_PUSH_FAILED
// ---------------------------------------------------------------------------

describe("commitScopedPaths — git diff exits ≥2 → throws COMMIT_AND_PUSH_FAILED", () => {
  it("diff exit 128 → throws, does not proceed to commit or push", async () => {
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 0 },   // git add succeeds
      { exitCode: 128 }, // git diff --cached --quiet: git error (not 0 or 1)
    ]);
    await expect(
      commitScopedPaths([PATH_A], CWD, BRANCH, COMMIT_MSG, makeInfra(fn)),
    ).rejects.toMatchObject({ code: "COMMIT_AND_PUSH_FAILED" });

    // Two git calls: add + diff; commit and push must NOT have been called
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toBe("add");
    expect(calls[1]).toContain("diff");
    const subcommands = calls.map((c) => c[0]);
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
  });

  it("diff exit 2 → throws (minimum ≥2 boundary)", async () => {
    const { fn } = makeGitSpawnFn([
      { exitCode: 0 }, // add
      { exitCode: 2 }, // diff: exit 2 = error (not 0=no-change, not 1=has-changes)
    ]);
    await expect(
      commitScopedPaths([PATH_A], CWD, BRANCH, COMMIT_MSG, makeInfra(fn)),
    ).rejects.toMatchObject({ code: "COMMIT_AND_PUSH_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// Branch 6: git commit exits non-zero → throws COMMIT_AND_PUSH_FAILED, push NOT called
// ---------------------------------------------------------------------------

describe("commitScopedPaths — git commit fails → throws COMMIT_AND_PUSH_FAILED, push not called", () => {
  it("commit exit non-zero → throws, push is NOT called", async () => {
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 0 }, // git add succeeds
      { exitCode: 1 }, // git diff: staged changes present
      { exitCode: 1 }, // git commit fails
    ]);
    await expect(
      commitScopedPaths([PATH_A], CWD, BRANCH, COMMIT_MSG, makeInfra(fn)),
    ).rejects.toMatchObject({ code: "COMMIT_AND_PUSH_FAILED" });

    const subcommands = calls.map((c) => c[0]);
    // add, diff, commit were called; push must NOT have been called
    expect(subcommands).toContain("add");
    expect(subcommands).toContain("diff");
    expect(subcommands).toContain("commit");
    expect(subcommands).not.toContain("push");
  });
});
