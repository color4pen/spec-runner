/**
 * Tests for lastCommitTouchingPath port method (tamper-provenance-baseline T-01).
 *
 * TC-007: local runtime が対象 path の最終変更 commit subject を found で返す
 * TC-008: local runtime が履歴を持たない path に none を返す
 * TC-009: local runtime が非 0 exit / spawn error で unavailable を返す
 * TC-010: managed runtime が常に unavailable を返す
 * TC-011: RuntimeStrategy に lastCommitTouchingPath が必須メソッドとして存在することを確認
 *         (typecheck で検証済みのため、ここでは型が存在することのみ確認)
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

const CWD = "/tmp/fake-repo-last-commit";
const TEST_PATH = "specrunner/changes/my-slug/test-cases.md";

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
// TC-007: local runtime が found で commit subject を返す
// ---------------------------------------------------------------------------

describe("TC-007: local runtime が対象 path の最終変更 commit subject を found で返す", () => {
  it("TC-007: git log 成功 → found { oid, subject } を返す", async () => {
    const oid = "abc123def456789012345678901234567890abcd";
    const subject = "spec-fixer: my-slug";
    const SEP = "\x1f";
    const spawnFn = makeSpawnFn(0, `${oid}${SEP}${subject}\n`);
    const runtime = makeLocalRuntime(spawnFn);

    const result = await runtime.lastCommitTouchingPath(TEST_PATH, CWD);

    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.oid).toBe(oid);
      expect(result.subject).toBe(subject);
    }
  });

  it("TC-007: operator-apply subject も found で返す", async () => {
    const oid = "deadbeef0000000000000000000000000000dead";
    const subject = "operator-apply: my-slug";
    const SEP = "\x1f";
    const spawnFn = makeSpawnFn(0, `${oid}${SEP}${subject}`);
    const runtime = makeLocalRuntime(spawnFn);

    const result = await runtime.lastCommitTouchingPath(TEST_PATH, CWD);

    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.subject).toBe("operator-apply: my-slug");
    }
  });

  it("TC-007: 正しい git コマンド引数でスポーンされる", async () => {
    const oid = "abc123def456789012345678901234567890abcd";
    const SEP = "\x1f";
    const spawnFn = makeSpawnFn(0, `${oid}${SEP}spec-fixer: my-slug`);
    const runtime = makeLocalRuntime(spawnFn);

    await runtime.lastCommitTouchingPath(TEST_PATH, CWD);

    expect(spawnFn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["log", "-1", "--", TEST_PATH]),
      expect.objectContaining({ cwd: CWD }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-008: local runtime が空履歴に none を返す
// ---------------------------------------------------------------------------

describe("TC-008: local runtime が履歴を持たない path に none を返す", () => {
  it("TC-008: git log の stdout が空 → none を返す", async () => {
    const spawnFn = makeSpawnFn(0, ""); // empty stdout = no commits
    const runtime = makeLocalRuntime(spawnFn);

    const result = await runtime.lastCommitTouchingPath("nonexistent/path.md", CWD);

    expect(result.kind).toBe("none");
  });

  it("TC-008: stdout が whitespace のみ → none を返す", async () => {
    const spawnFn = makeSpawnFn(0, "   \n   ");
    const runtime = makeLocalRuntime(spawnFn);

    const result = await runtime.lastCommitTouchingPath("nonexistent/path.md", CWD);

    expect(result.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// TC-009: local runtime が非 0 exit / spawn error で unavailable を返す
// ---------------------------------------------------------------------------

describe("TC-009: local runtime が非 0 exit / spawn error で unavailable を返す", () => {
  it("TC-009: git log が非 0 exit → unavailable を返す", async () => {
    const spawnFn = makeSpawnFn(128, ""); // non-zero exit
    const runtime = makeLocalRuntime(spawnFn);

    const result = await runtime.lastCommitTouchingPath(TEST_PATH, "/invalid/cwd");

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toMatch(/128/);
    }
  });

  it("TC-009: spawn が例外を throw → unavailable を返す（throw しない）", async () => {
    const throwingSpawn = makeThrowingSpawnFn();
    const runtime = makeLocalRuntime(throwingSpawn);

    const result = await runtime.lastCommitTouchingPath(TEST_PATH, CWD);

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toMatch(/ENOENT/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-010: managed runtime が常に unavailable を返す
// ---------------------------------------------------------------------------

describe("TC-010: managed runtime が常に unavailable を返す", () => {
  it("TC-010: ManagedRuntime.lastCommitTouchingPath → unavailable (local worktree 不在)", async () => {
    const runtime = makeManagedRuntime();

    const result = await runtime.lastCommitTouchingPath(TEST_PATH, CWD);

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toMatch(/managed/i);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-011: RuntimeStrategy に lastCommitTouchingPath が必須メソッドとして存在する
// ---------------------------------------------------------------------------

describe("TC-011: RuntimeStrategy に lastCommitTouchingPath が必須追加されている (typecheck)", () => {
  it("TC-011: LocalRuntime と ManagedRuntime が lastCommitTouchingPath を実装している", () => {
    // This is verified by typecheck (tsc --noEmit) which enforces RuntimeStrategy.
    // Here we simply confirm both instances have the method at runtime.
    const local = makeLocalRuntime(makeSpawnFn(0, ""));
    const managed = makeManagedRuntime();

    expect(typeof local.lastCommitTouchingPath).toBe("function");
    expect(typeof managed.lastCommitTouchingPath).toBe("function");
  });
});
