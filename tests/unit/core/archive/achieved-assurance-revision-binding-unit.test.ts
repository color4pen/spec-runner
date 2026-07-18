/**
 * Unit tests for deriveAchievedAssurance: revision-binding change.
 *
 * This file tests the NEW behaviors introduced by assurance-revision-binding:
 *   - TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）
 *   - TC-002: 協調改竄（test-cases.md@HEAD と events.jsonl@HEAD を同時に書き換え）
 *   - TC-003: scenario が anchor から HEAD まで不変（positive）
 *   - TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能（fail-closed 各ケース）
 *   - TC-005: spec-review 確定 commit 後に spec.md を変更（time-boundary）
 *   - TC-006: spec.md が承認から HEAD まで不変（positive）
 *   - TC-007: specReviewOid 欠落 / spec.md 取得不能（fail-closed 各ケース）
 *   - TC-017: blob freeze（diffPathsBetweenCommits）が scenario 凍結とは独立した歯として存置
 *   - TC-018: specReview block が floor.specReview が constrain するときのみ実行
 *   - TC-019: isSpecRequired によって specReview 束縛を緩めない
 *
 * These tests will be RED until the implementation replaces the events.jsonl-based
 * scenario freeze with cross-commit OID comparison (D1 / D2 in tasks.md).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { deriveAchievedAssurance } from "../../../../src/core/archive/achieved-assurance.js";
import type { AssuranceProvenanceRuntime } from "../../../../src/core/archive/achieved-assurance.js";

// ---------------------------------------------------------------------------
// Type aliases (mirror the port types)
// ---------------------------------------------------------------------------

type ChangedFilesResult =
  | { kind: "success"; files: string[] }
  | { kind: "unavailable"; reason: string };

type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/test-repo-rev-unit";
const SLUG = "my-slug";
const BASE_OID = "base-commit-sha-rev-unit-001";
const FINAL_HEAD_OID = "archive-head-sha-rev-unit-001";
const TEST_FILE = "tests/unit/foo.test.ts";

/** OID assigned to the test-case-gen confirmation commit (the "anchor"). */
const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-rev-unit-001";

/** OID assigned to the spec-review confirmation commit (the "anchor" for spec). */
const SPEC_REVIEW_OID = "spec-review-commit-sha-rev-unit-001";

// Scenario test-cases.md content at anchor (test-case-gen confirmation commit).
const SCENARIO_ANCHOR_CONTENT = "# Test Cases (anchor)\n\n## TC-001: sample\nAnchor scenario content.\n";
const SCENARIO_ANCHOR_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(SCENARIO_ANCHOR_CONTENT, "utf8"))
  .digest("hex");

// Scenario test-cases.md content at finalHeadOid when tampered.
// Must differ from SCENARIO_ANCHOR_CONTENT to produce a hash mismatch.
const SCENARIO_TAMPERED_CONTENT = "# Test Cases (TAMPERED)\n\n## TC-001: sample (MODIFIED)\nThis content was changed after test-case-gen.\n";
const SCENARIO_TAMPERED_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(SCENARIO_TAMPERED_CONTENT, "utf8"))
  .digest("hex");

// Spec content at anchor (spec-review confirmation commit).
const SPEC_ANCHOR_CONTENT = "# Spec\n\n## Requirements\nOriginal specification.\n";

// Spec content at finalHeadOid when tampered.
const SPEC_TAMPERED_CONTENT = "# Spec\n\n## Requirements (MODIFIED)\nSpecification was changed after spec-review.\n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal events.jsonl content with a test-case-gen lineage record.
 * Used to configure what the OLD implementation (events.jsonl-based) would see.
 * The NEW implementation does NOT read events.jsonl.
 */
function makeEventsJsonl(frozenHash: string | null): string {
  const lineageRecord = {
    type: "lineage",
    step: "test-case-gen",
    ts: "2026-01-01T00:00:00.000Z",
    outputs: [
      {
        path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
        hash: frozenHash,
      },
    ],
    inputs: [],
  };
  return JSON.stringify(lineageRecord) + "\n";
}

