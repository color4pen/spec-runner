/**
 * Unit tests for runPrCreate runner.
 *
 * TC-001: 既存 OPEN PR を検出して新規作成しない
 * TC-002: PR が存在しない場合に新規 PR を作成する
 * TC-003: 既存 MERGED PR の場合に error を返す
 * TC-004: gh CLI 失敗時に error を返す
 * TC-005: 既存 CLOSED PR の場合に error を返す
 * TC-006: --body フラグを使用しない（tempfile 経由）
 * TC-007: stderr 文言依存で PR 不在を判定しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as cp from "node:child_process";
import * as fsPromises from "node:fs/promises";
import { EventEmitter } from "node:events";

// Mock node:child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock node:fs/promises to track temp file operations
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

function makeMockSpawn(opts: {
  exitCode: number;
  stdout: string;
  stderr: string;
}) {
  return vi.fn().mockImplementation(() => {
    const proc = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();

    setImmediate(() => {
      if (opts.stdout) proc.stdout.emit("data", Buffer.from(opts.stdout));
      if (opts.stderr) proc.stderr.emit("data", Buffer.from(opts.stderr));
      proc.emit("close", opts.exitCode);
    });

    return proc;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// TC-001: 既存 OPEN PR を検出して新規作成しない
describe("TC-001: runner — 既存 OPEN PR を検出して新規作成しない", () => {
  it("returns existing-open and does NOT call gh pr create", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);

    // gh pr list returns OPEN PR
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: JSON.stringify([{ url: "https://github.com/owner/repo/pull/12", number: 12, state: "OPEN" }]),
      stderr: "",
    }));

    const result = await runPrCreate({
      branch: "feat/foo",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
    });

    expect(result.status).toBe("existing-open");
    expect((result as { status: "existing-open"; url: string; number: number }).url).toBe("https://github.com/owner/repo/pull/12");
    expect((result as { status: "existing-open"; url: string; number: number }).number).toBe(12);

    // gh pr create must NOT be called (only 1 spawn = gh pr list)
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const firstCall = spawnMock.mock.calls[0]!;
    expect(firstCall[1]).toContain("list");
    expect(firstCall[1]).not.toContain("create");
  });
});

// TC-002: PR が存在しない場合に新規 PR を作成する
describe("TC-002: runner — PR が存在しない場合に新規 PR を作成する", () => {
  it("calls gh pr create and returns created", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);
    const writeFileMock = vi.mocked(fsPromises.writeFile);
    const unlinkMock = vi.mocked(fsPromises.unlink);

    // gh pr list returns empty array
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: JSON.stringify([]),
      stderr: "",
    }));

    // gh pr create returns URL
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: "https://github.com/owner/repo/pull/42\n",
      stderr: "",
    }));

    const result = await runPrCreate({
      branch: "feat/bar",
      baseBranch: "main",
      title: "Add bar",
      body: "PR body content",
      cwd: "/repo",
    });

    expect(result.status).toBe("created");
    expect((result as { status: "created"; url: string; number: number }).url).toBe("https://github.com/owner/repo/pull/42");
    expect((result as { status: "created"; url: string; number: number }).number).toBe(42);

    // Verify temp file was written
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [tmpPath, tmpContent] = writeFileMock.mock.calls[0]!;
    expect(typeof tmpPath).toBe("string");
    expect(tmpContent).toBe("PR body content");

    // Verify temp file was deleted after command
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(unlinkMock.mock.calls[0]![0]).toBe(tmpPath);
  });
});

// TC-003: 既存 MERGED PR の場合に error を返す
describe("TC-003: runner — 既存 MERGED PR の場合に error を返す", () => {
  it("returns error with reason=merged and does NOT call gh pr create", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);

    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: JSON.stringify([{ url: "https://github.com/owner/repo/pull/5", number: 5, state: "MERGED" }]),
      stderr: "",
    }));

    const result = await runPrCreate({
      branch: "feat/baz",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
    });

    expect(result.status).toBe("error");
    expect((result as { status: "error"; reason: string }).reason).toBe("merged");

    // gh pr create must NOT be called
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

// TC-004: gh CLI 失敗時に error を返す
describe("TC-004: runner — gh CLI 失敗時に error を返す", () => {
  it("returns error with reason=gh-failure and re-auth hint in message", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);

    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 1,
      stdout: "",
      stderr: "Error: authentication required. Please run gh auth login.",
    }));

    const result = await runPrCreate({
      branch: "feat/auth-fail",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
    });

    expect(result.status).toBe("error");
    const errResult = result as { status: "error"; reason: string; message: string };
    expect(errResult.reason).toBe("gh-failure");
    // Message should contain re-auth hint
    expect(errResult.message).toMatch(/specrunner login|gh auth login/i);
  });
});

// TC-005: 既存 CLOSED PR の場合に error を返す
describe("TC-005: runner — 既存 CLOSED PR の場合に error を返す", () => {
  it("returns error with reason=closed and does NOT call gh pr create", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);

    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: JSON.stringify([{ url: "https://github.com/owner/repo/pull/3", number: 3, state: "CLOSED" }]),
      stderr: "",
    }));

    const result = await runPrCreate({
      branch: "feat/closed",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
    });

    expect(result.status).toBe("error");
    expect((result as { status: "error"; reason: string }).reason).toBe("closed");
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

// TC-006: --body フラグを使用しない（tempfile 経由）
describe("TC-006: runner — --body フラグを使用しない（tempfile 経由）", () => {
  it("gh pr create is called with --body-file and not --body", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);

    // gh pr list returns empty
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: JSON.stringify([]),
      stderr: "",
    }));
    // gh pr create succeeds
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: "https://github.com/owner/repo/pull/99\n",
      stderr: "",
    }));

    await runPrCreate({
      branch: "feat/body-test",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
    });

    const createCallArgs = spawnMock.mock.calls[1]![1] as string[];
    expect(createCallArgs).toContain("--body-file");
    expect(createCallArgs).not.toContain("--body");
  });
});

// TC-007: stderr 文言依存で PR 不在を判定しない
describe("TC-007: runner — stderr 文言依存で PR 不在を判定しない", () => {
  it("PR absence is determined only by empty JSON array, not stderr content", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");
    const spawnMock = vi.mocked(cp.spawn);

    // gh pr list exits 0 with empty array AND stderr message (should still be treated as "no PR")
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: JSON.stringify([]),
      stderr: "no pull requests found for branch",
    }));
    // gh pr create succeeds
    spawnMock.mockImplementationOnce(makeMockSpawn({
      exitCode: 0,
      stdout: "https://github.com/owner/repo/pull/10\n",
      stderr: "",
    }));

    const result = await runPrCreate({
      branch: "feat/no-pr",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
    });

    // Should be "created" because array was empty, not an error based on stderr content
    expect(result.status).toBe("created");
  });
});
