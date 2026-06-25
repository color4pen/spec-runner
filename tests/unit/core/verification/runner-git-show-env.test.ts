/**
 * Unit tests: verification runner's `git show` spawn uses stripSecrets env.
 *
 * TC-ENV-01: git show spawn does not include GH_TOKEN when set in process.env
 * TC-ENV-02: git show spawn does not include GITHUB_TOKEN when set in process.env
 * TC-ENV-03: PATH is preserved in the env passed to git show (benign var regression)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";

// Mock child_process.spawn to intercept the git show spawn and capture env.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock runTestCoveragePhase to avoid filesystem reads for test-cases.md.
vi.mock("../../../../src/core/verification/test-coverage.js", () => ({
  runTestCoveragePhase: vi.fn(),
}));

import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

// Saved process.env values to restore after each test.
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-gitshow-env-test-"));
  await fs.mkdir(path.join(tempDir, "specrunner", "changes", "my-change"), { recursive: true });
  vi.clearAllMocks();

  // Default: test-coverage returns "skipped"
  vi.mocked(runTestCoveragePhase).mockResolvedValue({
    status: "skipped",
    missingTcIds: [],
    assertionlessTcIds: [],
    totalMustTcs: 0,
    foundTcIds: [],
    stdout: "test-cases.md not found",
  });

  // Save originals and inject known secrets into process.env
  savedEnv["GH_TOKEN"] = process.env["GH_TOKEN"];
  savedEnv["GITHUB_TOKEN"] = process.env["GITHUB_TOKEN"];
  savedEnv["ANTHROPIC_API_KEY"] = process.env["ANTHROPIC_API_KEY"];
  savedEnv["PATH"] = process.env["PATH"];

  process.env["GH_TOKEN"] = "ghp_test_secret";
  process.env["GITHUB_TOKEN"] = "github_pat_test_secret";
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-secret";
  process.env["PATH"] = process.env["PATH"] ?? "/usr/bin:/bin";
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();

  // Restore process.env
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

/**
 * Build a mock child process that emits stdout data and closes with given exit code.
 */
function makeMockChild(exitCode: number, stdout = "") {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", exitCode);
  });

  return child;
}

/**
 * Shared package.json data for integrity check tests.
 */
const baselinePackageJson = JSON.stringify({ name: "test-pkg", scripts: { build: "tsc" } });

describe("TC-ENV-01: git show spawn env — GH_TOKEN is stripped", () => {
  it("the env argument passed to spawn('git', ['show', ...]) does not contain GH_TOKEN", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      baselinePackageJson,
      "utf-8",
    );

    let capturedGitShowEnv: Record<string, string | undefined> | undefined;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[], opts?: unknown) => {
      const spawnOpts = opts as { env?: Record<string, string | undefined> } | undefined;
      if (cmd === "git" && Array.isArray(args) && args[0] === "show") {
        capturedGitShowEnv = spawnOpts?.env;
        return makeMockChild(0, baselinePackageJson) as ReturnType<typeof childProcess.spawn>;
      }
      // Any other spawn (bun run) → success
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir, undefined, "main");

    // The git show spawn must have been called
    expect(capturedGitShowEnv).toBeDefined();
    // GH_TOKEN must NOT be present in the captured env
    expect(capturedGitShowEnv?.["GH_TOKEN"]).toBeUndefined();
  });
});

describe("TC-ENV-02: git show spawn env — GITHUB_TOKEN is stripped", () => {
  it("the env argument passed to spawn('git', ['show', ...]) does not contain GITHUB_TOKEN", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      baselinePackageJson,
      "utf-8",
    );

    let capturedGitShowEnv: Record<string, string | undefined> | undefined;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[], opts?: unknown) => {
      const spawnOpts = opts as { env?: Record<string, string | undefined> } | undefined;
      if (cmd === "git" && Array.isArray(args) && args[0] === "show") {
        capturedGitShowEnv = spawnOpts?.env;
        return makeMockChild(0, baselinePackageJson) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir, undefined, "main");

    expect(capturedGitShowEnv).toBeDefined();
    expect(capturedGitShowEnv?.["GITHUB_TOKEN"]).toBeUndefined();
  });
});

describe("TC-ENV-03: git show spawn env — PATH is preserved (benign variable regression)", () => {
  it("the env argument passed to spawn('git', ['show', ...]) preserves PATH", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      baselinePackageJson,
      "utf-8",
    );

    let capturedGitShowEnv: Record<string, string | undefined> | undefined;

    const spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockImplementation((cmd: string, args: readonly string[], opts?: unknown) => {
      const spawnOpts = opts as { env?: Record<string, string | undefined> } | undefined;
      if (cmd === "git" && Array.isArray(args) && args[0] === "show") {
        capturedGitShowEnv = spawnOpts?.env;
        return makeMockChild(0, baselinePackageJson) as ReturnType<typeof childProcess.spawn>;
      }
      return makeMockChild(0, "ok") as ReturnType<typeof childProcess.spawn>;
    });

    const { runVerification } = await import("../../../../src/core/verification/runner.js");
    await runVerification("my-change", tempDir, undefined, "main");

    expect(capturedGitShowEnv).toBeDefined();
    // PATH is benign and must be preserved
    expect(capturedGitShowEnv?.["PATH"]).toBe(process.env["PATH"]);
  });
});
