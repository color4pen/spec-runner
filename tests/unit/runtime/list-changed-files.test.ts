/**
 * T-06: listChangedFiles unit tests.
 *
 * - LocalRuntime: `git diff --name-only <base>...HEAD` output → {kind:"success", files}
 * - LocalRuntime: non-zero exit → {kind:"unavailable"} (NOT success-empty)
 * - LocalRuntime: spawn throw → {kind:"unavailable"} (NOT success-empty)
 * - ManagedRuntime: always returns {kind:"unavailable"}
 */
import { describe, it, expect } from "vitest";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import type { GitHubClient } from "../../../src/core/port/github-client.js";
import type { SessionClient } from "../../../src/core/port/session-client.js";

// Minimal stub GitHubClient
const stubGithub = {} as GitHubClient;

// Minimal stub SessionClient
const stubSession = {} as SessionClient;

function makeLocalRuntime(spawnFn: SpawnFn): LocalRuntime {
  return new LocalRuntime({
    cwd: "/repo",
    githubClient: stubGithub,
    githubToken: "token",
    owner: "owner",
    repo: "repo",
    spawnFn,
  });
}

// ---------------------------------------------------------------------------
// LocalRuntime.listChangedFiles — success path
// ---------------------------------------------------------------------------

describe("LocalRuntime.listChangedFiles — success", () => {
  it("parses git diff --name-only output into {kind:'success', files} DU", async () => {
    const spawnFn: SpawnFn = async (_cmd, args, _opts) => {
      if (args[0] === "diff" && args[1] === "--name-only") {
        return {
          exitCode: 0,
          stdout: "src/auth/login.ts\nlib/util.ts\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("unreachable");
    expect(result.files).toEqual(["src/auth/login.ts", "lib/util.ts"]);
  });

  it("passes <base>...HEAD to git diff", async () => {
    let capturedArgs: string[] = [];
    const spawnFn: SpawnFn = async (_cmd, args, _opts) => {
      capturedArgs = args as string[];
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const runtime = makeLocalRuntime(spawnFn);
    await runtime.listChangedFiles("develop", "/repo", null);
    expect(capturedArgs).toContain("develop...HEAD");
  });

  it("filters empty lines from output", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 0,
      stdout: "\nsrc/auth.ts\n\nlib/util.ts\n",
      stderr: "",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("unreachable");
    expect(result.files).toEqual(["src/auth.ts", "lib/util.ts"]);
  });

  it("empty output → {kind:'success', files:[]} (not unavailable)", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("unreachable");
    expect(result.files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LocalRuntime.listChangedFiles — failure paths (new: unavailable, NOT success-empty)
// ---------------------------------------------------------------------------

describe("LocalRuntime.listChangedFiles — non-zero exit → unavailable (fail-closed)", () => {
  it("returns {kind:'unavailable'} when git exits non-zero (was: returns [])", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    expect(result.kind).toBe("unavailable");
  });

  it("reason includes exit code on non-zero exit", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    if (result.kind !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toContain("128");
  });

  it("does NOT return success-empty on non-zero exit (key regression guard)", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "error",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    // Must NOT be success — that would be the old fail-open behaviour
    expect(result.kind).not.toBe("success");
  });
});

describe("LocalRuntime.listChangedFiles — spawn throw → unavailable (fail-closed)", () => {
  it("returns {kind:'unavailable'} when spawn throws (was: returns [])", async () => {
    const spawnFn: SpawnFn = async () => {
      throw new Error("spawn failed");
    };
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    expect(result.kind).toBe("unavailable");
  });

  it("reason includes error message on spawn throw", async () => {
    const spawnFn: SpawnFn = async () => {
      throw new Error("spawn failed");
    };
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    if (result.kind !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toContain("spawn failed");
  });

  it("does NOT return success-empty on spawn throw (key regression guard)", async () => {
    const spawnFn: SpawnFn = async () => {
      throw new Error("unexpected error");
    };
    const runtime = makeLocalRuntime(spawnFn);
    const result = await runtime.listChangedFiles("main", "/repo", null);
    expect(result.kind).not.toBe("success");
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime.listChangedFiles — always unavailable (new: not [])
// ---------------------------------------------------------------------------

describe("ManagedRuntime.listChangedFiles — always unavailable", () => {
  it("returns {kind:'unavailable'} (was: always returns [])", async () => {
    const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = new ManagedRuntime(
      "/repo",
      stubSession,
      stubGithub,
      { owner: "owner", name: "repo" },
      noopSpawn,
      "token",
    );
    const result = await runtime.listChangedFiles("main", "/repo", "feat/test");
    expect(result.kind).toBe("unavailable");
  });

  it("reason mentions no local worktree", async () => {
    const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = new ManagedRuntime(
      "/repo",
      stubSession,
      stubGithub,
      { owner: "owner", name: "repo" },
      noopSpawn,
      "token",
    );
    const result = await runtime.listChangedFiles("main", "/repo", "feat/test");
    if (result.kind !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toContain("managed");
  });

  it("does NOT return success-empty (key regression guard)", async () => {
    const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = new ManagedRuntime(
      "/repo",
      stubSession,
      stubGithub,
      { owner: "owner", name: "repo" },
      noopSpawn,
      "token",
    );
    const result = await runtime.listChangedFiles("main", "/repo", "feat/test");
    expect(result.kind).not.toBe("success");
  });
});

// ---------------------------------------------------------------------------
// T-02: canDeriveChangedFiles predicate (unchanged)
// ---------------------------------------------------------------------------

describe("LocalRuntime.canDeriveChangedFiles", () => {
  it("returns true (local runtime has git worktree and can run git diff)", () => {
    const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = makeLocalRuntime(noopSpawn);
    expect(runtime.canDeriveChangedFiles()).toBe(true);
  });
});

describe("ManagedRuntime.canDeriveChangedFiles", () => {
  it("returns false (managed runtime has no local worktree, cannot derive changed files)", () => {
    const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = new ManagedRuntime(
      "/repo",
      stubSession,
      stubGithub,
      { owner: "owner", name: "repo" },
      noopSpawn,
      "token",
    );
    expect(runtime.canDeriveChangedFiles()).toBe(false);
  });
});
