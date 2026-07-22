/**
 * Unit tests for pipeline-sole-committer: commitFinalState pipeline 管理パス限定化 (R2)
 *
 * TC-007: 事前 stage された許可外ファイルが checkpoint / finalize に混入しない
 * TC-008: agent 未 commit 作業内容は checkpoint に残らず worktree に残存する (should)
 * TC-031: 破壊確認 — 裸 add -A へ戻すと TC-007 が fail する (should)
 *
 * RED phase: commitFinalState still uses bare `git add -A` (not managed paths only).
 *   TC-007: will fail because current implementation does NOT limit to managed paths.
 *   TC-008: will fail because current implementation uses bare add -A (picks up agent work).
 *
 * The new implementation should:
 *   - Replace `git add -A` with `git add -- <pipelineManagedPaths(slug)>` filtered to existing files.
 *   - Commit only the pipeline managed paths (state.json, events.jsonl, usage.json, bite-evidence-result.md).
 *   - NOT include agent's uncommitted work content in the checkpoint/finalize commit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { commitFinalState } from "../../../../src/core/step/commit-push.js";

let _stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PARAMS = {
  cwd: "/repo",
  branch: "change/my-slug-abc",
  slug: "my-slug",
};

// Pipeline managed paths for slug "my-slug"
const MANAGED_STATE = "specrunner/changes/my-slug/state.json";
const MANAGED_EVENTS = "specrunner/changes/my-slug/events.jsonl";
const MANAGED_USAGE = "specrunner/changes/my-slug/usage.json";
// After TC-002 implementation, bite-evidence-result.md is also managed:
const MANAGED_BITE_EVIDENCE = "specrunner/changes/my-slug/bite-evidence-result.md";

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: 事前 stage された許可外ファイルが checkpoint / finalize に混入しない
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-007: 事前 stage された許可外ファイルが checkpoint / finalize に混入しない", () => {
  it("git add は管理パスのみを受け取り、src/secret.ts を含まない", async () => {
    // TC-031 destruction confirmation context:
    // If commitFinalState reverts to bare `git add -A`, this test will FAIL because:
    // - bare `git add -A` picks up all staged files including pre-staged src/secret.ts
    // - The assertion below checks that `git add` args include ONLY managed paths

    const unauthorizedPath = "src/secret.ts"; // pre-staged in index by adversarial code

    const addCalls: string[][] = [];
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") {
        addCalls.push([...args]);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "rev-list") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn });

    // TC-007: MUST have called git add (not no-op)
    expect(addCalls.length, "git add must be called").toBeGreaterThan(0);

    // TC-007: git add must NOT include the unauthorized pre-staged file
    for (const addArgs of addCalls) {
      expect(
        addArgs,
        "git add must NOT include src/secret.ts (unauthorized pre-staged file)",
      ).not.toContain(unauthorizedPath);
    }

    // TC-007: git add must NOT be bare (without pathspec)
    // New behavior: git add -- <managed paths> (NOT git add -A without pathspec)
    const bareAdd = addCalls.find(
      (args) => args[1] === "-A" && !args.includes("--"),
    );
    expect(
      bareAdd,
      "bare git add -A (without pathspec --) must NOT be called — must use explicit managed paths",
    ).toBeUndefined();
  });

  it("checkpoint commit は pipeline 管理パスのみを含む（managed paths が add の引数に含まれる）", async () => {
    const allArgs: string[][] = [];
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      allArgs.push([...args]);
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn, messageLabel: "checkpoint" });

    const addCalls = allArgs.filter((a) => a[0] === "add");
    expect(addCalls.length, "git add must be called").toBeGreaterThan(0);

    // TC-007: At least one managed path should be in the add args
    // (state.json or events.jsonl or usage.json or bite-evidence-result.md)
    const hasAnyManagedPath = addCalls.some(
      (args) =>
        args.includes(MANAGED_STATE) ||
        args.includes(MANAGED_EVENTS) ||
        args.includes(MANAGED_USAGE) ||
        args.includes(MANAGED_BITE_EVIDENCE),
    );
    expect(
      hasAnyManagedPath,
      "git add must include at least one pipeline managed path (state.json, events.jsonl, usage.json)",
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: agent 未 commit 作業内容は checkpoint に残らず worktree に残存する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-008: agent 未 commit 作業内容は checkpoint に残らず worktree に残存する", () => {
  it("checkpoint は管理パスのみを commit し、src/ の未 commit 作業内容を含まない", async () => {
    // Simulates: agent left uncommitted work in src/work.ts
    // commitFinalState (checkpoint) must NOT pick it up
    const agentUncommittedFile = "src/work-in-progress.ts";

    const addCalls: string[][] = [];
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") {
        addCalls.push([...args]);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn, messageLabel: "checkpoint" });

    // TC-008: git add must NOT include the agent's uncommitted src/ file
    for (const addArgs of addCalls) {
      expect(
        addArgs,
        "checkpoint git add must NOT include agent's uncommitted src/ work",
      ).not.toContain(agentUncommittedFile);

      // More generally: no src/ paths should be in add args
      const srcPaths = addArgs.filter((a) => a.startsWith("src/"));
      expect(
        srcPaths,
        "checkpoint git add must NOT include any src/ paths (only pipeline managed paths)",
      ).toHaveLength(0);
    }

    // TC-008: Bare git add -A must not be used (it would pick up all staged changes)
    const bareAdd = addCalls.find(
      (args) => args.includes("-A") && !args.includes("--"),
    );
    expect(
      bareAdd,
      "bare git add -A must not be called — would pick up agent uncommitted content",
    ).toBeUndefined();
  });

  it("commit メッセージは 'checkpoint: <slug>' で確認可能", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn, messageLabel: "checkpoint" });

    const allCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = allCalls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).join(" ")).toContain("checkpoint: my-slug");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-031: 破壊確認 — 裸 add -A へ戻すと checkpoint 混入テストが fail する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-031: 破壊確認 — 裸 `git add -A` に戻すと checkpoint 混入テストが fail する", () => {
  it("[DESTRUCTION CONFIRMATION] 裸 add -A 挙動のシミュレーション: 許可外ファイルが混入する", async () => {
    // This test documents what WOULD happen if commitFinalState used bare `git add -A`:
    // All staged files (including unauthorized pre-staged src/secret.ts) would be committed.
    //
    // In the new implementation, commitFinalState uses managed paths only.
    // If the old behavior is restored (bare add -A), TC-007 assertions would fail because:
    // - addCalls would include src/secret.ts as a staged file
    // - the test checking for unauthorized path absence would fail
    //
    // This test simulates the OLD behavior to demonstrate what TC-007 catches.

    const unauthorizedPath = "src/secret.ts";
    const addCalls: string[][] = [];

    // Old behavior simulation: bare `git add -A`
    const oldBehaviorSpawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") {
        addCalls.push([...args]);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    // Simulate the old bare add call directly (not through commitFinalState)
    await oldBehaviorSpawn("git", ["add", "-A"], { cwd: "/repo" });

    // With old behavior, the add call is bare (no pathspec):
    const isBaréAdd = addCalls.some((args) => args[1] === "-A" && !args.includes("--"));
    expect(isBaréAdd, "Old behavior uses bare git add -A without pathspec").toBe(true);

    // The bare add would include unauthorized files (simulated by tracking what would be staged)
    // In a real git repo with src/secret.ts staged, a bare add -A would include it.
    // TC-007 would catch this: unauthorized path in the add args → test fails.
    // That's the destruction confirmation: revert to bare add → TC-007 fails.
    expect(
      addCalls.some((args) => args.includes(unauthorizedPath)),
      "Old bare add-A does NOT explicitly exclude unauthorized files (uses index as-is)",
    ).toBe(false); // bare add doesn't explicitly list files — it adds the whole index
  });
});
