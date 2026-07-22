/**
 * Unit tests for canonical hash binding extensions to reviewer-status.ts.
 *
 * TC-003: canonHash を持たない legacy 承認 record は pending に戻る
 * TC-020: canonHash フィールドを持つ ReviewerStatus が型エラーなく構築できる
 * TC-022: computeCanonHash に空配列を渡すと null を返す
 * TC-023: computeCanonHash に全 hash null の refs を渡すと null を返す
 * TC-024: 内容が異なる refs からは異なる canonHash 文字列が生成される
 * TC-025: 同一内容の refs は順序によらず同じ canonHash 文字列を返す
 * TC-026: selectPendingMembers: baselineCommit=null の approved member は skip される（managed fail-safe）
 * TC-027: selectPendingMembers: revision 一致 + canonHash 一致 → skip
 * TC-028: selectPendingMembers: revision 一致 + canonHash 不一致 → pending
 * TC-029: selectPendingMembers: revision 一致 + record.canonHash 欠落 → pending（legacy fail-closed）
 * TC-030: selectPendingMembers: currentCanonHash=null → pending（canon 検証不能 → fail-closed）
 * TC-031: selectPendingMembers: currentCanonHash=undefined → skip（3-arg 後方互換）
 * TC-033: applyRoundResults: approved verdict の member に canonHash が記録される
 *
 * RED phase: computeCanonHash is not yet exported from reviewer-status.ts;
 * ReviewerStatus does not yet have canonHash field; selectPendingMembers and
 * applyRoundResults do not yet accept the 4th argument.
 *
 * Destruction confirmations (TC-046, TC-049):
 *   TC-046: Removing the canon-hash check in selectPendingMembers would cause
 *           TC-003, TC-028 to fail (canonical change no longer triggers re-run).
 *   TC-049: Treating legacy record (canonHash missing) as skip would cause
 *           TC-003, TC-029 to fail.
 */
import { describe, it, expect } from "vitest";
import {
  computeCanonHash,
  selectPendingMembers,
  applyRoundResults,
} from "../reviewer-status.js";
import type { ReviewerStatus } from "../../../kernel/reviewer-snapshot.js";
import type { ArtifactRef } from "../../../state/artifact-types.js";

// ---------------------------------------------------------------------------
// TC-020: ReviewerStatus type can hold canonHash field without TypeScript error
//
// This is a compile-time check. If canonHash is not in the type, TypeScript will
// error with "Object literal may only specify known properties". At runtime the
// test also validates the runtime shape.
// ---------------------------------------------------------------------------

