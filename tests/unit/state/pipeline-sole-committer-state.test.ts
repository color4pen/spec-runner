/**
 * Unit tests for pipeline-sole-committer: synthesizedCommits 台帳 + commitOid 不変
 *
 * TC-022: synthesizedCommits は既存 state.json と後方互換である (should)
 * TC-023: sequential 合成 commit OID が synthesizedCommits 台帳に append される (should)
 * TC-024: round 合成 commit OID が synthesizedCommits 台帳に append される (should)
 * TC-025: verification（CLI step）commit OID が台帳に append され後続 push が誤 halt しない (should)
 * TC-029: revision 束縛・canonHash 束縛の既存挙動が保存される (must)
 * TC-030: StepRun.commitOid の型定義・docstring が無改変である (should)
 *
 * RED phase (TC-022 to TC-025): `synthesizedCommits` field does not exist on JobState yet (T-01).
 *   `appendSynthesizedCommit` helper is not exported from schema.ts yet (T-01).
 *   These tests will fail at import-type / call-time.
 *
 * GREEN (TC-029, TC-030): These verify EXISTING behavior that must not regress.
 *   commitOid is already defined on StepRun — these tests document the invariant.
 *
 * The new implementation should:
 *   - Add `synthesizedCommits?: string[]` to JobState in types.ts (T-01).
 *   - Export `appendSynthesizedCommit(state, oid)` from schema.ts (T-01).
 *   - Wire append calls in CommitOrchestrator.commitSuccess and commitRound (T-08).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { JobState, StepRun } from "../../../src/state/schema.js";
// appendSynthesizedCommit is added by T-01 — RED until implemented
import { appendSynthesizedCommit } from "../../../src/state/schema.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ─────────────────────────────────────────────────────────────────────────────
// Minimal JobState fixture (no synthesizedCommits — legacy format)
// ─────────────────────────────────────────────────────────────────────────────

function makeLegacyState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job-id-001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/my-slug/request.md",
      title: "Test Change",
      type: "spec-change",
      slug: "my-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "change/my-slug-abc",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-022: synthesizedCommits は既存 state.json と後方互換である
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-022: synthesizedCommits は既存 state.json と後方互換である", () => {
  it("synthesizedCommits を持たない既存 state は undefined として扱われる", () => {
    // Legacy state has no synthesizedCommits field
    const legacy = makeLegacyState();

    // TC-001 acceptance: synthesizedCommits absent → treated as empty set
    // This must not throw or cause type errors after T-01 adds the optional field
    expect(legacy.synthesizedCommits).toBeUndefined();
  });

  it("appendSynthesizedCommit は synthesizedCommits absent の state に初回 OID を追加できる", () => {
    const legacy = makeLegacyState(); // no synthesizedCommits
    const oid = "first-commit-oid-abc";

    const updated = appendSynthesizedCommit(legacy, oid);

    expect(updated.synthesizedCommits).toBeDefined();
    expect(updated.synthesizedCommits).toContain(oid);
    expect(updated.synthesizedCommits).toHaveLength(1);
  });

  it("append 後も元の state は変化しない（pure transform）", () => {
    const legacy = makeLegacyState();
    const oid = "commit-oid-xyz";

    const updated = appendSynthesizedCommit(legacy, oid);

    // original state unchanged (immutable projection)
    expect(legacy.synthesizedCommits).toBeUndefined();
    // updated state has the OID
    expect(updated.synthesizedCommits).toContain(oid);
  });

  it("StepRun.commitOid は synthesizedCommits とは独立した field であり影響を受けない", () => {
    // After T-01 adds synthesizedCommits, StepRun.commitOid must still work independently.
    const stepRun: StepRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "approved", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T01:00:00.000Z",
      commitOid: "step-commit-oid-def",
    };

    expect(stepRun.commitOid).toBe("step-commit-oid-def");
    // synthesizedCommits is on JobState, not StepRun — type check via absence
    expect(Object.keys(stepRun)).not.toContain("synthesizedCommits");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-023: sequential 合成 commit OID が synthesizedCommits 台帳に append される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-023: sequential 合成 commit OID が synthesizedCommits 台帳に append される", () => {
  it("appendSynthesizedCommit は OID を synthesizedCommits に追加する", () => {
    const state = makeLegacyState();
    const oid = "sequential-synth-oid-111";

    const updated = appendSynthesizedCommit(state, oid);

    expect(updated.synthesizedCommits).toContain(oid);
  });

  it("複数の append は順序保存で全 OID を蓄積する", () => {
    const state = makeLegacyState();
    const oid1 = "sequential-oid-aaa";
    const oid2 = "sequential-oid-bbb";
    const oid3 = "sequential-oid-ccc";

    const s1 = appendSynthesizedCommit(state, oid1);
    const s2 = appendSynthesizedCommit(s1, oid2);
    const s3 = appendSynthesizedCommit(s2, oid3);

    expect(s3.synthesizedCommits).toContain(oid1);
    expect(s3.synthesizedCommits).toContain(oid2);
    expect(s3.synthesizedCommits).toContain(oid3);
    expect(s3.synthesizedCommits).toHaveLength(3);
  });

  it("重複 OID は追加されない（append-only dedup）", () => {
    const state = makeLegacyState();
    const oid = "duplicate-oid-999";

    const s1 = appendSynthesizedCommit(state, oid);
    const s2 = appendSynthesizedCommit(s1, oid); // same OID again

    expect(s2.synthesizedCommits).toHaveLength(1);
    expect(s2.synthesizedCommits).toContain(oid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-024: round 合成 commit OID が synthesizedCommits 台帳に append される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-024: round 合成 commit OID が synthesizedCommits 台帳に append される", () => {
  it("round 合成 commit OID は sequential OID と同じ台帳に蓄積される", () => {
    // Simulates T-08: CommitOrchestrator.commitRound appends round OID
    const state = makeLegacyState();
    const sequentialOid = "seq-step-oid-aaa";
    const roundOid = "round-synth-oid-bbb";

    const s1 = appendSynthesizedCommit(state, sequentialOid); // sequential step
    const s2 = appendSynthesizedCommit(s1, roundOid); // round commit

    expect(s2.synthesizedCommits).toContain(sequentialOid);
    expect(s2.synthesizedCommits).toContain(roundOid);
    expect(s2.synthesizedCommits).toHaveLength(2);
  });

  it("round OID が台帳に記録されているため egress 照合で誤 halt しない", () => {
    // Verify that an OID in synthesizedCommits is found by Set-lookup (O(1) check)
    const roundOid = "round-commit-oid-ccc";
    const state = makeLegacyState();

    const updated = appendSynthesizedCommit(state, roundOid);
    const ledger = updated.synthesizedCommits ?? [];

    // egress verification logic: OID is in ledger → pass
    expect(new Set(ledger).has(roundOid)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-025: verification（CLI step）commit OID が台帳に append され後続 push が誤 halt しない
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-025: verification commit OID が台帳に append され後続 push が誤 halt しない", () => {
  it("verification OID が台帳に append されると egress 照合が通る", () => {
    // Simulates T-08: runCliStep captures exit-HEAD, CommitOrchestrator appends to ledger
    const verificationOid = "verification-commit-oid-ddd";
    const state = makeLegacyState();

    const updated = appendSynthesizedCommit(state, verificationOid);
    const ledger = new Set(updated.synthesizedCommits ?? []);

    expect(ledger.has(verificationOid)).toBe(true);
  });

  it("append は state を write する層でのみ行われる（git 層は OID を in-memory で渡すのみ）", () => {
    // This is a design constraint (B-13): appendSynthesizedCommit is a pure state transform.
    // It must not perform any I/O (no git, no file system calls).
    // Test: it is synchronous and has no async signature.
    const state = makeLegacyState();
    const oid = "verif-oid-eee";

    // appendSynthesizedCommit must be a synchronous pure function (no Promise return)
    const result = appendSynthesizedCommit(state, oid);

    // Not a Promise
    expect(result).not.toHaveProperty("then");
    expect(result.synthesizedCommits).toContain(oid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-029: revision 束縛・canonHash 束縛の既存挙動が保存される (must)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-029: revision 束縛・canonHash 束縛の既存挙動が保存される", () => {
  it("StepRun.commitOid は agent step の exit-HEAD として機能する（意味論不変）", () => {
    // This test documents existing behavior that must NOT regress after T-01 adds synthesizedCommits.
    // StepRun.commitOid records the exit-HEAD of an agent step for revision binding.
    const state = makeLegacyState({
      steps: {
        "test-materialize": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T01:00:00.000Z",
            commitOid: "test-materialize-head-oid",
          } satisfies StepRun,
        ],
        "implementer": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T02:00:00.000Z",
            endedAt: "2026-01-01T03:00:00.000Z",
            commitOid: "implementer-head-oid",
          } satisfies StepRun,
        ],
      },
    });

    const tmRuns = state.steps?.["test-materialize"] ?? [];
    const implRuns = state.steps?.["implementer"] ?? [];

    expect(tmRuns[0]?.commitOid).toBe("test-materialize-head-oid");
    expect(implRuns[0]?.commitOid).toBe("implementer-head-oid");

    // Base and candidate OID for bite-evidence gate
    const baseOid = tmRuns[0]?.commitOid;
    const candidateOid = implRuns[0]?.commitOid;
    expect(baseOid).toBeDefined();
    expect(candidateOid).toBeDefined();
    expect(baseOid).not.toBe(candidateOid);
  });

  it("synthesizedCommits 追加後も JobState.steps[stepName][n].commitOid は変化しない", () => {
    // Adding synthesizedCommits to JobState must not affect the nested commitOid field
    const commitOid = "implementer-exit-head-abc";
    const state = makeLegacyState({
      steps: {
        "implementer": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T01:00:00.000Z",
            commitOid,
          },
        ],
      },
    });

    // Add synthesizedCommits to state (simulating T-01)
    const updated = appendSynthesizedCommit(state, "synth-oid-xxx");

    // commitOid is unchanged
    expect(updated.steps?.["implementer"]?.[0]?.commitOid).toBe(commitOid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-030: StepRun.commitOid の型定義・docstring が無改変である (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-030: StepRun.commitOid の型定義・docstring が無改変である", () => {
  const typesPath = path.join(ROOT, "src/state/schema/types.ts");

  it("src/state/schema/types.ts exists", () => {
    expect(existsSync(typesPath)).toBe(true);
  });

  it("StepRun.commitOid のフィールド定義が存在する", () => {
    if (!existsSync(typesPath)) return;
    const content = readFileSync(typesPath, "utf-8");
    // The commitOid field must still exist
    expect(content).toMatch(/commitOid\?\s*:/);
  });

  it("StepRun.commitOid の docstring に 'Capture asymmetry' または同等の説明が存在する", () => {
    if (!existsSync(typesPath)) return;
    const content = readFileSync(typesPath, "utf-8");
    // Key phrase from the original docstring
    expect(
      content,
      "StepRun.commitOid docstring must contain 'Capture asymmetry' — not changed by T-01",
    ).toContain("Capture asymmetry");
  });

  it("synthesizedCommits は StepRun ではなく JobState に追加された独立 field である", () => {
    if (!existsSync(typesPath)) return;
    const content = readFileSync(typesPath, "utf-8");

    // commitOid must still be a field of StepRun (T-01 must not move it)
    const stepRunBlock = content.match(/interface StepRun\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(
      stepRunBlock,
      "commitOid must remain in StepRun interface",
    ).toContain("commitOid");

    // synthesizedCommits must be a field of JobState (T-01 adds it there)
    const jobStateBlock = content.match(/interface JobState\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    // After T-01: synthesizedCommits appears in JobState block
    // Before T-01: this assertion is RED (field doesn't exist yet)
    expect(
      jobStateBlock,
      "synthesizedCommits must be in JobState (T-01 adds it) — RED until T-01",
    ).toContain("synthesizedCommits");
  });
});