/**
 * Build a job state for revision-binding tests.
 * Includes test-case-gen step (with commitOid) and optionally spec-review step.
 */
function makeJobState(overrides: {
  type?: string;
  slug?: string | null;
  testCaseGenOid?: string | null;   // undefined → no test-case-gen step; null → step with no commitOid
  specReviewRuns?: Array<{ verdict: string | null; commitOid?: string }>;
  includeTestMaterialize?: boolean;
} = {}) {
  const {
    type = "new-feature",
    slug = SLUG,
    specReviewRuns,
    includeTestMaterialize = true,
  } = overrides;
  // Use "in" check so explicit undefined means "no step" (destructuring default would override it).
  const testCaseGenOid = "testCaseGenOid" in overrides ? overrides.testCaseGenOid : TEST_CASE_GEN_OID;

  const steps: Record<string, unknown[]> = {};

  if (includeTestMaterialize) {
    steps["test-materialize"] = [
      {
        attempt: 1,
        sessionId: null,
        outcome: { verdict: "success", findingsPath: null, error: null },
        startedAt: "2026-01-01T00:00:30.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        commitOid: BASE_OID,
      },
    ];
    steps["implementer"] = [
      {
        attempt: 1,
        sessionId: null,
        outcome: { verdict: "success", findingsPath: null, error: null },
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:02:00.000Z",
        commitOid: "candidate-sha-rev-unit-001",
      },
    ];
  }

  // test-case-gen step: undefined → omit; null → include with no commitOid; string → include with that OID
  if (testCaseGenOid !== undefined) {
    const run: Record<string, unknown> = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "success", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:45.000Z",
      endedAt: "2026-01-01T00:00:50.000Z",
    };
    if (testCaseGenOid !== null) {
      run["commitOid"] = testCaseGenOid;
    }
    steps["test-case-gen"] = [run];
  }

  if (specReviewRuns !== undefined) {
    steps["spec-review"] = specReviewRuns.map((r, i) => {
      const run: Record<string, unknown> = {
        attempt: i + 1,
        sessionId: null,
        outcome: { verdict: r.verdict, findingsPath: null, error: null },
        startedAt: "2026-01-01T00:00:20.000Z",
        endedAt: "2026-01-01T00:00:25.000Z",
      };
      if (r.commitOid !== undefined) {
        run["commitOid"] = r.commitOid;
      }
      return run;
    });
  }

  return {
    version: 2,
    jobId: "rev-unit-test-job",
    status: "awaiting-archive",
    worktreePath: null,
    branch: `change/${SLUG}-abc12345`,
    noWorktree: false,
    request: {
      path: `/repo/specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type,
      slug: slug as string,
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    steps,
    pullRequest: {
      url: "https://github.com/user/repo/pull/1",
      number: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Build a fake runtime for revision-binding tests.
 * The key feature is OID-discriminated readFileAtCommit:
 *   - test-cases.md@TEST_CASE_GEN_OID → testCasesMdAtAnchor (anchor OID content)
 *   - test-cases.md@FINAL_HEAD_OID    → testCasesMdAtHead   (final HEAD content)
 *   - spec.md@SPEC_REVIEW_OID         → specMdAtAnchor      (anchor OID content)
 *   - spec.md@FINAL_HEAD_OID          → specMdAtHead        (final HEAD content)
 *   - events.jsonl@FINAL_HEAD_OID     → eventsJsonlAtHead   (for OLD impl compat)
 *
 * Defaults model a "fully achieved" scenario-frozen + specReview-approved job:
 *   - test-cases.md is the same at anchor and HEAD (scenario freeze intact)
 *   - spec.md is the same at anchor and HEAD (spec binding intact)
 *   - events.jsonl has frozen hash matching the ANCHOR content (OLD impl also passes)
 *   - base:red, HEAD:green, blob freeze intact
 */
function makeFakeRuntime(options: {
  changedFiles?: string[] | "unavailable";
  diffFiles?: string[] | "unavailable";
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
  // OID-discriminated: test-cases.md at anchor OID vs final HEAD OID
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";
  testCasesMdAtHead?: CommitFileResult | "unavailable";
  // OID-discriminated: spec.md at anchor OID vs final HEAD OID
  specMdAtAnchor?: CommitFileResult | "unavailable";
  specMdAtHead?: CommitFileResult | "unavailable";
  // events.jsonl at final HEAD OID (for backward compat with OLD implementation)
  eventsJsonlAtHead?: CommitFileResult | "unavailable";
  includeReadFileAtCommit?: boolean;
} = {}): AssuranceProvenanceRuntime {
  const {
    changedFiles = [TEST_FILE],
    diffFiles = [],
    baseTestResults = { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
    headTestResults = { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
    testCasesMdAtAnchor,
    testCasesMdAtHead,
    specMdAtAnchor,
    specMdAtHead,
    eventsJsonlAtHead,
    includeReadFileAtCommit = true,
  } = options;

  // Default: same content at anchor and HEAD (scenario freeze intact by default)
  const defaultTestCasesMdAtAnchor: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/test-cases.md`,
    content: SCENARIO_ANCHOR_CONTENT,
  };
  const defaultTestCasesMdAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: SCENARIO_ANCHOR_CONTENT, // same as anchor → freeze intact
  };
  const defaultSpecMdAtAnchor: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/spec.md`,
    content: SPEC_ANCHOR_CONTENT,
  };
  const defaultSpecMdAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
    content: SPEC_ANCHOR_CONTENT, // same as anchor → binding intact
  };
  // events.jsonl default: frozen hash matching the ANCHOR content
  // This allows the OLD implementation to see the scenario as intact in positive tests.
  const defaultEventsJsonlAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
    content: makeEventsJsonl(SCENARIO_ANCHOR_HASH),
  };

  const resolvedTestCasesMdAtAnchor = testCasesMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@anchor unavailable" }
    : (testCasesMdAtAnchor ?? defaultTestCasesMdAtAnchor);

  const resolvedTestCasesMdAtHead = testCasesMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@head unavailable" }
    : (testCasesMdAtHead ?? defaultTestCasesMdAtHead);

  const resolvedSpecMdAtAnchor = specMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@anchor unavailable" }
    : (specMdAtAnchor ?? defaultSpecMdAtAnchor);

  const resolvedSpecMdAtHead = specMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@head unavailable" }
    : (specMdAtHead ?? defaultSpecMdAtHead);

  const resolvedEventsJsonlAtHead = eventsJsonlAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake events.jsonl@head unavailable" }
    : (eventsJsonlAtHead ?? defaultEventsJsonlAtHead);

  const runtime: AssuranceProvenanceRuntime = {
    async listCommitChangedFiles(_oid: string, _cwd: string): Promise<ChangedFilesResult> {
      if (changedFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake listCommitChangedFiles unavailable" };
      }
      return { kind: "success", files: changedFiles };
    },

    async diffPathsBetweenCommits(
      _baseOid: string,
      _headOid: string,
      _paths: string[],
      _cwd: string,
    ): Promise<ChangedFilesResult> {
      if (diffFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake diffPathsBetweenCommits unavailable" };
      }
      return { kind: "success", files: diffFiles as string[] };
    },

    async runTestsAtCommit(
      oid: string,
      _testFiles: string[],
      _cwd: string,
      _config: unknown,
    ): Promise<IsolatedTestResult> {
      if (oid === FINAL_HEAD_OID) return headTestResults;
      return baseTestResults;
    },

    async readFileAtCommit(
      oid: string,
      pathSuffix: string,
      _cwd: string,
    ): Promise<CommitFileResult> {
      if (!includeReadFileAtCommit) {
        return { kind: "unavailable", reason: "readFileAtCommit disabled (includeReadFileAtCommit=false)" };
      }

      // OID-discriminated test-cases.md
      if (pathSuffix.endsWith("test-cases.md")) {
        if (oid === TEST_CASE_GEN_OID) return resolvedTestCasesMdAtAnchor;
        if (oid === FINAL_HEAD_OID) return resolvedTestCasesMdAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for test-cases.md` };
      }

      // OID-discriminated spec.md
      if (pathSuffix.endsWith("spec.md")) {
        if (oid === SPEC_REVIEW_OID) return resolvedSpecMdAtAnchor;
        if (oid === FINAL_HEAD_OID) return resolvedSpecMdAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for spec.md` };
      }

      // events.jsonl: only at FINAL_HEAD_OID (for OLD implementation compat — the NEW impl does not read this)
      if (pathSuffix.endsWith("events.jsonl")) {
        if (oid === FINAL_HEAD_OID) return resolvedEventsJsonlAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for events.jsonl` };
      }

      return { kind: "unavailable", reason: `fake: unknown pathSuffix ${pathSuffix}` };
    },
  };

  return runtime;
}