describe("TC-020: ReviewerStatus canonHash field type safety", () => {
  it("TC-020: constructs ReviewerStatus with canonHash without type error", () => {
    // If this line causes a TypeScript error, TC-020 is red (canonHash not in type)
    const status: ReviewerStatus = {
      name: "r1",
      status: "approved",
      approvedAtCommit: "abc",
      canonHash: "hash-value",
    };
    expect(status.canonHash).toBe("hash-value");
    expect(status.name).toBe("r1");
  });

  it("TC-020: ReviewerStatus without canonHash compiles and has undefined canonHash (backward compat)", () => {
    const legacyStatus: ReviewerStatus = { name: "r2", status: "pending" };
    // No TypeScript error on existing construction
    expect(legacyStatus.canonHash).toBeUndefined();
  });

  it("TC-020: ReviewerStatus with canonHash=null is valid (legacy / verification-unavailable)", () => {
    const status: ReviewerStatus = {
      name: "r3",
      status: "approved",
      approvedAtCommit: "sha1",
      canonHash: null,
    };
    expect(status.canonHash).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-022: computeCanonHash — empty array → null
// ---------------------------------------------------------------------------

describe("computeCanonHash — empty/null input (TC-022, TC-023)", () => {
  it("TC-022: returns null for empty refs array", () => {
    const result = computeCanonHash([]);
    expect(result).toBeNull();
  });

  it("TC-023: returns null when all refs have hash=null", () => {
    // TC-023: all-null hashes → no adoptable refs → null
    const refs: ArtifactRef[] = [
      { path: "specrunner/changes/foo/request.md", hash: null },
      { path: "specrunner/changes/foo/spec.md", hash: null },
    ];
    const result = computeCanonHash(refs);
    expect(result).toBeNull();
  });

  it("TC-023: returns null when refs array has only null-hash entries", () => {
    const refs: ArtifactRef[] = [
      { path: "a.md", hash: null },
      { path: "b.md", hash: null },
      { path: "c.md", hash: null },
    ];
    expect(computeCanonHash(refs)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-024: different content → different canonHash
// TC-025: same content, different order → same canonHash
// ---------------------------------------------------------------------------

describe("computeCanonHash — determinism and content sensitivity (TC-024, TC-025)", () => {
  const HASH_A = "sha256:aaaa1111";
  const HASH_B = "sha256:bbbb2222";
  const HASH_C = "sha256:cccc3333";

  it("TC-024: different hash values produce different canonHash strings", () => {
    const refs1: ArtifactRef[] = [
      { path: "specrunner/changes/foo/design.md", hash: HASH_A },
    ];
    const refs2: ArtifactRef[] = [
      { path: "specrunner/changes/foo/design.md", hash: HASH_C },
    ];
    const h1 = computeCanonHash(refs1);
    const h2 = computeCanonHash(refs2);
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h1).not.toBe(h2);
  });

  it("TC-024: different set of present files produces different canonHash", () => {
    const refs1: ArtifactRef[] = [
      { path: "specrunner/changes/foo/design.md", hash: HASH_A },
    ];
    const refs2: ArtifactRef[] = [
      { path: "specrunner/changes/foo/design.md", hash: HASH_A },
      { path: "specrunner/changes/foo/spec.md", hash: HASH_B },
    ];
    const h1 = computeCanonHash(refs1);
    const h2 = computeCanonHash(refs2);
    expect(h1).not.toBe(h2);
  });

  it("TC-025: same path/hash pairs in different order produce the same canonHash (path-sorted)", () => {
    const refs1: ArtifactRef[] = [
      { path: "specrunner/changes/foo/design.md", hash: HASH_A },
      { path: "specrunner/changes/foo/request.md", hash: HASH_B },
    ];
    const refs2: ArtifactRef[] = [
      { path: "specrunner/changes/foo/request.md", hash: HASH_B },
      { path: "specrunner/changes/foo/design.md", hash: HASH_A },
    ];
    const h1 = computeCanonHash(refs1);
    const h2 = computeCanonHash(refs2);
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h1).toBe(h2);
  });

  it("TC-025: null-hash refs are ignored, remaining refs are path-sorted for determinism", () => {
    const refsWithNull: ArtifactRef[] = [
      { path: "specrunner/changes/foo/request.md", hash: HASH_B },
      { path: "specrunner/changes/foo/design.md", hash: null }, // missing file — ignored
    ];
    const refsWithoutMissing: ArtifactRef[] = [
      { path: "specrunner/changes/foo/request.md", hash: HASH_B },
    ];
    // Only non-null refs are adopted; both should produce the same hash
    expect(computeCanonHash(refsWithNull)).toBe(computeCanonHash(refsWithoutMissing));
  });

  it("TC-024/TC-025: computeCanonHash returns a non-empty string when valid refs present", () => {
    const refs: ArtifactRef[] = [
      { path: "specrunner/changes/foo/design.md", hash: HASH_A },
    ];
    const result = computeCanonHash(refs);
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-026: selectPendingMembers — baselineCommit=null → skip (managed fail-safe)
//
// Design D4: managed short-circuit happens BEFORE canon check.
// Even if canonHash differs, the member is skipped when baselineCommit=null.
// ---------------------------------------------------------------------------

describe("selectPendingMembers — managed fail-safe (TC-026)", () => {
  it("TC-026: baselineCommit=null + canonHash present → approved member is skipped", () => {
    // TC-026: managed runtime (baselineCommit=null) short-circuits before canon check
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        canonHash: "H1",
      },
    ];
    // Pass non-matching canonHash — but managed short-circuit fires first
    const pending = selectPendingMembers(statuses, ["security"], null, "H2-different");
    expect(pending).toEqual([]); // managed → approved stays skipped
  });

  it("TC-026: baselineCommit=null + NO canonHash → approved member is still skipped", () => {
    const statuses: ReviewerStatus[] = [
      { name: "r1", status: "approved", approvedAtCommit: "C1" },
    ];
    const pending = selectPendingMembers(statuses, ["r1"], null, "H1");
    expect(pending).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-027: selectPendingMembers — revision match + canonHash match → skip
// ---------------------------------------------------------------------------

describe("selectPendingMembers — revision + canon double match → skip (TC-027)", () => {
  it("TC-027: approved member with matching revision AND matching canonHash is skipped", () => {
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        canonHash: "H1",
      },
    ];
    const pending = selectPendingMembers(statuses, ["security"], "C1", "H1");
    expect(pending).toEqual([]); // both match → skip
  });

  it("TC-027: two members, both approved with matching revision and canonHash, both skipped", () => {
    const statuses: ReviewerStatus[] = [
      { name: "security", status: "approved", approvedAtCommit: "C1", canonHash: "H1" },
      { name: "perf", status: "approved", approvedAtCommit: "C1", canonHash: "H1" },
    ];
    const pending = selectPendingMembers(statuses, ["security", "perf"], "C1", "H1");
    expect(pending).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-028: selectPendingMembers — revision match + canonHash mismatch → pending
// ---------------------------------------------------------------------------

describe("selectPendingMembers — revision match + canon mismatch → pending (TC-028)", () => {
  it("TC-028: approved member with matching revision but different canonHash becomes pending", () => {
    // TC-028: canonical doc changed → H2 ≠ H1 → fail-closed → re-run
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        canonHash: "H1",
      },
    ];
    // Same revision but different canon → pending (canonical doc changed)
    const pending = selectPendingMembers(statuses, ["security"], "C1", "H2");
    expect(pending).toEqual(["security"]);
  });
});

// ---------------------------------------------------------------------------
// TC-029: selectPendingMembers — revision match + record.canonHash absent → pending (legacy)
// ---------------------------------------------------------------------------

describe("selectPendingMembers — legacy record without canonHash → pending (TC-029)", () => {
  it("TC-029: approved member without canonHash field becomes pending (fail-closed)", () => {
    // TC-003/TC-029: legacy record (pre-canonHash) → fail-closed
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        // canonHash intentionally absent (legacy record)
      },
    ];
    const pending = selectPendingMembers(statuses, ["security"], "C1", "H1");
    expect(pending).toEqual(["security"]);
  });

  it("TC-029: approved member with canonHash=null also becomes pending (null = legacy/unavailable)", () => {
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        canonHash: null,
      },
    ];
    const pending = selectPendingMembers(statuses, ["security"], "C1", "H1");
    expect(pending).toEqual(["security"]);
  });
});

// ---------------------------------------------------------------------------
// TC-003: canonHash を持たない legacy 承認 record は pending に戻る
// (integration-level scenario — same invariant as TC-029 but framed from spec)
// ---------------------------------------------------------------------------

describe("TC-003: legacy approval record without canonHash becomes pending", () => {
  it("TC-003: legacy record (no canonHash) is not skipped — pending (fail-closed per req 4)", () => {
    // Spec Req 4: canonHash を持たない既存の承認 record は不一致扱い (pending に戻す)
    const statuses: ReviewerStatus[] = [
      {
        name: "r1",
        status: "approved",
        approvedAtCommit: "sha-current", // revision matches
        // canonHash absent — legacy
      },
    ];
    const pending = selectPendingMembers(statuses, ["r1"], "sha-current", "any-hash");
    expect(pending).toEqual(["r1"]); // fail-closed → pending
  });

  it("TC-003: record itself is not mutated (read-only check)", () => {
    const statuses: ReviewerStatus[] = [
      { name: "r1", status: "approved", approvedAtCommit: "C1" },
    ];
    const original = { ...statuses[0] };
    selectPendingMembers(statuses, ["r1"], "C1", "H1");
    // Original record is not modified
    expect(statuses[0]).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// TC-030: selectPendingMembers — currentCanonHash=null → pending (fail-closed)
// ---------------------------------------------------------------------------

describe("selectPendingMembers — currentCanonHash=null → pending (TC-030)", () => {
  it("TC-030: currentCanonHash=null means canon verification unavailable → fail-closed → pending", () => {
    // TC-030: canon engaged but hash unavailable (e.g., all files missing)
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        canonHash: "H1",
      },
    ];
    // null = canon binding engaged but computeCanonHash returned null (no files)
    const pending = selectPendingMembers(statuses, ["security"], "C1", null);
    expect(pending).toEqual(["security"]);
  });
});

// ---------------------------------------------------------------------------
// TC-031: selectPendingMembers — currentCanonHash=undefined → skip (3-arg compat)
// ---------------------------------------------------------------------------

describe("selectPendingMembers — currentCanonHash=undefined → skip (TC-031)", () => {
  it("TC-031: omitting 4th argument (undefined) skips canon check for backward compat", () => {
    // TC-031: canon binding not engaged (no digestArtifacts / legacy caller)
    // → existing 3-arg callers must not break
    const statuses: ReviewerStatus[] = [
      {
        name: "security",
        status: "approved",
        approvedAtCommit: "C1",
        canonHash: "H1",
      },
    ];
    // No 4th argument → undefined → skip canon check
    const pending = selectPendingMembers(statuses, ["security"], "C1");
    expect(pending).toEqual([]); // skip (no canon check engaged)
  });

  it("TC-031: 3-arg caller is unaffected by canon binding addition (behavioral preservation)", () => {
    // Regression: existing tests/callers that don't pass currentCanonHash still work
    const statuses: ReviewerStatus[] = [
      { name: "r1", status: "approved", approvedAtCommit: "sha1" },
      { name: "r2", status: "pending" },
    ];
    const pending = selectPendingMembers(statuses, ["r1", "r2"], "sha1");
    // r1 approved + revision match + canon undefined → skip; r2 pending → pending
    expect(pending).toEqual(["r2"]);
  });
});

// ---------------------------------------------------------------------------
// TC-033: applyRoundResults — approved verdict records canonHash
// ---------------------------------------------------------------------------

describe("applyRoundResults — canonHash recorded on approval (TC-033)", () => {
  it("TC-033: approved verdict records both approvedAtCommit and canonHash", () => {
    const statuses: ReviewerStatus[] = [{ name: "security", status: "pending" }];
    const results = new Map([["security", "approved"]]);
    // TC-033: pass currentCanonHash as 4th argument
    const updated = applyRoundResults(statuses, results, "C2", "H2");
    expect(updated[0]).toMatchObject({
      name: "security",
      status: "approved",
      approvedAtCommit: "C2",
      canonHash: "H2",
    });
  });

  it("TC-033: canonHash=null is recorded when currentCanonHash is not available", () => {
    const statuses: ReviewerStatus[] = [{ name: "r1", status: "pending" }];
    const results = new Map([["r1", "approved"]]);
    // currentCanonHash omitted (undefined) → canonHash = null in record
    const updated = applyRoundResults(statuses, results, "C1");
    expect(updated[0]?.approvedAtCommit).toBe("C1");
    // canonHash should be null (not undefined) when not provided
    expect(updated[0]?.canonHash).toBeNull();
  });

  it("TC-033: needs-fix verdict does not record canonHash", () => {
    const statuses: ReviewerStatus[] = [
      { name: "r1", status: "approved", approvedAtCommit: "C1", canonHash: "H1" },
    ];
    const results = new Map([["r1", "needs-fix"]]);
    const updated = applyRoundResults(statuses, results, "C2", "H2");
    // needs-fix → status=pending, approvedAtCommit cleared
    expect(updated[0]?.status).toBe("pending");
    expect(updated[0]?.approvedAtCommit).toBeNull();
  });

  it("TC-033: skipped verdict does not set canonHash", () => {
    const statuses: ReviewerStatus[] = [{ name: "r1", status: "pending" }];
    const results = new Map([["r1", "skipped"]]);
    const updated = applyRoundResults(statuses, results, "C1", "H1");
    expect(updated[0]?.status).toBe("skipped");
    // skipped records don't carry canonHash (only approved ones do)
    expect(updated[0]?.canonHash == null || updated[0]?.canonHash === undefined).toBe(true);
  });

  it("TC-033: does not mutate the original statuses array", () => {
    const statuses: ReviewerStatus[] = [{ name: "r1", status: "pending" }];
    const original = { ...statuses[0] };
    applyRoundResults(statuses, new Map([["r1", "approved"]]), "C1", "H1");
    expect(statuses[0]).toEqual(original);
  });
});
