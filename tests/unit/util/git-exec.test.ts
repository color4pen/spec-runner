/**
 * Unit tests for src/util/git-exec.ts
 *
 * Verifies that runSubprocess (and the gitExec / gitExecExitCode wrappers) strip
 * secret environment variables before spawning child processes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { gitExec, gitExecExitCode, gitExecResult } from "../../../src/util/git-exec.js";

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

describe("gitExecResult — spawn success / failure separation", () => {
  it("returns { ok: true, exitCode } on spawn success with exit code 0", async () => {
    const spawnFn = (_bin: string, _args: string[], _opts: SpawnOptions): ChildProcess => {
      const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: () => void };
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: () => {} };
      setImmediate(() => { child.emit("close", 0); });
      return child as unknown as ChildProcess;
    };

    const result = await gitExecResult(spawnFn, "/tmp", ["status"]);
    expect(result).toEqual({ ok: true, exitCode: 0 });
  });

  it("returns { ok: true, exitCode: 1 } on spawn success with exit code 1", async () => {
    const spawnFn = (_bin: string, _args: string[], _opts: SpawnOptions): ChildProcess => {
      const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: () => void };
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: () => {} };
      setImmediate(() => { child.emit("close", 1); });
      return child as unknown as ChildProcess;
    };

    const result = await gitExecResult(spawnFn, "/tmp", ["diff", "--cached", "--quiet"]);
    expect(result).toEqual({ ok: true, exitCode: 1 });
  });

  it("returns { ok: true, exitCode: 128 } on spawn success with exit code 128", async () => {
    const spawnFn = (_bin: string, _args: string[], _opts: SpawnOptions): ChildProcess => {
      const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: () => void };
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: () => {} };
      setImmediate(() => { child.emit("close", 128); });
      return child as unknown as ChildProcess;
    };

    const result = await gitExecResult(spawnFn, "/tmp", ["add", "-A"]);
    expect(result).toEqual({ ok: true, exitCode: 128 });
  });

  it("returns { ok: false, exitCode: -1 } on spawn error (does not throw)", async () => {
    const spawnFn = (_bin: string, _args: string[], _opts: SpawnOptions): ChildProcess => {
      const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: () => void };
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: () => {} };
      setImmediate(() => { child.emit("error", new Error("ENOENT: git not found")); });
      return child as unknown as ChildProcess;
    };

    // Must not throw
    const result = await gitExecResult(spawnFn, "/tmp", ["status"]);
    expect(result).toEqual({ ok: false, exitCode: -1 });
  });

  it("gitExecResult: opts.env does not contain GH_TOKEN (env stripping regression)", async () => {
    const capturedOpts: { env?: NodeJS.ProcessEnv } = {};
    const spyFn = (_bin: string, _args: string[], opts: SpawnOptions): ChildProcess => {
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

    await gitExecResult(spyFn, "/tmp", ["status"]);
    expect(capturedOpts.env?.["GH_TOKEN"]).toBeUndefined();
    expect(capturedOpts.env?.["PATH"]).toBe(process.env["PATH"]);
  });
});
