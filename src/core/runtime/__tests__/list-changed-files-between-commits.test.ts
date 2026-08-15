/**
 * TC-013: listChangedFilesBetweenCommits が LocalRuntime に実装され path フィルタなしで動作する
 * TC-014: ManagedRuntime は listChangedFilesBetweenCommits で unavailable を返す (should)
 *
 * Source: design.md > D3: file-set 同定の Evidence Base ネイティブ化 / tasks.md > T-05
 *
 * After absorb-test-materialize, the runtime must expose:
 *   listChangedFilesBetweenCommits(baseOid: string, headOid: string, cwd: string): Promise<ChangedFilesResult>
 *
 * - LocalRuntime: runs `git diff --name-only --diff-filter=d <baseOid> <headOid>`
 *   (no pathspec filter; --diff-filter=d excludes files deleted at headOid — a deleted
 *   path cannot be overlaid or executed as a test, so listing it would poison the
 *   red/green runs into unavailable for the whole set)
 *   exit 0 → success, non-0 / spawn error → unavailable
 * - ManagedRuntime: always returns unavailable (no local worktree)
 *
 * Tests are RED until T-05 adds listChangedFilesBetweenCommits to both runtimes.
 */
import { describe, it, expect, vi } from "vitest";
import { LocalRuntime } from "../local.js";
import { ManagedRuntime } from "../managed.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";
import type { SpawnFn } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_OID = "base-commit-sha-tc013";
const HEAD_OID = "head-commit-sha-tc013";
const CWD = "/tmp/fake-repo-tc013";

function makeSpawnFn(exitCode: number, stdout: string): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr: "" }) as unknown as SpawnFn;
}

function makeThrowingSpawnFn(): SpawnFn {
  return vi.fn().mockRejectedValue(new Error("spawn ENOENT")) as unknown as SpawnFn;
}

function makeLocalRuntime(spawnFn?: SpawnFn): LocalRuntime {
  return new LocalRuntime({
    cwd: CWD,
    githubClient: {} as GitHubClient,
    spawnFn,
  });
}

function makeManagedRuntime(): ManagedRuntime {
  return new ManagedRuntime(
    CWD,
    {} as SessionClient,
    {} as GitHubClient,
    { owner: "testowner", name: "testrepo" } as OriginInfo,
    undefined,
    "fake-token",
  );
}

// ---------------------------------------------------------------------------
// TC-013: LocalRuntime.listChangedFilesBetweenCommits — no path filter
// ---------------------------------------------------------------------------

describe("TC-013: LocalRuntime.listChangedFilesBetweenCommits runs without path filter", () => {
  it("TC-013: calls git diff --name-only --diff-filter=d <baseOid> <headOid> without -- pathspec", async () => {
    const changedFile = "src/__tests__/feature.test.ts";
    const spawnFn = makeSpawnFn(0, `${changedFile}\n`);
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).listChangedFilesBetweenCommits(BASE_OID, HEAD_OID, CWD);

    expect(result).toEqual({ kind: "success", files: [changedFile] });
    // Must call git diff --name-only without path filter (no -- paths)
    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      ["diff", "--name-only", "--diff-filter=d", BASE_OID, HEAD_OID],
      expect.objectContaining({ cwd: CWD }),
    );
    // Must NOT include "--" or pathspec in the arguments
    const args = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string[];
    expect(args).not.toContain("--");
  });

  it("TC-013: returns success with multiple files when git diff outputs multiple lines", async () => {
    const stdout = "src/__tests__/foo.test.ts\nsrc/__tests__/bar.test.ts\n";
    const spawnFn = makeSpawnFn(0, stdout);
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).listChangedFilesBetweenCommits(BASE_OID, HEAD_OID, CWD);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.files).toContain("src/__tests__/foo.test.ts");
      expect(result.files).toContain("src/__tests__/bar.test.ts");
    }
  });

  it("TC-013: returns success with empty files when git diff has no output (no changes)", async () => {
    const spawnFn = makeSpawnFn(0, "");
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).listChangedFilesBetweenCommits(BASE_OID, HEAD_OID, CWD);

    expect(result).toEqual({ kind: "success", files: [] });
  });

  it("TC-013: returns unavailable when git exits with non-zero code", async () => {
    const spawnFn = makeSpawnFn(128, "fatal: bad revision");
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).listChangedFilesBetweenCommits(BASE_OID, HEAD_OID, CWD);

    expect(result.kind).toBe("unavailable");
  });

  it("TC-013: returns unavailable when spawnFn throws (never throws)", async () => {
    const runtime = makeLocalRuntime(makeThrowingSpawnFn());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).listChangedFilesBetweenCommits(BASE_OID, HEAD_OID, CWD);

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("spawn ENOENT");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-014: ManagedRuntime.listChangedFilesBetweenCommits → always unavailable (should)
// ---------------------------------------------------------------------------

describe("TC-014: ManagedRuntime.listChangedFilesBetweenCommits always returns unavailable", () => {
  it("TC-014: ManagedRuntime.listChangedFilesBetweenCommits → {kind:'unavailable'}", async () => {
    const runtime = makeManagedRuntime();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).listChangedFilesBetweenCommits(BASE_OID, HEAD_OID, CWD);

    expect(result.kind).toBe("unavailable");
  });
});
