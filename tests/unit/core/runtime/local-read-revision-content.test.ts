/**
 * Unit tests for LocalRuntime.readRevisionContent (T-03).
 *
 * TC-012: LocalRuntime.readRevisionContent が現ファイル内容と指定 OID の内容を返す (must)
 *   GIVEN cwd/file が worktree に存在し、priorOid が有効な commitOid を指す
 *   WHEN  LocalRuntime.readRevisionContent(file, priorOid, cwd, null) を呼ぶ
 *   THEN  current に現 file の内容、prior に指定 OID 時点の file 内容が返り、例外を throw しない
 *
 * TC-013: LocalRuntime.readRevisionContent - 非存在 OID で prior が null (should)
 *   GIVEN priorOid が存在しない OID 文字列
 *   WHEN  LocalRuntime.readRevisionContent(file, priorOid, cwd, null) を呼ぶ
 *   THEN  prior が null であり、例外を throw しない
 *
 * TC-014: LocalRuntime.readRevisionContent - 非存在 path で current が null (should)
 *   GIVEN cwd/file が worktree に存在しない
 *   WHEN  LocalRuntime.readRevisionContent(file, priorOid, cwd, null) を呼ぶ
 *   THEN  current が null であり、例外を throw しない
 *
 * All tests are intentionally RED until T-03 (LocalRuntime.readRevisionContent) is implemented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// DTO type (will be exported from runtime-strategy.ts after T-03)
// ---------------------------------------------------------------------------

type RevisionContentPair = { current: string | null; prior: string | null };

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock SpawnFn that simulates `git show <oid>:<file>`.
 * All git commands not matching "show" return exit 0 / empty.
 */
function buildMockSpawnForGitShow(opts: {
  showExitCode?: number;
  showContent?: string;
  throwOnCall?: boolean;
}): SpawnFn {
  const { showExitCode = 0, showContent = "", throwOnCall = false } = opts;

  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (throwOnCall) {
      throw new Error("spawn error");
    }
    if (cmd === "git" && args[0] === "show") {
      return { exitCode: showExitCode, stdout: showContent, stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

/**
 * Build a minimal mock GitHubClient required by LocalRuntime constructor.
 */
function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      headRefName: "",
      mergeable: "MERGEABLE",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const PRIOR_OID = "abc123deadbeef0000000000000000000000000000";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-read-revision-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: invoke readRevisionContent via unsafe cast (method doesn't exist yet → RED)
// ---------------------------------------------------------------------------

async function callReadRevisionContent(
  runtime: LocalRuntime,
  file: string,
  priorOid: string,
  cwd: string,
  branch: string | null,
): Promise<{ result: RevisionContentPair | undefined; threw: boolean }> {
  let result: RevisionContentPair | undefined;
  let threw = false;
  try {
    result = await (runtime as never as {
      readRevisionContent(
        file: string,
        priorOid: string,
        cwd: string,
        branch: string | null,
      ): Promise<RevisionContentPair>;
    }).readRevisionContent(file, priorOid, cwd, branch);
  } catch {
    threw = true;
  }
  return { result, threw };
}

// ---------------------------------------------------------------------------
// TC-012: 現ファイル内容と指定 OID の内容を返す (must)
// Source: test-cases.md > TC-012
//         tasks.md > T-03 (LocalRuntime 実装)
// ---------------------------------------------------------------------------

describe("TC-012: LocalRuntime.readRevisionContent が現ファイル内容と指定 OID の内容を返す", () => {
  it("TC-012: cwd/file が存在し priorOid が有効 → current/prior に内容が返り例外を throw しない", async () => {
    // GIVEN: a real file in the temp dir
    const fileName = "src/example.ts";
    const fileContent = "const x = 1;\nconst y = 2;\n";
    const priorContent = "const x = 0;\n";

    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, fileName), fileContent, "utf-8");

    // git show returns priorContent (simulates a valid OID)
    const spawnFn = buildMockSpawnForGitShow({ showExitCode: 0, showContent: priorContent });
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient() as never,
      spawnFn,
    });

    // WHEN: readRevisionContent is called
    const { result, threw } = await callReadRevisionContent(runtime, fileName, PRIOR_OID, tempDir, null);

    // THEN: no throw, current = fileContent, prior = priorContent
    expect(threw, "must not throw for valid file + valid OID").toBe(false);
    expect(result?.current).toBe(fileContent);
    expect(result?.prior).toBe(priorContent);
  });

  it("TC-012: git show が呼ばれる引数に priorOid と file が含まれる", async () => {
    const fileName = "src/foo.ts";
    const fileContent = "export {};\n";
    const priorContent = "";

    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, fileName), fileContent, "utf-8");

    const spawnFn = buildMockSpawnForGitShow({ showExitCode: 0, showContent: priorContent });
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient() as never,
      spawnFn,
    });

    await callReadRevisionContent(runtime, fileName, PRIOR_OID, tempDir, null);

    // Verify git show was called with the expected arguments pattern
    const mockSpawn = vi.mocked(spawnFn);
    const gitShowCalls = mockSpawn.mock.calls.filter(
      ([cmd, args]) => cmd === "git" && args[0] === "show",
    );
    expect(gitShowCalls.length, "git show must be called at least once").toBeGreaterThan(0);

    // At least one call must reference the priorOid and file
    const hasOidAndFile = gitShowCalls.some(
      ([, args]) =>
        args.some((a) => a.includes(PRIOR_OID)) &&
        args.some((a) => a.includes(fileName)),
    );
    expect(hasOidAndFile, "git show must include priorOid and file in args").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-013: 非存在 OID で prior が null (should)
