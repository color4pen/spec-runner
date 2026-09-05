/**
 * Unit tests for src/core/artifact-output/guarded-spawn.ts
 *
 * TC-002: guarded seam を通じた git 呼び出しが fail-closed になる
 * TC-057: guarded spawn が git・gh 以外のコマンドを inner spawn へ委譲する
 * TC-058: guarded spawn のエラーメッセージが agent subprocess 境界の説明を含む
 */
import { describe, it, expect, vi } from "vitest";
import { createGitDenyingSpawn } from "../guarded-spawn.js";
import type { SpawnFn } from "../../../util/spawn.js";

function makeMockSpawn(): { fn: SpawnFn; calls: string[] } {
  const calls: string[] = [];
  const fn: SpawnFn = (cmd, _args, _opts) => {
    calls.push(cmd);
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  };
  return { fn, calls };
}

// ─── TC-002: git invocation fails closed ──────────────────────────────────────

describe("TC-002: guarded spawn blocks git and gh", () => {
  it("throws when 'git' is invoked", () => {
    const { fn } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    expect(() => guarded("git", ["status"], { cwd: "/tmp" })).toThrow();
  });

  it("throws when 'git' is invoked as full path", () => {
    const { fn } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    expect(() => guarded("/usr/bin/git", ["status"], { cwd: "/tmp" })).toThrow();
  });

  it("throws when 'gh' is invoked", () => {
    const { fn } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    expect(() => guarded("gh", ["pr", "create"], { cwd: "/tmp" })).toThrow();
  });

  it("throws when 'gh' is invoked as full path", () => {
    const { fn } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    expect(() => guarded("/usr/local/bin/gh", ["pr", "create"], { cwd: "/tmp" })).toThrow();
  });
});

// ─── TC-057: other commands delegated to inner ────────────────────────────────

describe("TC-057: non-git commands are delegated to inner spawn", () => {
  it("'node' command is passed to inner", async () => {
    const { fn, calls } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    await guarded("node", ["-e", "1"], { cwd: "/tmp" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("node");
  });

  it("'bun' command is passed to inner", async () => {
    const { fn, calls } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    await guarded("bun", ["run", "test"], { cwd: "/tmp" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("bun");
  });

  it("passes same arguments to inner", async () => {
    const { fn } = makeMockSpawn();
    const innerSpy = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const guarded = createGitDenyingSpawn(innerSpy as unknown as SpawnFn);
    const opts = { cwd: "/tmp" };
    await guarded("node", ["-e", "1+1"], opts);
    expect(innerSpy).toHaveBeenCalledWith("node", ["-e", "1+1"], opts);
  });
});

// ─── TC-058: error message includes agent subprocess mention ──────────────────

describe("TC-058: error message includes agent subprocess boundary explanation", () => {
  it("error message contains 'agent subprocess'", () => {
    const { fn } = makeMockSpawn();
    const guarded = createGitDenyingSpawn(fn);
    let errorMessage = "";
    try {
      guarded("git", ["status"], { cwd: "/tmp" });
    } catch (err) {
      errorMessage = (err as Error).message;
    }
    expect(errorMessage).toContain("agent subprocess");
  });
});
