/**
 * Unit tests for the readFileAtCommit primitive (T-01 / T7).
 *
 * The primitive provides a commit-scoped file read with trailing-suffix path resolution,
 * required by the archive floor gate for scenario two-layer freeze verification (T-04).
 *
 * TC-008: archived path resolution via suffix → returns blob content
 * TC-009: non-existent OID or managed runtime → unavailable (no throw)
 * TC-017: multiple matching entries → unavailable (ambiguous suffix)
 * TC-018: zero matching entries → unavailable (not found)
 * TC-019: round-trip hash — readFileAtCommit content hash matches digestArtifacts hash
 *
 * Implementation target:
 *   LocalRuntime.readFileAtCommit(oid, pathSuffix, cwd): Promise<CommitFileResult>
 *   ManagedRuntime.readFileAtCommit(oid, pathSuffix, cwd): Promise<CommitFileResult> (always unavailable)
 *
 * Algorithm (per T-01):
 *   1. git ls-tree -r --name-only <oid> (exit non-0 → unavailable)
 *   2. Filter entries by `entry.endsWith("/" + suffix) || entry === suffix`
 *   3. 0 entries → unavailable (not-found). ≥2 entries → unavailable (ambiguous).
 *   4. git show <oid>:<resolvedPath> → content (exit non-0 → unavailable)
 *   5. Return { kind:"found", path: resolvedPath, content }
 *
 * Spawn errors are caught; never throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// CommitFileResult type (will be added to runtime-strategy.ts in T-01)
// ---------------------------------------------------------------------------

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockSpawnCall = { cmd: string; args: string[] };

/**
 * Build a mock SpawnFn that intercepts git commands.
 *
 * git ls-tree: returns lsTreeOutput (each path on a separate line).
 * git show: returns showContent.
 * All others: exit 0, empty.
 */
function buildMockSpawnForReadFile(opts: {
  lsTreeExitCode?: number;
  lsTreeOutput?: string;
  showExitCode?: number;
  showContent?: string;
  throwOnCall?: boolean;
}): { spawnFn: SpawnFn; calls: MockSpawnCall[] } {
  const {
    lsTreeExitCode = 0,
    lsTreeOutput = "",
    showExitCode = 0,
    showContent = "",
    throwOnCall = false,
  } = opts;

  const calls: MockSpawnCall[] = [];

  const fn = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    calls.push({ cmd, args: [...args] });

    if (throwOnCall) {
      throw new Error("spawn error");
    }

    // git ls-tree -r --name-only <oid>
    if (cmd === "git" && args[0] === "ls-tree") {
      return { exitCode: lsTreeExitCode, stdout: lsTreeOutput, stderr: "" };
    }

    // git show <oid>:<path>
    if (cmd === "git" && args[0] === "show") {
      return { exitCode: showExitCode, stdout: showContent, stderr: "" };
    }

    return { exitCode: 0, stdout: "", stderr: "" };
  });

  return { spawnFn: fn as unknown as SpawnFn, calls };
}

