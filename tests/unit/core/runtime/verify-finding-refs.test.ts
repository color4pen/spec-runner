/**
 * Unit tests for verifyFindingRefs in local and managed runtimes.
 *
 * TC-VFR-L-001: local runtime — existing file → not returned
 * TC-VFR-L-002: local runtime — non-existent file → returned
 * TC-VFR-L-003: local runtime — line within bounds → not returned
 * TC-VFR-L-004: local runtime — line out of bounds → returned
 * TC-VFR-L-005: local runtime — empty input → empty output
 * TC-VFR-M-001: managed runtime — getRawFile returns content → not returned
 * TC-VFR-M-002: managed runtime — getRawFile returns null → returned
 * TC-VFR-M-003: managed runtime — branch is null → all refs returned
 * TC-VFR-M-004: managed runtime — empty input → empty output
 * TC-VFR-M-005: managed runtime — line out of bounds → returned
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-finding-refs-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function buildMockGitHubClient(getRawFileFn?: (...args: unknown[]) => Promise<string | null>) {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockImplementation(getRawFileFn ?? (async () => null)),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
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
// LocalRuntime
// ---------------------------------------------------------------------------

describe("LocalRuntime.verifyFindingRefs", () => {
  function makeLocalRuntime() {
    return new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
    });
  }

  it("TC-VFR-L-005: empty input → empty output", async () => {
    const runtime = makeLocalRuntime();
    const result = await runtime.verifyFindingRefs([], tempDir, null);
    expect(result).toEqual([]);
  });

  it("TC-VFR-L-001: existing file → not returned", async () => {
    const filePath = path.join(tempDir, "src", "exists.ts");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "export const x = 1;\n");

    const runtime = makeLocalRuntime();
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/exists.ts" }],
      tempDir,
      "main",
    );
    expect(result).toEqual([]);
  });

  it("TC-VFR-L-002: non-existent file → returned", async () => {
    const runtime = makeLocalRuntime();
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/does-not-exist.ts" }],
      tempDir,
      "main",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe("src/does-not-exist.ts");
  });

  it("TC-VFR-L-003: line within bounds → not returned", async () => {
    const filePath = path.join(tempDir, "src", "ten-lines.ts");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Array(10).fill("line\n").join(""));

    const runtime = makeLocalRuntime();
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/ten-lines.ts", line: 5 }],
      tempDir,
      "main",
    );
    expect(result).toEqual([]);
  });

  it("TC-VFR-L-004: line out of bounds → returned", async () => {
    const filePath = path.join(tempDir, "src", "three-lines.ts");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "line1\nline2\nline3\n");

    const runtime = makeLocalRuntime();
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/three-lines.ts", line: 100 }],
      tempDir,
      "main",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.line).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime
// ---------------------------------------------------------------------------

describe("ManagedRuntime.verifyFindingRefs", () => {
  function buildMockSessionClient() {
    return {
      createSession: vi.fn(),
      sendUserMessage: vi.fn(),
      pollUntilComplete: vi.fn(),
      streamEvents: vi.fn(),
      getSessionUsage: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue([]),
      sendEvents: vi.fn().mockResolvedValue(undefined),
    };
  }

  function makeNoop() {
    return async () => ({ exitCode: 0, stdout: "", stderr: "" });
  }

  it("TC-VFR-M-004: empty input → empty output", async () => {
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient(),
      githubClient,
      { owner: "testowner", name: "testrepo" },
      makeNoop() as never,
      "token",
    );
    const result = await runtime.verifyFindingRefs([], tempDir, "main");
    expect(result).toEqual([]);
  });

  it("TC-VFR-M-001: getRawFile returns content → not returned", async () => {
    const githubClient = buildMockGitHubClient(async () => "file content\nline 2\n");
    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient(),
      githubClient,
      { owner: "testowner", name: "testrepo" },
      makeNoop() as never,
      "token",
    );
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/exists.ts" }],
      tempDir,
      "main",
    );
    expect(result).toEqual([]);
    expect(githubClient.getRawFile).toHaveBeenCalledWith("testowner", "testrepo", "main", "src/exists.ts");
  });

  it("TC-VFR-M-002: getRawFile returns null → returned", async () => {
    const githubClient = buildMockGitHubClient(async () => null);
    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient(),
      githubClient,
      { owner: "testowner", name: "testrepo" },
      makeNoop() as never,
      "token",
    );
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/missing.ts" }],
      tempDir,
      "main",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe("src/missing.ts");
  });

  it("TC-VFR-M-003: branch is null → all refs returned", async () => {
    const githubClient = buildMockGitHubClient(async () => "content");
    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient(),
      githubClient,
      { owner: "testowner", name: "testrepo" },
      makeNoop() as never,
      "token",
    );
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/a.ts" }, { file: "src/b.ts" }],
      tempDir,
      null,
    );
    expect(result).toHaveLength(2);
    // getRawFile should NOT be called when branch is null
    expect(githubClient.getRawFile).not.toHaveBeenCalled();
  });

  it("TC-VFR-M-005: line out of bounds → returned", async () => {
    // File has 3 lines
    const githubClient = buildMockGitHubClient(async () => "line1\nline2\nline3");
    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient(),
      githubClient,
      { owner: "testowner", name: "testrepo" },
      makeNoop() as never,
      "token",
    );
    const result = await runtime.verifyFindingRefs(
      [{ file: "src/short.ts", line: 100 }],
      tempDir,
      "main",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.line).toBe(100);
  });
});
