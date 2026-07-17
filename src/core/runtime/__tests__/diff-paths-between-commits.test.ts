/**
 * Unit tests for the two-OID path freeze primitive:
 * LocalRuntime.diffPathsBetweenCommits and ManagedRuntime.diffPathsBetweenCommits.
 *
 * New method added by T-01 (assurance-provenance-floor). Tests are red until
 * T-01 adds `diffPathsBetweenCommits` to LocalRuntime and ManagedRuntime.
 *
 * TC-014: diffPathsBetweenCommits が二 OID 間で不変の paths に対し空 files の success を返す
 * TC-015: diffPathsBetweenCommits が二 OID 間で変更された paths を success の files に含めて返す
 * TC-016: managed runtime の diffPathsBetweenCommits が常に unavailable を返す
 * TC-020: diffPathsBetweenCommits に空配列 paths を渡すと git を呼ばず success {files:[]} を返す
 * TC-021: diffPathsBetweenCommits で git が非 0 exit / spawn error のとき unavailable を返す
 *
 * All git I/O is stubbed via injected spawnFn so no real git process is spawned.
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

const BASE_OID = "base-commit-sha-001";
const HEAD_OID = "head-commit-sha-001";
const CWD = "/tmp/fake-repo";

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
// TC-020: empty paths → no git call, success {files:[]}
// ---------------------------------------------------------------------------

describe("TC-020: diffPathsBetweenCommits に空配列 paths を渡すと git を呼ばず success {files:[]} を返す", () => {
  it("TC-020: empty paths array → returns {kind:'success', files:[]} without invoking git", async () => {
    const spawnFn = makeSpawnFn(0, "some-file.ts\n");
    const runtime = makeLocalRuntime(spawnFn);

    // Cast via any: method does not exist yet on LocalRuntime (red until T-01 implements it).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(BASE_OID, HEAD_OID, [], CWD);

    expect(result).toEqual({ kind: "success", files: [] });
    // git diff must NOT be called when paths is empty
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-014: unchanged paths → success with empty files
// ---------------------------------------------------------------------------

describe("TC-014: diffPathsBetweenCommits が二 OID 間で不変の paths に対し空 files の success を返す", () => {
  it(
    "TC-014: git diff --name-only returns empty output → {kind:'success', files:[]}",
    async () => {
      // git diff returns empty (no files changed)
      const spawnFn = makeSpawnFn(0, "");
      const runtime = makeLocalRuntime(spawnFn);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (runtime as any).diffPathsBetweenCommits(
        BASE_OID,
        HEAD_OID,
        ["tests/unit/foo.test.ts"],
        CWD,
      );

      expect(result).toEqual({ kind: "success", files: [] });
    },
  );

  it("TC-014: git is called with correct baseOid headOid and path list", async () => {
    const spawnFn = makeSpawnFn(0, "");
    const runtime = makeLocalRuntime(spawnFn);
    const paths = ["tests/unit/foo.test.ts", "tests/unit/bar.test.ts"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (runtime as any).diffPathsBetweenCommits(BASE_OID, HEAD_OID, paths, CWD);

    // Must call git diff --name-only <baseOid> <headOid> -- <paths...>
    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["diff", "--name-only", BASE_OID, HEAD_OID, "--"]),
      expect.objectContaining({ cwd: CWD }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-015: changed paths → success with changed files
// ---------------------------------------------------------------------------

describe("TC-015: diffPathsBetweenCommits が二 OID 間で変更された paths を success の files に含めて返す", () => {
  it("TC-015: git diff returns changed file path → {kind:'success', files:[path]}", async () => {
    const changedPath = "tests/unit/foo.test.ts";
    const spawnFn = makeSpawnFn(0, `${changedPath}\n`);
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(
      BASE_OID,
      HEAD_OID,
      [changedPath],
      CWD,
    );

    expect(result).toEqual({ kind: "success", files: [changedPath] });
  });

  it("TC-015: multiple changed files are all returned", async () => {
    const stdout = "tests/unit/foo.test.ts\ntests/unit/bar.test.ts\n";
    const spawnFn = makeSpawnFn(0, stdout);
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(
      BASE_OID,
      HEAD_OID,
      ["tests/unit/foo.test.ts", "tests/unit/bar.test.ts"],
      CWD,
    );

    expect(result).toMatchObject({ kind: "success" });
    if (result.kind === "success") {
      expect(result.files).toContain("tests/unit/foo.test.ts");
      expect(result.files).toContain("tests/unit/bar.test.ts");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-021: git non-0 exit or spawn error → unavailable
// ---------------------------------------------------------------------------

describe("TC-021: diffPathsBetweenCommits で git が非 0 exit / spawn error のとき unavailable を返す", () => {
  it("TC-021: git exits with non-zero code → {kind:'unavailable'}", async () => {
    const spawnFn = makeSpawnFn(128, "fatal: bad revision");
    const runtime = makeLocalRuntime(spawnFn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(
      BASE_OID,
      HEAD_OID,
      ["tests/unit/foo.test.ts"],
      CWD,
    );

    expect(result.kind).toBe("unavailable");
  });

  it("TC-021: spawnFn throws → {kind:'unavailable'} (never throws)", async () => {
    const runtime = makeLocalRuntime(makeThrowingSpawnFn());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(
      BASE_OID,
      HEAD_OID,
      ["tests/unit/foo.test.ts"],
      CWD,
    );

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("spawn ENOENT");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-016: managed runtime → always unavailable
// ---------------------------------------------------------------------------

describe("TC-016: managed runtime の diffPathsBetweenCommits が常に unavailable を返す", () => {
  it("TC-016: ManagedRuntime.diffPathsBetweenCommits → {kind:'unavailable'}", async () => {
    const runtime = makeManagedRuntime();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(
      BASE_OID,
      HEAD_OID,
      ["tests/unit/foo.test.ts"],
      CWD,
    );

    expect(result.kind).toBe("unavailable");
  });

  it("TC-016: ManagedRuntime.diffPathsBetweenCommits → unavailable even with empty paths", async () => {
    const runtime = makeManagedRuntime();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (runtime as any).diffPathsBetweenCommits(BASE_OID, HEAD_OID, [], CWD);

    expect(result.kind).toBe("unavailable");
  });
});