/**
 * Build a minimal mock GitHubClient (required by LocalRuntime constructor).
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

const CWD = "/tmp/test-repo";
const ARCHIVE_OID = "archive-head-sha-rfac-001";
const SLUG = "my-slug";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-008: archived path suffix resolution → returns content
//
// Source: spec.md > Requirement: The runtime SHALL provide a commit-scoped file read primitive
//         > Scenario: archived path 配下の file を suffix で解決して読む
// ---------------------------------------------------------------------------

describe("TC-008: archived path suffix resolution → returns content", () => {
  it(
    "TC-008: ls-tree returns archived path matching suffix → git show returns content",
    async () => {
      const archivedPath = `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`;
      const fileContent = "# Test Cases\n\n## TC-001: foo\n";
      const pathSuffix = `${SLUG}/test-cases.md`;

      // git ls-tree returns one entry matching the suffix
      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput: archivedPath + "\n",
        showExitCode: 0,
        showContent: fileContent,
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      // readFileAtCommit does not exist yet → this call will throw at runtime (red test)
      const result = await (runtime as never as {
        readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
      }).readFileAtCommit(ARCHIVE_OID, pathSuffix, CWD);

      // THEN: resolved to the archived path and content returned
      expect(result.kind).toBe("found");
      if (result.kind === "found") {
        expect(result.path).toBe(archivedPath);
        expect(result.content).toBe(fileContent);
      }
    },
  );

  it(
    "TC-008b: active (non-archived) path also resolves by suffix",
    async () => {
      const activePath = `specrunner/changes/${SLUG}/test-cases.md`;
      const fileContent = "# Active Test Cases\n";
      const pathSuffix = `${SLUG}/test-cases.md`;

      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput: activePath + "\n",
        showExitCode: 0,
        showContent: fileContent,
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      const result = await (runtime as never as {
        readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
      }).readFileAtCommit(ARCHIVE_OID, pathSuffix, CWD);

      expect(result.kind).toBe("found");
      if (result.kind === "found") {
        expect(result.path).toBe(activePath);
        expect(result.content).toBe(fileContent);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// TC-009: non-existent OID or managed runtime → unavailable (never throws)
//
// Source: spec.md > Requirement: The runtime SHALL provide a commit-scoped file read primitive
//         > Scenario: 非存在 OID / managed runtime
// ---------------------------------------------------------------------------

describe("TC-009: non-existent OID or managed runtime → unavailable", () => {
  it(
    "TC-009: git ls-tree returns non-zero exit (non-existent OID) → unavailable, no throw",
    async () => {
      // git ls-tree fails with non-zero exit (OID does not exist)
      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 128,
        lsTreeOutput: "",
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (runtime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit("nonexistent-oid-0000000", `${SLUG}/test-cases.md`, CWD);
      } catch {
        threw = true;
      }

      // THEN: must NOT throw
      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );

  it(
    "TC-009b: spawn throws (e.g. binary not found) → unavailable, no throw",
    async () => {
      const { spawnFn } = buildMockSpawnForReadFile({ throwOnCall: true });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (runtime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit(ARCHIVE_OID, `${SLUG}/test-cases.md`, CWD);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );

  it(
    "TC-009c: managed runtime readFileAtCommit → always unavailable (no local worktree)",
    async () => {
      // ManagedRuntime.readFileAtCommit does not exist yet — this tests the contract
      // that once implemented, it must return unavailable (no local worktree on managed).
      //
      // Per T-01: "managed: 常に unavailable"
      // This test verifies that the ManagedRuntime prototype has readFileAtCommit
      // and that it returns { kind:"unavailable" } for any inputs.
      const { ManagedRuntime } = await import("../../../../src/core/runtime/managed.js");

      // Check if the method is defined on the prototype (will be absent until T-01 is implemented)
      const hasMethod = typeof (ManagedRuntime.prototype as Record<string, unknown>)["readFileAtCommit"] === "function";

      if (!hasMethod) {
        // readFileAtCommit not yet implemented → this case confirms the red state.
        // After implementation, this branch should no longer execute.
        expect(hasMethod).toBe(true); // fails until implemented → red test
        return;
      }

      // When implemented: call it and verify it returns unavailable
      const managedRuntime = { readFileAtCommit: ManagedRuntime.prototype.readFileAtCommit };
      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (managedRuntime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit.call(
          managedRuntime,
          ARCHIVE_OID,
          `${SLUG}/test-cases.md`,
          CWD,
        );
      } catch {
        threw = true;
      }

      // THEN: must NOT throw; must return unavailable for managed runtime
      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-017: multiple matching entries → unavailable (ambiguous suffix)
//
// Source: tasks.md > T-01: commit-scoped file read primitive > readFileAtCommit ambiguous
// ---------------------------------------------------------------------------

describe("TC-017: multiple matching entries → unavailable", () => {
  it(
    "TC-017: ls-tree returns 2 entries matching the suffix → unavailable (ambiguous), no throw",
    async () => {
      const pathSuffix = `${SLUG}/test-cases.md`;
      // Two different paths both end with the suffix (ambiguous)
      const lsTreeOutput = [
        `specrunner/changes/archive/2026-07-01-${SLUG}/test-cases.md`,
        `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
      ].join("\n") + "\n";

      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput,
        showExitCode: 0,
        showContent: "# Content",
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (runtime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit(ARCHIVE_OID, pathSuffix, CWD);
      } catch {
        threw = true;
      }

      // THEN: ambiguous match → unavailable, no throw
      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-018: zero matching entries → unavailable (not found)
//
// Source: tasks.md > T-01: commit-scoped file read primitive > readFileAtCommit not-found
// ---------------------------------------------------------------------------

describe("TC-018: zero matching entries → unavailable", () => {
  it(
    "TC-018: ls-tree returns entries but none match the suffix → unavailable (not-found), no throw",
    async () => {
      const pathSuffix = `${SLUG}/test-cases.md`;
      // ls-tree has entries but none match the suffix
      const lsTreeOutput = [
        "src/foo.ts",
        "src/bar.ts",
        "specrunner/changes/other-slug/test-cases.md", // wrong slug
      ].join("\n") + "\n";

      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput,
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (runtime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit(ARCHIVE_OID, pathSuffix, CWD);
      } catch {
        threw = true;
      }

      // THEN: no match → unavailable, no throw
      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );

  it(
    "TC-018b: ls-tree returns completely empty output → unavailable (not-found)",
    async () => {
      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput: "", // empty tree
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (runtime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit(ARCHIVE_OID, `${SLUG}/test-cases.md`, CWD);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-019: round-trip hash — readFileAtCommit content hash matches digestArtifacts hash
//
// Source: tasks.md > T-01 Acceptance Criteria > round-trip 一致
//
// digestArtifacts computes: "sha256:" + sha256hex(Buffer.from(content, "utf8"))
// readFileAtCommit returns the raw utf8 content
// → hashing the content from readFileAtCommit must give the same hash as digestArtifacts
// ---------------------------------------------------------------------------

describe("TC-019: round-trip hash — readFileAtCommit content hash matches digestArtifacts", () => {
  it(
    "TC-019: content from readFileAtCommit, when hashed with sha256, matches digestArtifacts output",
    async () => {
      const fileContent = "# Test Cases\n\n## TC-001: sample\n## TC-002: another\n";
      // Compute the expected hash the same way digestArtifacts does:
      // createHash("sha256").update(Buffer.from(content)).digest("hex")
      const expectedHash = "sha256:" + createHash("sha256")
        .update(Buffer.from(fileContent, "utf8"))
        .digest("hex");

      const archivedPath = `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`;
      const pathSuffix = `${SLUG}/test-cases.md`;

      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput: archivedPath + "\n",
        showExitCode: 0,
        showContent: fileContent,
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      // readFileAtCommit doesn't exist yet → will throw (red test)
      const result = await (runtime as never as {
        readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
      }).readFileAtCommit(ARCHIVE_OID, pathSuffix, CWD);

      // THEN: hash of the returned content equals the digestArtifacts-equivalent hash
      expect(result.kind).toBe("found");
      if (result.kind === "found") {
        const actualHash = "sha256:" + createHash("sha256")
          .update(Buffer.from(result.content, "utf8"))
          .digest("hex");
        expect(actualHash).toBe(expectedHash);
      }
    },
  );

  it(
    "TC-019b: git show returns non-zero for resolved path → unavailable, no throw",
    async () => {
      const archivedPath = `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`;

      const { spawnFn } = buildMockSpawnForReadFile({
        lsTreeExitCode: 0,
        lsTreeOutput: archivedPath + "\n",
        showExitCode: 1, // git show fails
        showContent: "",
      });

      const runtime = new LocalRuntime({
        cwd: CWD,
        githubClient: buildMockGitHubClient() as never,
        spawnFn,
      });

      let result: CommitFileResult | undefined;
      let threw = false;
      try {
        result = await (runtime as never as {
          readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
        }).readFileAtCommit(ARCHIVE_OID, `${SLUG}/test-cases.md`, CWD);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
  );
});