// Source: test-cases.md > TC-013
//         tasks.md > T-03 (解決不能ケースを null に倒す)
// ---------------------------------------------------------------------------

describe("TC-013: LocalRuntime.readRevisionContent - 非存在 OID で prior が null (should)", () => {
  it("TC-013: git show が非 0 exit（存在しない OID）→ prior が null、例外 throw しない", async () => {
    // GIVEN: file exists but priorOid does not exist in git history
    const fileName = "src/bar.ts";
    const fileContent = "const bar = true;\n";

    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, fileName), fileContent, "utf-8");

    // git show fails: non-zero exit (OID not found)
    const spawnFn = buildMockSpawnForGitShow({ showExitCode: 128, showContent: "" });
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient() as never,
      spawnFn,
    });

    // WHEN: readRevisionContent is called with a non-existent OID
    const { result, threw } = await callReadRevisionContent(
      runtime,
      fileName,
      "nonexistent0000000000000000000000000000000",
      tempDir,
      null,
    );

    // THEN: must not throw, current is the file content, prior is null
    expect(threw, "must not throw when OID does not exist").toBe(false);
    expect(result?.current).toBe(fileContent);
    expect(result?.prior).toBeNull();
  });

  it("TC-013: git show が例外を throw した場合も prior が null、例外 throw しない", async () => {
    const fileName = "src/baz.ts";
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, fileName), "export {};\n", "utf-8");

    // git show throws (e.g. binary not found)
    const spawnFn = buildMockSpawnForGitShow({ throwOnCall: true });
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient() as never,
      spawnFn,
    });

    const { result, threw } = await callReadRevisionContent(runtime, fileName, PRIOR_OID, tempDir, null);

    expect(threw).toBe(false);
    expect(result?.prior).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-014: 非存在 path で current が null (should)
// Source: test-cases.md > TC-014
//         tasks.md > T-03 (解決不能ケースを null に倒す)
// ---------------------------------------------------------------------------

describe("TC-014: LocalRuntime.readRevisionContent - 非存在 path で current が null (should)", () => {
  it("TC-014: cwd/file が存在しない → current が null、例外 throw しない", async () => {
    // GIVEN: file does not exist in the worktree
    const fileName = "src/does-not-exist.ts";
    // Do NOT create the file
    const priorContent = "prior content\n";

    const spawnFn = buildMockSpawnForGitShow({ showExitCode: 0, showContent: priorContent });
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient() as never,
      spawnFn,
    });

    // WHEN: readRevisionContent is called with a path that does not exist
    const { result, threw } = await callReadRevisionContent(runtime, fileName, PRIOR_OID, tempDir, null);

    // THEN: must not throw, current is null, prior is returned normally
    expect(threw, "must not throw when file does not exist").toBe(false);
    expect(result?.current).toBeNull();
    expect(result?.prior).toBe(priorContent);
  });

  it("TC-014: file もなく OID も無効 → current が null かつ prior が null、例外 throw しない", async () => {
    const fileName = "nonexistent/path.ts";

    const spawnFn = buildMockSpawnForGitShow({ showExitCode: 1, showContent: "" });
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient() as never,
      spawnFn,
    });

    const { result, threw } = await callReadRevisionContent(runtime, fileName, "bad-oid", tempDir, null);

    expect(threw).toBe(false);
    expect(result?.current).toBeNull();
    expect(result?.prior).toBeNull();
  });
});
