/**
 * Unit tests for spawnBackground in src/util/spawn.ts.
 *
 * Validates:
 *   - Env strip: secrets are stripped from process.env; stdio=ignore; shell=false.
 *   - Kill idempotency: kill() called twice invokes underlying kill at most once.
 *   - onError plumbing: error listener is wired to opts.onError.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as childProcess from "node:child_process";

// Mock node:child_process so we can intercept spawn calls
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawnBackground } from "../../../src/util/spawn.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FakeChild = EventEmitter & {
  pid: number | undefined;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  stdout: null;
  stderr: null;
};

/**
 * Build a minimal fake ChildProcess suitable for mocking spawn.
 * Cast to unknown first to sidestep the full ChildProcess interface.
 */
function makeFakeChild(overrides: Partial<{
  pid: number | undefined;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
}> = {}): FakeChild {
  const emitter = new EventEmitter();
  const fakeChild = Object.assign(emitter, {
    pid: overrides.pid ?? 12345,
    kill: overrides.kill ?? vi.fn(),
    unref: overrides.unref ?? vi.fn(),
    stdout: null,
    stderr: null,
  }) as FakeChild;
  return fakeChild;
}

// ─── Saved process.env values ────────────────────────────────────────────────

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv["GH_TOKEN"] = process.env["GH_TOKEN"];
  savedEnv["ANTHROPIC_API_KEY"] = process.env["ANTHROPIC_API_KEY"];
  savedEnv["PATH"] = process.env["PATH"];

  process.env["GH_TOKEN"] = "ghp_test_secret";
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-secret";
  process.env["PATH"] = "/usr/local/bin:/usr/bin:/bin";

  vi.clearAllMocks();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
});

// ─── TC-SB-01: Env strip ─────────────────────────────────────────────────────

describe("TC-SB-01: spawnBackground strips secrets and passes correct stdio/shell", () => {
  it("captured spawn env has no secrets but retains PATH; stdio=ignore; shell=false", () => {
    let capturedOpts: Parameters<typeof childProcess.spawn>[2] | undefined;

    const fakeChild = makeFakeChild();
    vi.mocked(childProcess.spawn).mockImplementation(
      (_cmd: string, _args: readonly string[], opts?: unknown) => {
        capturedOpts = opts as Parameters<typeof childProcess.spawn>[2];
        return fakeChild as unknown as ReturnType<typeof childProcess.spawn>;
      },
    );

    const cwd = "/tmp/test-cwd";
    spawnBackground("caffeinate", ["-i"], { cwd });

    // spawn must have been called
    expect(childProcess.spawn).toHaveBeenCalledOnce();

    // Secrets must be stripped
    const env = capturedOpts?.env as Record<string, string | undefined> | undefined;
    expect(env?.["GH_TOKEN"]).toBeUndefined();
    expect(env?.["ANTHROPIC_API_KEY"]).toBeUndefined();

    // Benign env var must be retained
    expect(env?.["PATH"]).toBe("/usr/local/bin:/usr/bin:/bin");

    // stdio must be "ignore"
    expect(capturedOpts?.["stdio"]).toBe("ignore");

    // shell must be false
    expect(capturedOpts?.["shell"]).toBe(false);
  });
});

// ─── TC-SB-02: Kill idempotency ──────────────────────────────────────────────

describe("TC-SB-02: spawnBackground kill() is idempotent and never throws", () => {
  it("underlying kill is called at most once even if handle.kill() is called twice", () => {
    const underlyingKill = vi.fn();
    const fakeChild = makeFakeChild({ kill: underlyingKill });

    vi.mocked(childProcess.spawn).mockReturnValue(
      fakeChild as unknown as ReturnType<typeof childProcess.spawn>,
    );

    const handle = spawnBackground("caffeinate", ["-i"], { cwd: "/tmp" });

    handle.kill();
    handle.kill();

    expect(underlyingKill).toHaveBeenCalledTimes(1);
  });

  it("handle.kill() does not throw even if underlying kill throws", () => {
    const underlyingKill = vi.fn().mockImplementation(() => {
      throw new Error("ESRCH: no such process");
    });
    const fakeChild = makeFakeChild({ kill: underlyingKill });

    vi.mocked(childProcess.spawn).mockReturnValue(
      fakeChild as unknown as ReturnType<typeof childProcess.spawn>,
    );

    const handle = spawnBackground("caffeinate", ["-i"], { cwd: "/tmp" });

    // Must not throw
    expect(() => handle.kill()).not.toThrow();
  });
});

// ─── TC-SB-03: onError plumbing ──────────────────────────────────────────────

describe("TC-SB-03: spawnBackground wires opts.onError to the error listener", () => {
  it("error event on child process invokes opts.onError with the error", () => {
    // Capture the error listener by collecting what is registered on the fake child
    let capturedErrorListener: ((err: Error) => void) | undefined;

    const emitter = new EventEmitter();
    const fakeChild = Object.assign(emitter, {
      pid: 99,
      kill: vi.fn(),
      unref: vi.fn(),
      stdout: null,
      stderr: null,
    }) as FakeChild;

    // Spy on emitter.on to capture the "error" listener before wiring
    const originalOn = emitter.on.bind(emitter);
    vi.spyOn(emitter, "on").mockImplementation(
      (event: string | symbol, listener: (...args: unknown[]) => void) => {
        if (event === "error") {
          capturedErrorListener = listener as (err: Error) => void;
        }
        return originalOn(event as string, listener);
      },
    );

    vi.mocked(childProcess.spawn).mockReturnValue(
      fakeChild as unknown as ReturnType<typeof childProcess.spawn>,
    );

    const onError = vi.fn();
    spawnBackground("caffeinate", ["-i"], { cwd: "/tmp", onError });

    // Simulate an async ENOENT error event
    const spawnError = new Error("spawn caffeinate ENOENT");
    expect(capturedErrorListener).toBeDefined();
    capturedErrorListener!(spawnError);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(spawnError);
  });
});
