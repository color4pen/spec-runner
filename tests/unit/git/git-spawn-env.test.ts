/**
 * Env behavioral tests: src/git/* spawn calls pass stripSecrets env.
 *
 * TC-GIT-ENV-01: collectDynamicContext git log/diff spawns strip GH_TOKEN / ANTHROPIC_API_KEY
 * TC-GIT-ENV-02: getOriginInfo spawn strips GITHUB_TOKEN and preserves PATH
 * TC-GIT-ENV-03: createTransportAuth authArgs spawn strips GH_TOKEN
 *
 * These tests would fail against the pre-migration (env-omission) implementations
 * because those passed no env at all (inheriting full process.env including secrets).
 *
 * Approach: vi.mock("node:child_process") intercepts spawn (used by git-exec seam's
 * defaultSpawnFn). Env is captured from the opts argument on each spawn call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";

// Mock node:child_process.spawn — this is hoisted before any src imports.
// The git-exec seam's defaultSpawnFn = nodeSpawn will point to this mock.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

let tempDir: string;

// Saved process.env values to restore after each test.
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-git-spawn-env-test-"));
  vi.clearAllMocks();

  // Save originals and inject known secrets into process.env.
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "ANTHROPIC_API_KEY", "PATH"]) {
    savedEnv[key] = process.env[key];
  }
  process.env["GH_TOKEN"] = "ghp_test_secret";
  process.env["GITHUB_TOKEN"] = "github_pat_test_secret";
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-secret";
  process.env["PATH"] = process.env["PATH"] ?? "/usr/bin:/bin";
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();

  // Restore process.env.
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

/**
 * Build a mock ChildProcess that emits stdout data then closes with the given exit code.
 */
function makeMockChild(exitCode: number, stdout = "") {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void };
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: () => {} };

  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", exitCode);
  });

  return child;
}

// ---------------------------------------------------------------------------
// TC-GIT-ENV-01: dynamic-context — git log/diff spawns have no GH_TOKEN / ANTHROPIC_API_KEY
// ---------------------------------------------------------------------------
describe("TC-GIT-ENV-01: collectDynamicContext spawn env — secrets are stripped", () => {
  it("git log/diff spawns do not include GH_TOKEN or ANTHROPIC_API_KEY and preserve PATH", async () => {
    const capturedEnvs: Array<Record<string, string | undefined>> = [];

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((_cmd: string, _args: readonly string[], opts?: unknown) => {
      const spawnOpts = opts as { env?: Record<string, string | undefined> } | undefined;
      if (spawnOpts?.env) capturedEnvs.push(spawnOpts.env);
      return makeMockChild(0, "") as ReturnType<typeof childProcess.spawn>;
    });

    const { collectDynamicContext } = await import("../../../src/git/dynamic-context.js");
    await collectDynamicContext(tempDir, "main");

    // At least the git log and git diff spawns must have been called.
    expect(capturedEnvs.length).toBeGreaterThanOrEqual(2);

    // Every spawn env must not include secrets.
    for (const env of capturedEnvs) {
      expect(env["GH_TOKEN"]).toBeUndefined();
      expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
      // PATH is benign and must be preserved.
      expect(env["PATH"]).toBe(process.env["PATH"]);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-GIT-ENV-02: remote — getOriginInfo spawn has no GITHUB_TOKEN
// ---------------------------------------------------------------------------
describe("TC-GIT-ENV-02: getOriginInfo spawn env — GITHUB_TOKEN is stripped", () => {
  it("spawn env for git remote get-url does not include GITHUB_TOKEN and preserves PATH", async () => {
    let capturedEnv: Record<string, string | undefined> | undefined;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((_cmd: string, args: readonly string[], opts?: unknown) => {
      const spawnOpts = opts as { env?: Record<string, string | undefined> } | undefined;
      if (Array.isArray(args) && args.includes("get-url")) {
        capturedEnv = spawnOpts?.env;
        return makeMockChild(0, "https://github.com/o/r.git\n") as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "") as ReturnType<typeof childProcess.spawn>;
    });

    const { getOriginInfo } = await import("../../../src/git/remote.js");
    await getOriginInfo(tempDir);

    expect(capturedEnv).toBeDefined();
    expect(capturedEnv!["GITHUB_TOKEN"]).toBeUndefined();
    expect(capturedEnv!["PATH"]).toBe(process.env["PATH"]);
  });
});

// ---------------------------------------------------------------------------
// TC-GIT-ENV-03: transport-auth — authArgs spawn has no GH_TOKEN
// ---------------------------------------------------------------------------
describe("TC-GIT-ENV-03: createTransportAuth authArgs spawn env — GH_TOKEN is stripped", () => {
  it("spawn env for git remote get-url origin does not include GH_TOKEN", async () => {
    let capturedEnv: Record<string, string | undefined> | undefined;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((_cmd: string, args: readonly string[], opts?: unknown) => {
      const spawnOpts = opts as { env?: Record<string, string | undefined> } | undefined;
      if (Array.isArray(args) && args.includes("get-url")) {
        capturedEnv = spawnOpts?.env;
        return makeMockChild(0, "https://github.com/o/r.git\n") as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "") as ReturnType<typeof childProcess.spawn>;
    });

    const { createTransportAuth } = await import("../../../src/git/transport-auth.js");
    await createTransportAuth({ token: "t", cwd: tempDir }).authArgs();

    expect(capturedEnv).toBeDefined();
    expect(capturedEnv!["GH_TOKEN"]).toBeUndefined();
  });
});