const FLOOR_BITE_EVIDENCE_REQUIRED = { biteEvidence: "required" as const };
const FLOOR_BOTH_REQUIRED = {
  testDerivation: "frozen" as const,
  biteEvidence: "required" as const,
};
const FLOOR_SPEC_REVIEW_REQUIRED = { specReview: "required" as const };

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）
//
// DESTRUCTIVE INVARIANT (破壊確認):
//   跨ぎ比較を同一 commit（finalHeadOid のみ）に戻すと T1 が通ってしまう。
//   具体的には、両 read を FINAL_HEAD_OID で行うと:
//     test-cases.md@FINAL_HEAD_OID = S'（改竄）かつ events.jsonl@FINAL_HEAD_OID の frozen hash = hash(S')
//     → hash 一致 → シナリオ凍結成立（OLD 実装と同型）→ testDerivation="frozen"（誤った通過）
//   正しくは test-cases.md@TEST_CASE_GEN_OID(S) と @FINAL_HEAD_OID(S') を跨いで比較し、
//   不一致 → fail-closed とする。
// ---------------------------------------------------------------------------

describe("TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）", () => {
  it(
    "TC-001: test-cases.md@testCaseGenOid=S と @finalHeadOid=S'（不一致）→ testDerivation + biteEvidence absent（fail-closed）",
    async () => {
      // DESTRUCTIVE INVARIANT: 両 read を finalHeadOid（同一 commit）に戻すと、
      // events.jsonl frozen hash = hash(S') かつ test-cases.md@HEAD = S' → 一致 → testDerivation="frozen"（誤り）
      // 正しくは testCaseGenOid 跨ぎ比較でこの改竄を検出する。

      // Setup: test-cases.md at anchor (TEST_CASE_GEN_OID) = S, at finalHeadOid = S' (tampered)
      // events.jsonl at finalHeadOid has frozen hash = hash(S') — this fools the OLD implementation
      // into thinking the scenario is still intact.
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT, // S
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT, // S' (tampered)
        },
        eventsJsonlAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(SCENARIO_TAMPERED_HASH), // hash(S') — fools OLD impl
        },
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN: cross-commit comparison detects hash(S) ≠ hash(S') → fail-closed
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: 協調改竄（test-cases.md@HEAD と events.jsonl@HEAD を同時に書き換え）
//
// DESTRUCTIVE INVARIANT (破壊確認):
//   events.jsonl frozen hash と finalHeadOid content を比較する旧構造（同一 commit 自己整合）に戻すと、
//   test-cases.md@HEAD = S' かつ events.jsonl@HEAD の frozen hash = hash(S') → 一致 → 通ってしまう。
//   commit-OID 束縛は test-cases.md@testCaseGenOid（S）を読むため、改竄 test-cases.md@HEAD(S') を
//   弾く（fail-closed）ことを固定する。これが #850 の穴（同一 commit 自己整合）を閉じる歯である。
// ---------------------------------------------------------------------------

describe("TC-002: 協調改竄（test-cases.md@HEAD と events.jsonl@HEAD を同時に書き換え）", () => {
  it(
    "TC-002: test-cases.md@HEAD=S'（改竄）+ events.jsonl@HEAD frozen hash=hash(S') でも commit-OID 束縛が fail-closed",
    async () => {
      // DESTRUCTIVE INVARIANT: events.jsonl frozen hash と test-cases.md@HEAD を同一 commit で読む旧構造では、
      // 攻撃者が両者を同時に書き換えると hash(S') == hash(S') で一致し通ってしまう（#850 の穴）。
      // commit-OID 束縛では test-cases.md@testCaseGenOid（S）を基準にするため、この協調改竄を検出できる。

      // Setup: cooperative tampering
      //   - test-cases.md@TEST_CASE_GEN_OID = S (anchor, unchanged)
      //   - test-cases.md@FINAL_HEAD_OID = S' (tampered)
      //   - events.jsonl@FINAL_HEAD_OID: frozen hash = hash(S') (also tampered to match S')
      // With OLD impl (same-commit self-consistency): hash(S') == hash(test-cases.md@HEAD=S') → passes (WRONG)
      // With NEW impl (cross-commit OID binding): hash(S) ≠ hash(S') → fail-closed (CORRECT)
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT, // S (anchor, not tampered)
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT, // S' (tampered at HEAD)
        },
        eventsJsonlAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(SCENARIO_TAMPERED_HASH), // cooperative: hash(S') in events.jsonl too
        },
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN: commit-OID binding reads test-cases.md@testCaseGenOid=S and @HEAD=S'
      // hash(S) ≠ hash(S') → fail-closed — the cooperative tampering of events.jsonl is irrelevant
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-003: scenario が anchor から HEAD まで不変（positive）
// ---------------------------------------------------------------------------

describe("TC-003: scenario が anchor から HEAD まで不変（positive）", () => {
  it(
    "TC-003: test-cases.md が testCaseGenOid から finalHeadOid まで不変（S == S'）→ testDerivation=frozen + biteEvidence=required",
    async () => {
      // GIVEN: scenario unchanged — same content at anchor OID and final HEAD OID
      // base:red, HEAD:green, blob freeze intact, forward type
      const runtime = makeFakeRuntime({
        // defaults: same SCENARIO_ANCHOR_CONTENT at both anchor and HEAD
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // State includes test-case-gen step with commitOid = TEST_CASE_GEN_OID
      const state = makeJobState({ type: "new-feature" });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN: cross-commit comparison sees same content → scenario freeze intact
      // blob freeze intact (diffFiles=[]) → testDerivation="frozen"
      // forward type + base:red + HEAD:green → biteEvidence="required"
      expect(achieved.testDerivation).toBe("frozen");
      expect(achieved.biteEvidence).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能（fail-closed 各ケース）
// ---------------------------------------------------------------------------

describe("TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能（fail-closed）", () => {
  it(
    "TC-004(i): testCaseGenOid 欠落（test-case-gen step なし）→ testDerivation + biteEvidence absent",
    async () => {
      // GIVEN: no test-case-gen step in state → testCaseGenOid absent
      // events.jsonl@HEAD has valid hash so OLD impl would pass — NEW impl must fail-closed
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const state = makeJobState({ testCaseGenOid: undefined }); // no test-case-gen step

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );

  it(
    "TC-004(ii): test-case-gen step 存在するが commitOid なし → testDerivation + biteEvidence absent",
    async () => {
      // GIVEN: test-case-gen step exists but has no commitOid (null sentinel)
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const state = makeJobState({ testCaseGenOid: null }); // step present, no commitOid

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );

  it(
    "TC-004(iii): test-cases.md@testCaseGenOid unavailable → testDerivation + biteEvidence absent",
    async () => {
      // GIVEN: readFileAtCommit(testCaseGenOid, test-cases.md) → unavailable
      // events.jsonl@HEAD is valid so OLD impl would pass if it reached it
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: "unavailable", // cannot read test-cases.md at anchor OID
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );

  it(
    "TC-004(iv): test-cases.md@finalHeadOid unavailable → testDerivation + biteEvidence absent",
    async () => {
      // GIVEN: readFileAtCommit(finalHeadOid, test-cases.md) → unavailable
      const runtime = makeFakeRuntime({
        testCasesMdAtHead: "unavailable", // cannot read test-cases.md at HEAD OID
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );

  it(
    "TC-004(v): slug 欠落 → testDerivation + biteEvidence absent",
    async () => {
      // GIVEN: state.request.slug is null → cannot suffix-resolve archived path
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const state = makeJobState({ slug: null as unknown as string });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: spec-review 確定 commit の後に spec.md を変更（time-boundary）
// ---------------------------------------------------------------------------

describe("TC-005: spec-review 確定 commit 後に spec.md を変更（time-boundary）", () => {
  it(
    "TC-005: spec.md@specReviewOid=SPEC と @finalHeadOid=SPEC'（不一致）→ specReview absent（fail-closed）",
    async () => {
      // GIVEN: latest spec-review verdict=approved, specReviewOid present
      // spec.md at specReviewOid (anchor) = SPEC_ANCHOR_CONTENT
      // spec.md at finalHeadOid = SPEC_TAMPERED_CONTENT (changed after review)
      // OLD implementation: only checks verdict → sets specReview="required" (WRONG)
      // NEW implementation: compares spec.md at both OIDs → mismatch → fail-closed
      const runtime = makeFakeRuntime({
        specMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/spec.md`,
          content: SPEC_ANCHOR_CONTENT, // original spec
        },
        specMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
          content: SPEC_TAMPERED_CONTENT, // spec changed after review
        },
      });

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      // THEN: cross-commit binding detects spec.md mismatch → specReview absent
      expect(achieved.specReview).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: spec.md が承認から HEAD まで不変（positive）
// ---------------------------------------------------------------------------

describe("TC-006: spec.md が承認から HEAD まで不変（positive）", () => {
  it(
    "TC-006: spec.md@specReviewOid と @finalHeadOid が同一内容 + verdict=approved → specReview=required",
    async () => {
      // GIVEN: spec.md unchanged between spec-review confirmation and final HEAD
      // defaults: same SPEC_ANCHOR_CONTENT at both anchor and HEAD
      const runtime = makeFakeRuntime();

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      // THEN: approved verdict + identical spec.md blobs → specReview="required"
      expect(achieved.specReview).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-007: specReviewOid 欠落 / spec.md 取得不能（fail-closed 各ケース）
// ---------------------------------------------------------------------------

describe("TC-007: specReviewOid 欠落 / spec.md 取得不能（fail-closed）", () => {
  it(
    "TC-007(i): specReviewOid 欠落（commitOid なし spec-review run）→ specReview absent",
    async () => {
      // GIVEN: spec-review run with verdict=approved but NO commitOid
      // OLD implementation: only checks verdict → approved → sets specReview="required" (WRONG)
      // NEW implementation: specReviewOid absent → fail-closed
      const runtime = makeFakeRuntime();

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved" }], // no commitOid
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );

  it(
    "TC-007(ii): spec.md@specReviewOid unavailable → specReview absent",
    async () => {
      // GIVEN: specReviewOid present but readFileAtCommit(specReviewOid, spec.md) unavailable
      // OLD implementation: doesn't read spec.md → sets specReview="required" (WRONG)
      // NEW implementation: unavailable → fail-closed
      const runtime = makeFakeRuntime({
        specMdAtAnchor: "unavailable",
      });

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );

  it(
    "TC-007(iii): spec.md@finalHeadOid unavailable → specReview absent",
    async () => {
      // GIVEN: specReviewOid present but readFileAtCommit(finalHeadOid, spec.md) unavailable
      // OLD implementation: doesn't read spec.md → sets specReview="required" (WRONG)
      // NEW implementation: unavailable → fail-closed
      const runtime = makeFakeRuntime({
        specMdAtHead: "unavailable",
      });

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-017: blob freeze（diffPathsBetweenCommits）が scenario 凍結とは独立した歯として存置
//
// scenario freeze (TC-001 束縛) と blob freeze (diffPathsBetweenCommits) は独立した歯。
// scenario が anchor↔HEAD 一致であっても、materialized test file が改竄された場合は fail-closed。
// ---------------------------------------------------------------------------

describe("TC-017: blob freeze は scenario 凍結と独立した歯として存置", () => {
  it(
    "TC-017: scenario 凍結成立（test-cases.md 不変）だが materialized test file が改竄 → testDerivation + biteEvidence absent",
    async () => {
      // GIVEN: scenario intact (same test-cases.md at anchor and HEAD)
      // BUT: blob freeze broken (materialized test file changed between baseOid and finalHeadOid)
      const runtime = makeFakeRuntime({
        // scenario intact: same content at both OIDs (defaults)
        // blob freeze broken: test file appears in diff
        diffFiles: [TEST_FILE], // test file was modified between base and HEAD → tamper detected
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN: blob freeze broken → both absent (independent of scenario freeze)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-018: specReview block が floor.specReview が constrain するときのみ実行
// Priority: should
// ---------------------------------------------------------------------------

describe("TC-018: specReview block は floor.specReview が constrain するときのみ I/O を実行", () => {
  it(
    "TC-018: floor.specReview = undefined（constrain しない）→ spec.md の readFileAtCommit が呼ばれない",
    async () => {
      // GIVEN: floor has no specReview constraint
      const readFileAtCommitCalls: Array<{ oid: string; pathSuffix: string }> = [];

      const runtime = makeFakeRuntime();
      const originalReadFileAtCommit = runtime.readFileAtCommit!.bind(runtime);
      runtime.readFileAtCommit = async (oid, pathSuffix, cwd) => {
        readFileAtCommitCalls.push({ oid, pathSuffix });
        return originalReadFileAtCommit(oid, pathSuffix, cwd);
      };

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      // Floor: only biteEvidence, no specReview constraint
      await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED, // no specReview field
        runtime,
      });

      // THEN: no readFileAtCommit calls for spec.md (I/O only when constrained)
      const specMdCalls = readFileAtCommitCalls.filter((c) => c.pathSuffix.endsWith("spec.md"));
      expect(specMdCalls).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-019: isSpecRequired によって specReview 束縛を緩めない
// Priority: should
//
// spec-exempt type（isSpecRequired = false の type）であっても、
// floor.specReview が required を要求する場合は spec.md 束縛を緩めてはならない。
// ---------------------------------------------------------------------------

describe("TC-019: isSpecRequired によって specReview 束縛を緩めない", () => {
  it(
    "TC-019: spec-exempt type + floor.specReview=required + spec.md unavailable → specReview absent（fail-closed）",
    async () => {
      // GIVEN: type=chore (isSpecRequired=false for such types, but this is irrelevant to the binding)
      // spec.md@specReviewOid = unavailable
      // OLD implementation: only checks verdict → approved → specReview="required" (WRONG)
      // NEW implementation: spec.md unavailable → fail-closed regardless of type
      const runtime = makeFakeRuntime({
        specMdAtAnchor: "unavailable",
        specMdAtHead: "unavailable",
      });

      const state = makeJobState({
        type: "chore", // spec-exempt type
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      // THEN: spec-exempt type does not relax the binding — spec.md unavailable → fail-closed
      expect(achieved.specReview).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// Never throws invariant (backward-compat)
// ---------------------------------------------------------------------------

describe("deriveAchievedAssurance revision-binding: never throws", () => {
  it("TC-017 invariant: null runtime does not throw", async () => {
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: undefined,
      floor: FLOOR_BOTH_REQUIRED,
      runtime: null,
    })).resolves.toBeDefined();
  });

  it("TC-017 invariant: undefined finalHeadOid does not throw", async () => {
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: undefined,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_BOTH_REQUIRED,
      runtime: makeFakeRuntime(),
    })).resolves.toBeDefined();
  });
});
