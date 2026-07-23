/**
 * Unit tests for commitFinalState helper (T-01 / D5).
 *
 * TC-CFS-001: staged changes → commits "finalize: <slug>" and pushes
 * TC-CFS-002: no staged changes → no commit, no push
 * TC-CFS-003: git add fails → silently skips
 * TC-CFS-004: push fails twice → warns on stderr, does NOT throw
 * TC-CFS-005: commit fails → warns on stderr, does NOT throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { SpawnResult } from "../../../../src/util/spawn.js";
import { commitFinalState } from "../../../../src/core/step/commit-push.js";

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSpawnSequence(results: Array<Partial<SpawnResult>>): SpawnFn {
  const fn = vi.fn();
  for (const r of results) {
    fn.mockResolvedValueOnce({ exitCode: r.exitCode ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" });
  }
  // Default fallback
  fn.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  return fn as unknown as SpawnFn;
}

const PARAMS = { cwd: "/repo", branch: "change/my-slug-abc", slug: "my-slug" };

// TC-CFS-001
describe("TC-CFS-001: staged changes → commit + push", () => {
  it("calls git add -A, git commit with finalize message, and git push", async () => {
    // add: exit 0, diff: exit 1 (staged), commit: exit 0, push: exit 0
    const _spawn = makeSpawnSequence([
      { exitCode: 0 }, // git add -A
      { exitCode: 1 }, // git diff --cached --quiet (staged changes present)
      { exitCode: 0 }, // git commit -m "finalize: my-slug" — stdout needed for gitExec
      { exitCode: 0 }, // git push origin change/my-slug-abc
    ]);

    // gitExec returns stdout on exit 0 - mock needs to return stdout for commit
    // Patch: the spawn mock returns stdout for the commit call
    const spawnImpl = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "finalize: my-slug", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawnImpl });

    const calls = (spawnImpl as ReturnType<typeof vi.fn>).mock.calls;
    const addCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "add");
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    const pushCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "push");

    expect(addCall).toBeDefined();
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).join(" ")).toContain("finalize: my-slug");
    expect(pushCall).toBeDefined();
    expect((pushCall![1] as string[])).toContain("change/my-slug-abc");
    // -u binds the worktree branch's upstream to the feature branch itself
    // (branches are created with --no-track, so nothing else sets it).
    expect((pushCall![1] as string[])).toContain("-u");
  });
});

// TC-CFS-002
describe("TC-CFS-002: no staged changes → no commit, no push", () => {
  it("exits early when git diff --cached --quiet exits 0 (no staged changes)", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 0, stdout: "", stderr: "" }; // no staged changes
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn });

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    const pushCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "push");

    expect(commitCall).toBeUndefined();
    expect(pushCall).toBeUndefined();
  });
});

// TC-CFS-003
describe("TC-CFS-003: git add fails → silently skips", () => {
  it("returns without error when git add -A exits non-zero", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 128, stdout: "", stderr: "not a git repository" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    // Should not throw
    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn })).resolves.toBeUndefined();

    // No commit or push called
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    expect(commitCall).toBeUndefined();
  });
});

// TC-CFS-004
describe("TC-CFS-004: push fails twice → warns, does NOT throw", () => {
  it("warns on stderr and resolves when both push attempts fail", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 1, stdout: "", stderr: "push failed" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    // Should NOT throw
    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn })).resolves.toBeUndefined();

    // Should warn on stderr
    expect(stderrSpy).toHaveBeenCalled();
    const warnMsg = (stderrSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(warnMsg).toContain("my-slug");
  });
});

// TC-CFS-006
describe("TC-CFS-006: messageLabel='checkpoint' → commit message 'checkpoint: <slug>'", () => {
  it("uses 'checkpoint: my-slug' as commit message when messageLabel is 'checkpoint'", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" }; // staged changes present
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn, messageLabel: "checkpoint" });

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).join(" ")).toContain("checkpoint: my-slug");
    expect((commitCall![1] as string[]).join(" ")).not.toContain("finalize:");
  });

  it("defaults to 'finalize: <slug>' when messageLabel is omitted", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await commitFinalState({ ...PARAMS, spawnFn: spawn }); // no messageLabel

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).join(" ")).toContain("finalize: my-slug");
  });
});

// TC-CFS-005
describe("TC-CFS-005: commit fails → warns, does NOT throw", () => {
  it("warns on stderr and resolves when git commit fails", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 1, stdout: "", stderr: "commit failed" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    // Should NOT throw
    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn })).resolves.toBeUndefined();

    // Should warn on stderr
    expect(stderrSpy).toHaveBeenCalled();
  });
});
