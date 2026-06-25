/**
 * Unit tests for src/util/git-exec.ts
 *
 * Verifies that runSubprocess (and the gitExec / gitExecExitCode wrappers) strip
 * secret environment variables before spawning child processes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { gitExec, gitExecExitCode } from "../../../src/util/git-exec.js";

/**
 * Create a spy SpawnFn that records the options it was called with and resolves
 * immediately with a successful result.
 */
function makeSpySpawnFn(capturedOpts: { env?: NodeJS.ProcessEnv }): (
  bin: string,
  args: string[],
  opts: SpawnOptions,
) => ChildProcess {
  return (_bin, _args, opts) => {
    capturedOpts.env = opts.env as NodeJS.ProcessEnv | undefined;

    const child = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: () => void };
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: () => {} };

    setImmediate(() => {
      child.stdout.emit("data", Buffer.from(""));
      child.emit("close", 0);
    });

    return child as unknown as ChildProcess;
  };
}

describe("gitExec env stripping", () => {
  const originalGhToken = process.env["GH_TOKEN"];
  const originalGithubToken = process.env["GITHUB_TOKEN"];
  const originalAnthropicKey = process.env["ANTHROPIC_API_KEY"];
  const originalPath = process.env["PATH"];

  beforeEach(() => {
    process.env["GH_TOKEN"] = "ghp_secret_token";
    process.env["GITHUB_TOKEN"] = "github_pat_secret";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-secret";
    process.env["PATH"] = process.env["PATH"] ?? "/usr/bin";
  });

  afterEach(() => {
    if (originalGhToken === undefined) {
      delete process.env["GH_TOKEN"];
    } else {
      process.env["GH_TOKEN"] = originalGhToken;
    }
    if (originalGithubToken === undefined) {
      delete process.env["GITHUB_TOKEN"];
    } else {
      process.env["GITHUB_TOKEN"] = originalGithubToken;
    }
    if (originalAnthropicKey === undefined) {
      delete process.env["ANTHROPIC_API_KEY"];
    } else {
      process.env["ANTHROPIC_API_KEY"] = originalAnthropicKey;
    }
    if (originalPath === undefined) {
      delete process.env["PATH"];
    } else {
      process.env["PATH"] = originalPath;
    }
  });

  it("gitExec: opts.env does not contain GH_TOKEN when set in process.env", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = makeSpySpawnFn(capturedOpts);

    await gitExec(spyFn, "/tmp", ["status"]);

    expect(capturedOpts.env).toBeDefined();
    expect(capturedOpts.env?.["GH_TOKEN"]).toBeUndefined();
  });

  it("gitExec: opts.env does not contain GITHUB_TOKEN when set in process.env", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = makeSpySpawnFn(capturedOpts);

    await gitExec(spyFn, "/tmp", ["status"]);

    expect(capturedOpts.env?.["GITHUB_TOKEN"]).toBeUndefined();
  });

  it("gitExec: opts.env does not contain ANTHROPIC_API_KEY when set in process.env", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = makeSpySpawnFn(capturedOpts);

    await gitExec(spyFn, "/tmp", ["status"]);

    expect(capturedOpts.env?.["ANTHROPIC_API_KEY"]).toBeUndefined();
  });

  it("gitExec: PATH is preserved in opts.env (benign variable regression)", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = makeSpySpawnFn(capturedOpts);

    await gitExec(spyFn, "/tmp", ["status"]);

    expect(capturedOpts.env?.["PATH"]).toBe(process.env["PATH"]);
  });

  it("gitExecExitCode: opts.env does not contain GH_TOKEN when set in process.env", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = makeSpySpawnFn(capturedOpts);

    await gitExecExitCode(spyFn, "/tmp", ["status"]);

    expect(capturedOpts.env?.["GH_TOKEN"]).toBeUndefined();
  });

  it("gitExecExitCode: PATH is preserved in opts.env (benign variable regression)", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = makeSpySpawnFn(capturedOpts);

    await gitExecExitCode(spyFn, "/tmp", ["status"]);

    expect(capturedOpts.env?.["PATH"]).toBe(process.env["PATH"]);
  });
});
