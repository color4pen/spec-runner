/**
 * Unit tests for pipeline-sole-committer: egress backstop（公開範囲照合）(R4)
 *
 * TC-012: 台帳未記録の commit を公開範囲に含む push は halt する
 * TC-013: 合成 commit のみの公開範囲は push される
 * TC-014: egress の git rev-list 失敗は halt する (should)
 *
 * RED phase: verifyEgressLedger does not exist yet (T-03 / D4).
 *   All tests fail at import because the export is absent.
 *
 * The new implementation should add `verifyEgressLedger` to commit-push.ts:
 *   - Run `git rev-list HEAD --not --remotes=origin` to enumerate publishing-range OIDs.
 *   - Check each OID against the `ledger` (synthesizedCommits ∪ current-op OIDs).
 *   - Unknown OID → throw SpecRunnerError with code EGRESS_UNKNOWN_COMMIT; git push NOT called.
 *   - All known → resolve (caller proceeds to push).
 *   - rev-list failure (non-0 exit / spawn error) → halt (fail-closed).
 *
 * EGRESS_UNKNOWN_COMMIT must be added to errors.ts (T-09).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../../../src/util/spawn.js";
// verifyEgressLedger is added by T-03 — RED until implemented
import { verifyEgressLedger } from "../../../../src/core/step/commit-push.js";
import { SpecRunnerError } from "../../../../src/errors.js";

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  void stderrSpy;
});

const CWD = "/repo";

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: 台帳未記録の commit を公開範囲に含む push は halt する
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-012: 台帳未記録の commit を公開範囲に含む push は halt する", () => {
  it("公開範囲に未記録 OID が含まれる場合、EGRESS_UNKNOWN_COMMIT で halt し push は呼ばれない", async () => {
    // The unknown OID "unknown-abc123" is in the publishing range (rev-list result)
    // but NOT in the ledger → egress verification must reject and halt.
    const unknownOid = "unknown-abc123def456";

    const pushCalled = { value: false };
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        // rev-list returns the publishing range — includes an unknown OID
        return { exitCode: 0, stdout: `${unknownOid}\n`, stderr: "" };
      }
      if (args[0] === "push") {
        pushCalled.value = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [], spawnFn: spawn }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError &&
        err.code === "EGRESS_UNKNOWN_COMMIT",
    );

    expect(pushCalled.value, "git push must NOT be called when egress halts").toBe(false);
  });

  it("ledger が部分的でも未記録 OID があれば halt する", async () => {
    const knownOid = "known-oid-111";
    const unknownOid = "unknown-oid-222";

    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        return { exitCode: 0, stdout: `${knownOid}\n${unknownOid}\n`, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [knownOid], spawnFn: spawn }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === "EGRESS_UNKNOWN_COMMIT",
    );
  });

  it("rev-list args に HEAD --not --remotes=origin が含まれる（公開範囲列挙）", async () => {
    const unknownOid = "unknown-oid-abc";
    const revListArgs: string[][] = [];

    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        revListArgs.push([...args]);
        return { exitCode: 0, stdout: `${unknownOid}\n`, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [], spawnFn: spawn }),
    ).rejects.toThrow();

    expect(revListArgs.length, "rev-list must be called").toBeGreaterThan(0);
    const args = revListArgs[0];
    // Must enumerate publishing range: HEAD not yet pushed to origin
    expect(args).toContain("HEAD");
    expect(args).toContain("--not");
    // Must reference origin remotes
    expect(
      args.some((a) => a.includes("origin") || a.includes("remotes")),
      "rev-list must reference origin to determine publishing range",
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: 合成 commit のみの公開範囲は push される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-013: 合成 commit のみの公開範囲は push される", () => {
  it("公開範囲の全 OID が台帳に含まれる場合、verifyEgressLedger は resolve する", async () => {
    const oid1 = "synth-commit-oid-aaa";
    const oid2 = "synth-commit-oid-bbb";

    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        return { exitCode: 0, stdout: `${oid1}\n${oid2}\n`, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    // Ledger contains both OIDs → should not throw
    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [oid1, oid2], spawnFn: spawn }),
    ).resolves.toBeUndefined();
  });

  it("公開範囲が空（新しい commit なし）の場合も push は許可される", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        // Empty publishing range — all commits already pushed
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [], spawnFn: spawn }),
    ).resolves.toBeUndefined();
  });

  it("current-op OID group が台帳 union に加算される（スーパーセット照合）", async () => {
    // A just-created OID (not yet in synthesizedCommits in state) but passed as
    // currentOpOids should also be accepted.
    const freshOid = "fresh-synth-oid-ccc";

    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        return { exitCode: 0, stdout: `${freshOid}\n`, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    // Pass freshOid as ledger (synthesizedCommits ∪ current-op OIDs)
    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [freshOid], spawnFn: spawn }),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-014: egress の git rev-list 失敗は halt する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-014: egress の git rev-list 失敗は halt する", () => {
  it("rev-list が非 0 exit を返す場合、黙殺せず halt する", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        // Failure: non-zero exit (e.g. git repository error)
        return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [], spawnFn: spawn }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError &&
        // Either EGRESS_UNKNOWN_COMMIT or a git-failure code — must throw, not silently pass
        typeof err.code === "string",
    );
  });

  it("rev-list が spawn エラーを返す場合、黙殺せず halt する", async () => {
    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        // Simulate spawn failure (non-functional git)
        throw new Error("spawn ENOENT: git not found");
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [], spawnFn: spawn }),
    ).rejects.toThrow();
  });

  it("rev-list 失敗時に git push は呼ばれない（fail-closed）", async () => {
    const pushCalled = { value: false };

    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-list") {
        return { exitCode: 1, stdout: "", stderr: "rev-list error" };
      }
      if (args[0] === "push") {
        pushCalled.value = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    await expect(
      verifyEgressLedger({ cwd: CWD, ledger: [], spawnFn: spawn }),
    ).rejects.toThrow();

    expect(pushCalled.value, "git push must NOT be called after rev-list failure").toBe(false);
  });
});
