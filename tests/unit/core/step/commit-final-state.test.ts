/**
 * Unit tests for commitFinalState helper (T-01 / D5).
 *
 * TC-CFS-001: staged changes → returns the local finalize commit OID without pushing
 * TC-CFS-002: no staged changes → no commit, no push
 * TC-CFS-003: required state staging fails → typed stage failure
 * TC-CFS-004: publication retry failure → see publish-committed-branch.test.ts
 * TC-CFS-005: commit fails → typed commit failure, no push
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { commitFinalState } from "../../../../src/core/step/commit-push.js";

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PARAMS = { cwd: "/repo", branch: "change/my-slug-abc", slug: "my-slug", deferPublication: true };
const COMMIT_OID = "a".repeat(40);

// TC-CFS-001
describe("TC-CFS-001: staged changes → local commit only", () => {
  it("returns the finalize commit OID and leaves publication to the caller", async () => {
    const spawnImpl = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 0, stdout: "finalize: my-slug", stderr: "" };
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: COMMIT_OID, stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(commitFinalState({ ...PARAMS, spawnFn: spawnImpl }))
      .resolves.toEqual({ kind: "committed", oid: COMMIT_OID });

    const calls = (spawnImpl as ReturnType<typeof vi.fn>).mock.calls;
    const addCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "add");
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    const pushCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "push");

    expect(addCall).toBeDefined();
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).join(" ")).toContain("finalize: my-slug");
    expect(pushCall).toBeUndefined();
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

    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn }))
      .resolves.toEqual({ kind: "no-change" });

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    const pushCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "push");

    expect(commitCall).toBeUndefined();
    expect(pushCall).toBeUndefined();
  });
});

// TC-CFS-003
describe("TC-CFS-003: required state staging fails → typed stage failure", () => {
  it("reports staging failure without committing or publishing", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 128, stdout: "", stderr: "not a git repository" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn })).resolves.toEqual({
      kind: "failure", phase: "stage", error: "unable to stage final job state",
    });
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    // No commit or push called
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    expect(commitCall).toBeUndefined();
  });
});

// TC-CFS-006
describe("TC-CFS-006: messageLabel='checkpoint' → commit message 'checkpoint: <slug>'", () => {
  it("uses 'checkpoint: my-slug' as commit message when messageLabel is 'checkpoint'", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" }; // staged changes present
      if (args[0] === "commit") return { exitCode: 0, stdout: "ok", stderr: "" };
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: COMMIT_OID, stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn, messageLabel: "checkpoint" }))
      .resolves.toEqual({ kind: "committed", oid: COMMIT_OID });

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
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: COMMIT_OID, stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn }))
      .resolves.toEqual({ kind: "committed", oid: COMMIT_OID });

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "commit");
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).join(" ")).toContain("finalize: my-slug");
  });
});

// TC-CFS-005
describe("TC-CFS-005: commit fails → typed failure", () => {
  it("returns the commit failure and never pushes", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" };
      if (args[0] === "commit") return { exitCode: 1, stdout: "", stderr: "commit failed" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(commitFinalState({ ...PARAMS, spawnFn: spawn })).resolves.toEqual({
      kind: "failure", phase: "commit", error: "finalize commit failed",
    });
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls.some((call) => call[1][0] === "push")).toBe(false);

    // Should warn on stderr
    expect(stderrSpy).toHaveBeenCalled();
  });
});
