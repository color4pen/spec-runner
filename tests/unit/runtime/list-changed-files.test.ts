/**
 * T-06: listChangedFiles unit tests.
 *
 * - LocalRuntime: `git diff --name-only <base>...HEAD` output → string[]
 * - LocalRuntime: spawn failure / non-zero exit → []
 * - ManagedRuntime: always returns []
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
// LocalRuntime.listChangedFiles
// ---------------------------------------------------------------------------

describe("LocalRuntime.listChangedFiles", () => {
  it("parses git diff --name-only output into a path array", async () => {
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
    const files = await runtime.listChangedFiles("main", "/repo", null);
    expect(files).toEqual(["src/auth/login.ts", "lib/util.ts"]);
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

  it("returns [] when git exits non-zero", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const files = await runtime.listChangedFiles("main", "/repo", null);
    expect(files).toEqual([]);
  });

  it("returns [] when spawn throws", async () => {
    const spawnFn: SpawnFn = async () => {
      throw new Error("spawn failed");
    };
    const runtime = makeLocalRuntime(spawnFn);
    const files = await runtime.listChangedFiles("main", "/repo", null);
    expect(files).toEqual([]);
  });

  it("filters empty lines from output", async () => {
    const spawnFn: SpawnFn = async () => ({
      exitCode: 0,
      stdout: "\nsrc/auth.ts\n\nlib/util.ts\n",
      stderr: "",
    });
    const runtime = makeLocalRuntime(spawnFn);
    const files = await runtime.listChangedFiles("main", "/repo", null);
    expect(files).toEqual(["src/auth.ts", "lib/util.ts"]);
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime.listChangedFiles
// ---------------------------------------------------------------------------

describe("ManagedRuntime.listChangedFiles", () => {
  it("always returns []", async () => {
    const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = new ManagedRuntime(
      "/repo",
      stubSession,
      stubGithub,
      { owner: "owner", name: "repo" },
      noopSpawn,
      "token",
    );
    const files = await runtime.listChangedFiles("main", "/repo", "feat/test");
    expect(files).toEqual([]);
  });
});
