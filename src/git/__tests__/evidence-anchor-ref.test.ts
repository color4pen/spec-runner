/**
 * Group 2: Durable anchor git plumbing — `evidence-anchor-ref.ts`
 *
 * TC-006: `pushEvidenceAnchor` が hash-object → update-ref → push を順に呼ぶ
 * TC-007: `pushEvidenceAnchor` は push 失敗でも throw しない
 * TC-008: `readEvidenceAnchor` が present / absent / unavailable を返す
 *
 * Source: tasks.md > T-02 / design.md > D3
 * All git I/O is stubbed via injected SpawnFn — no real git process is spawned.
 */

import { describe, it, expect, vi } from "vitest";
import {
  pushEvidenceAnchor,
  readEvidenceAnchor,
  evidenceAnchorRefName,
} from "../evidence-anchor-ref.js";
import type { SpawnFn } from "../../util/spawn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo";
const BRANCH = "change/my-feature-abc12345";
const DIGEST = "sha256:deadbeef01234567890abcdef";
const BLOB_OID = "abc1234567890def1234567890abc1234567890d";

/** Build a fake SpawnFn that returns sequenced responses */
function makeSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: Array<[string, string[]]> } {
  const calls: Array<[string, string[]]> = [];
  let idx = 0;
  const fn = vi.fn(async (cmd: string, args: string[]) => {
    calls.push([cmd, args]);
    const r = responses[idx++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return {
      exitCode: r.exitCode,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  }) as unknown as SpawnFn;
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// evidenceAnchorRefName
// ---------------------------------------------------------------------------

describe("evidenceAnchorRefName", () => {
  it("returns refs/specrunner/evidence/<branch>", () => {
    expect(evidenceAnchorRefName("change/my-feature-abc12345")).toBe(
      "refs/specrunner/evidence/change/my-feature-abc12345",
    );
  });
});

// ---------------------------------------------------------------------------
// TC-006: pushEvidenceAnchor — hash-object → update-ref → push (ordered)
// ---------------------------------------------------------------------------

describe("TC-006: pushEvidenceAnchor が hash-object → update-ref → push を順に呼ぶ", () => {
  it("TC-006: issues three git commands in the correct order", async () => {
    const { fn, calls } = makeSpawnFn([
      { exitCode: 0, stdout: BLOB_OID + "\n" }, // git hash-object
      { exitCode: 0 },                           // git update-ref
      { exitCode: 0 },                           // git push
    ]);

    await pushEvidenceAnchor(fn, CWD, BRANCH, DIGEST);

    expect(calls).toHaveLength(3);

    // First call: git hash-object -w --stdin
    expect(calls[0]![0]).toBe("git");
    expect(calls[0]![1]).toContain("hash-object");
    expect(calls[0]![1]).toContain("-w");
    expect(calls[0]![1]).toContain("--stdin");

    // Second call: git update-ref refs/specrunner/evidence/<branch> <blobOid>
    expect(calls[1]![0]).toBe("git");
    expect(calls[1]![1]).toContain("update-ref");
    expect(calls[1]![1]).toContain(evidenceAnchorRefName(BRANCH));
    expect(calls[1]![1]).toContain(BLOB_OID);

    // Third call: git push origin refs/...:refs/...
    expect(calls[2]![0]).toBe("git");
    expect(calls[2]![1]).toContain("push");
    expect(calls[2]![1]).toContain("origin");
    const ref = evidenceAnchorRefName(BRANCH);
    // The push refspec should be <ref>:<ref>
    expect(calls[2]![1].join(" ")).toContain(`${ref}:${ref}`);
  });

  it("TC-006: passes cwd to all git commands", async () => {
    const { fn } = makeSpawnFn([
      { exitCode: 0, stdout: BLOB_OID + "\n" },
      { exitCode: 0 },
      { exitCode: 0 },
    ]);

    await pushEvidenceAnchor(fn, CWD, BRANCH, DIGEST);

    const spawnMock = fn as ReturnType<typeof vi.fn>;
    for (const call of spawnMock.mock.calls) {
      const opts = call[2] as { cwd?: string } | undefined;
      expect(opts?.cwd).toBe(CWD);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-007: pushEvidenceAnchor — push failure does not throw
// ---------------------------------------------------------------------------

describe("TC-007: pushEvidenceAnchor は push 失敗でも throw しない", () => {
  it("TC-007: push exits non-zero → resolves without throwing", async () => {
    const { fn } = makeSpawnFn([
      { exitCode: 0, stdout: BLOB_OID + "\n" }, // hash-object succeeds
      { exitCode: 0 },                           // update-ref succeeds
      { exitCode: 128, stderr: "fatal: push failed" }, // push fails
    ]);

    await expect(pushEvidenceAnchor(fn, CWD, BRANCH, DIGEST)).resolves.toBeUndefined();
  });

  it("TC-007: hash-object failure → resolves without throwing (best-effort)", async () => {
    const { fn } = makeSpawnFn([
      { exitCode: 1, stderr: "error: hash-object failed" },
    ]);

    await expect(pushEvidenceAnchor(fn, CWD, BRANCH, DIGEST)).resolves.toBeUndefined();
  });

  it("TC-007: update-ref failure → resolves without throwing", async () => {
    const { fn } = makeSpawnFn([
      { exitCode: 0, stdout: BLOB_OID + "\n" },
      { exitCode: 128, stderr: "fatal: update-ref failed" },
    ]);

    await expect(pushEvidenceAnchor(fn, CWD, BRANCH, DIGEST)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: readEvidenceAnchor — present / absent / unavailable
// ---------------------------------------------------------------------------

describe("TC-008: readEvidenceAnchor が present / absent / unavailable を返す", () => {
  it("TC-008-present: fetch + cat-file success → {kind:'present', digest}", async () => {
    const { fn } = makeSpawnFn([
      { exitCode: 0 },                              // git fetch origin <ref>:<ref>
      { exitCode: 0, stdout: DIGEST + "\n" },       // git cat-file blob <ref>
    ]);

    const result = await readEvidenceAnchor(fn, CWD, BRANCH);

    expect(result).toEqual({ kind: "present", digest: DIGEST });
  });

  it("TC-008-absent: fetch fails with ref-not-found stderr → {kind:'absent'}", async () => {
    const { fn } = makeSpawnFn([
      {
        exitCode: 128,
        stderr: "error: remote ref does not exist",
      },
    ]);

    const result = await readEvidenceAnchor(fn, CWD, BRANCH);

    expect(result).toEqual({ kind: "absent" });
  });

  it("TC-008-absent: fetch fails with 'couldn't find remote ref' stderr → {kind:'absent'}", async () => {
    const { fn } = makeSpawnFn([
      {
        exitCode: 1,
        stderr: "fatal: couldn't find remote ref refs/specrunner/evidence/change/my-feature",
      },
    ]);

    const result = await readEvidenceAnchor(fn, CWD, BRANCH);

    expect(result).toEqual({ kind: "absent" });
  });

  it("TC-008-unavailable: fetch fails with network error → {kind:'unavailable', reason}", async () => {
    const { fn } = makeSpawnFn([
      {
        exitCode: 128,
        stderr: "fatal: unable to connect to github.com",
      },
    ]);

    const result = await readEvidenceAnchor(fn, CWD, BRANCH);

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toBeTruthy();
    }
  });

  it("TC-008: digest is trimmed of trailing whitespace", async () => {
    const { fn } = makeSpawnFn([
      { exitCode: 0 },
      { exitCode: 0, stdout: DIGEST + "  \n" }, // trailing whitespace
    ]);

    const result = await readEvidenceAnchor(fn, CWD, BRANCH);

    expect(result).toEqual({ kind: "present", digest: DIGEST });
  });
});
