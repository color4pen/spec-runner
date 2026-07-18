/**
 * Unit tests for deriveAchievedAssurance: achieved-assurance completeness.
 *
 * Tests the new behaviors introduced by the achieved-assurance-completeness change:
 *   - TC-003: lineage frozen hash null → testDerivation + biteEvidence absent
 *   - TC-004: test-cases.md hash mismatch → testDerivation + biteEvidence absent
 *   - TC-007: spec-review verdict approved → specReview:"required"
 *   - TC-010: no spec-review run → specReview absent
 *   - TC-011: verdict needs-fix → specReview absent
 *   - TC-012: verdict escalation → specReview absent
 *   - TC-013: verdict null → specReview absent
 *   - TC-014: chore type → biteEvidence absent (type gate)
 *   - TC-015: spec-change type → biteEvidence absent (type gate)
 *   - TC-016: FORWARD_TYPES exported from gate.ts (single source of truth)
 *   - TC-020: runTestsAtCommit(finalHeadOid) unavailable → biteEvidence absent
 *   - TC-021: HEAD partial green → biteEvidence absent (complete coverage required)
 *   - TC-022: events.jsonl readFileAtCommit unavailable → testDerivation + biteEvidence absent
 *   - TC-023: state.request.slug missing → testDerivation + biteEvidence absent
 *   - TC-024: test-cases.md readFileAtCommit unavailable → testDerivation + biteEvidence absent
 *   - TC-025: non-forward type + intact scenario → testDerivation frozen, biteEvidence absent
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// CommitFileResult is the NEW type that will be added to runtime-strategy.ts (T-01).
// Tests reference it before implementation exists — these tests will be red until implemented.
type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/test-repo";
const SLUG = "my-slug";
const BASE_OID = "base-commit-sha-unit-001";
const FINAL_HEAD_OID = "archive-head-sha-unit-001";
const TEST_FILE = "tests/unit/foo.test.ts";

// Commit OID anchors for revision-binding checks (D1 / D2).
const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-unit-001";
const SPEC_REVIEW_OID = "spec-review-commit-sha-unit-001";

// Predefined test-cases.md content (anchor = S, head-tampered = S').
const TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: sample\n";
const TEST_CASES_CONTENT_MODIFIED = "# Test Cases MODIFIED\n\nWAS CHANGED AFTER TEST-CASE-GEN\n";

// Predefined spec.md content for specReview blob binding tests.
const SPEC_CONTENT = "# Spec\n\n## Requirement: foo\n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a job state with configurable fields.
 * Defaults to a "new-feature" type with test-case-gen, test-materialize and implementer steps set.
 */
function makeJobState(overrides: {
  type?: string;
  slug?: string | null;
  specReviewRuns?: Array<{ verdict: string | null; commitOid?: string }>;
  includeTestMaterialize?: boolean;
  includeTestCaseGen?: boolean;
} = {}) {
  const {
    type = "new-feature",
    slug = SLUG,
    specReviewRuns,
    includeTestMaterialize = true,
    includeTestCaseGen = true,
  } = overrides;

  const specReviewSteps = specReviewRuns
    ? specReviewRuns.map((r, i) => ({
        attempt: i + 1,
        sessionId: null,
        outcome: { verdict: r.verdict, findingsPath: null, error: null },
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:02:00.000Z",
        ...(r.commitOid !== undefined ? { commitOid: r.commitOid } : {}),
      }))
    : undefined;

  const steps: Record<string, unknown[]> = {};

  if (includeTestCaseGen) {
    steps["test-case-gen"] = [
      {
        attempt: 1,
        sessionId: null,
        outcome: { verdict: "success", findingsPath: null, error: null },
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:30.000Z",
        commitOid: TEST_CASE_GEN_OID,
      },
    ];
  }

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
        commitOid: "candidate-sha-unit-001",
      },
    ];
  }

  if (specReviewSteps !== undefined) {
    steps["spec-review"] = specReviewSteps;
  }

  return {
    version: 2,
    jobId: "unit-test-job",
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
 * Build a "fully achieved" fake runtime for the revision-binding implementation:
 * - base:red for BASE_OID
 * - HEAD:green for FINAL_HEAD_OID
 * - scenario revision-binding intact (test-cases.md@testCaseGenOid === test-cases.md@finalHeadOid)
 * - blob freeze intact (no diff between base and HEAD)
 * - specReview blob binding intact (spec.md@specReviewOid === spec.md@finalHeadOid)
 *
 * readFileAtCommit dispatches by OID + suffix:
 *   test-cases.md: TEST_CASE_GEN_OID → testCasesMdAtAnchor; FINAL_HEAD_OID → testCasesMdAtHead
 *   spec.md:       SPEC_REVIEW_OID   → specMdAtAnchor;     FINAL_HEAD_OID → specMdAtHead
 *   Default (same content at anchor and HEAD) → both bindings intact.
 */
function makeFakeRuntime(options: {
  changedFiles?: string[] | "unavailable";
  diffFiles?: string[] | "unavailable";
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";
  testCasesMdAtHead?: CommitFileResult | "unavailable";
  specMdAtAnchor?: CommitFileResult | "unavailable";
  specMdAtHead?: CommitFileResult | "unavailable";
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
  } = options;

  // Default: test-cases.md has same content at anchor and HEAD (scenario freeze intact).
  const defaultTestCasesMdResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: TEST_CASES_CONTENT,
  };
  // Default: spec.md has same content at anchor and HEAD (specReview binding intact).
  const defaultSpecMdResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
    content: SPEC_CONTENT,
  };

  const resolvedTcAtAnchor = testCasesMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@anchor unavailable" }
    : (testCasesMdAtAnchor ?? defaultTestCasesMdResult);
  const resolvedTcAtHead = testCasesMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@head unavailable" }
    : (testCasesMdAtHead ?? defaultTestCasesMdResult);
  const resolvedSpecAtAnchor = specMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@anchor unavailable" }
    : (specMdAtAnchor ?? defaultSpecMdResult);
  const resolvedSpecAtHead = specMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@head unavailable" }
    : (specMdAtHead ?? defaultSpecMdResult);

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
      return { kind: "success", files: diffFiles };
    },

    async runTestsAtCommit(
      oid: string,
      _testFiles: string[],
      _cwd: string,
      _config: unknown,
    ): Promise<IsolatedTestResult> {
      if (oid === FINAL_HEAD_OID) {
        return headTestResults;
      }
      return baseTestResults;
    },

    // OID-discriminated dispatch for revision-binding verification.
    async readFileAtCommit(
      oid: string,
      pathSuffix: string,
      _cwd: string,
    ): Promise<CommitFileResult> {
      if (pathSuffix.endsWith("test-cases.md")) {
        if (oid === TEST_CASE_GEN_OID) return resolvedTcAtAnchor;
        if (oid === FINAL_HEAD_OID) return resolvedTcAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for test-cases.md` };
      }
      if (pathSuffix.endsWith("spec.md")) {
        if (oid === SPEC_REVIEW_OID) return resolvedSpecAtAnchor;
        if (oid === FINAL_HEAD_OID) return resolvedSpecAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for spec.md` };
      }
      return { kind: "unavailable", reason: `fake readFileAtCommit: unknown suffix ${pathSuffix}` };
    },
  };

  return runtime;
}

const FLOOR_BITE_EVIDENCE_REQUIRED = { biteEvidence: "required" as const };
const FLOOR_BOTH_REQUIRED = { testDerivation: "frozen" as const, biteEvidence: "required" as const };
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
// TC-003: testCaseGenOid absent → testDerivation + biteEvidence absent
//
// Scenario revision binding (D1): if no test-case-gen step is recorded (or commitOid
// is missing), deriveAchievedAssurance cannot verify the scenario freeze and
// fail-closes both dimensions.
// ---------------------------------------------------------------------------

describe("TC-003: testCaseGenOid absent → testDerivation + biteEvidence absent", () => {
  it(
    "TC-003: no test-case-gen step (commitOid absent) → both absent (fail-closed)",
    async () => {
      // GIVEN: state has NO test-case-gen step (testCaseGenOid is absent).
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN: deriveAchievedAssurance with both dimensions constrained
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature", includeTestCaseGen: false }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (no anchor OID → cannot cross-commit compare → fail-closed)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004 / T1: test-cases.md content mismatch between anchor and HEAD → both absent
//
// scenario time-boundary (T1): if test-cases.md was modified after test-case-gen commit,
// the cross-commit comparison (anchor OID vs HEAD OID) detects the mismatch → fail-closed.
//
// DESTRUCTIVE INVARIANT: if both readFileAtCommit calls used FINAL_HEAD_OID (same commit),
// the hashes would match (S'===S') and the check would falsely succeed. Keeping the
// cross-commit comparison (testCaseGenOid vs finalHeadOid) is essential.
// ---------------------------------------------------------------------------

describe("TC-004 / T1: test-cases.md anchor≠HEAD → testDerivation + biteEvidence absent", () => {
  it(
    "TC-004: test-cases.md@testCaseGenOid=S, @finalHeadOid=S' → both absent (scenario tampered after gen)",
    async () => {
      // GIVEN: anchor (testCaseGenOid) has original content S; HEAD has modified content S'.
      // DESTRUCTIVE INVARIANT: using finalHeadOid for BOTH reads makes S'===S' → false positive.
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,          // S — original
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT_MODIFIED, // S' — tampered after gen
        },
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (scenario tampered after test-case-gen → fail-closed)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// T2: cooperative tampering — events.jsonl also modified at HEAD, but
// cross-commit OID binding detects via testCaseGenOid anchor.
//
// DESTRUCTIVE INVARIANT: with the OLD events.jsonl-based check (compare frozen hash in
// events.jsonl@HEAD with test-cases.md@HEAD content), an attacker who rewrites BOTH
// files at finalHeadOid can forge a matching hash and bypass the check. The new
// cross-commit OID binding reads test-cases.md@testCaseGenOid (anchor) vs
// test-cases.md@finalHeadOid (HEAD) — the anchor commit is immutable, so the
// tampered HEAD content is detected regardless of what events.jsonl says.
// ---------------------------------------------------------------------------

describe("T2: cooperative tampering → cross-commit OID binding still detects mismatch", () => {
  it(
    "T2: test-cases.md@finalHeadOid=S' (tampered) — anchor comparison detects it → both absent",
    async () => {
      // GIVEN: test-cases.md@testCaseGenOid = S (original, immutable anchor).
      // test-cases.md@finalHeadOid = S' (tampered). events.jsonl is irrelevant (not read).
      // DESTRUCTIVE INVARIANT: reverting to events.jsonl-based check (hash@HEAD vs content@HEAD)
      // would allow an attacker to make the tampered HEAD appear valid by rewriting events.jsonl too.
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,          // S — original anchor content
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT_MODIFIED, // S' — tampered at HEAD
        },
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (cross-commit OID binding detects mismatch even if events.jsonl tampered)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-007: spec-review verdict approved → specReview:"required"
// ---------------------------------------------------------------------------

describe("TC-007: spec-review approved → specReview:required", () => {
  it(
    "TC-007: latest spec-review run verdict=approved + commitOid + spec.md unchanged → specReview=required",
    async () => {
      // GIVEN: latest spec-review run has verdict="approved" with commitOid present.
      // Runtime returns same spec.md content at specReviewOid (anchor) and finalHeadOid (HEAD).
      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const runtime = makeFakeRuntime();
      // Default: specMdAtAnchor and specMdAtHead both return SPEC_CONTENT → hashes match → binding intact.

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: specReview must be "required" (approved + blob binding intact)
      expect(achieved.specReview).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010: no spec-review run → specReview absent
// ---------------------------------------------------------------------------

describe("TC-010: no spec-review run → specReview absent", () => {
  it("TC-010: steps['spec-review'] is empty → achieved.specReview is absent", async () => {
    // GIVEN: no spec-review runs
    const state = makeJobState({
      specReviewRuns: [], // empty array
    });

    const runtime = makeFakeRuntime();

    // WHEN
    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime: runtime as unknown as AssuranceProvenanceRuntime,
    });

    // THEN: absent
    expect(achieved.specReview).toBeUndefined();
  });

  it("TC-010: steps['spec-review'] key absent → achieved.specReview is absent", async () => {
    // GIVEN: no spec-review key in steps
    const state = makeJobState(); // no specReviewRuns

    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime: runtime as unknown as AssuranceProvenanceRuntime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-011: spec-review verdict needs-fix → specReview absent
// ---------------------------------------------------------------------------

describe("TC-011: spec-review verdict needs-fix → specReview absent", () => {
  it("TC-011: latest run verdict=needs-fix → specReview absent (fail-closed)", async () => {
    // GIVEN: latest spec-review run has verdict="needs-fix"
    const state = makeJobState({
      specReviewRuns: [{ verdict: "needs-fix" }],
    });

    const runtime = makeFakeRuntime();

    // WHEN
    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime: runtime as unknown as AssuranceProvenanceRuntime,
    });

    // THEN: absent — needs-fix is not an approved verdict
    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: spec-review verdict escalation → specReview absent
// ---------------------------------------------------------------------------

describe("TC-012: spec-review verdict escalation → specReview absent", () => {
  it("TC-012: latest run verdict=escalation → specReview absent (fail-closed)", async () => {
    const state = makeJobState({
      specReviewRuns: [{ verdict: "escalation" }],
    });

    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime: runtime as unknown as AssuranceProvenanceRuntime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013: spec-review verdict null → specReview absent
// ---------------------------------------------------------------------------

describe("TC-013: spec-review verdict null → specReview absent", () => {
  it("TC-013: latest run verdict=null → specReview absent (fail-closed)", async () => {
    const state = makeJobState({
      specReviewRuns: [{ verdict: null }],
    });

    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime: runtime as unknown as AssuranceProvenanceRuntime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-014: chore type → biteEvidence absent (type gate)
// ---------------------------------------------------------------------------

describe("TC-014: chore type → biteEvidence absent", () => {
  it(
    "TC-014: request.type=chore with base:red + HEAD:green + intact freeze → biteEvidence absent (non-forward type gate)",
    async () => {
      // GIVEN: type=chore (non-forward), everything else intact
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "chore" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: biteEvidence absent (chore is not a forward-strategy type)
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-015: spec-change type → biteEvidence absent (type gate)
// Note: This change itself is a spec-change, so the non-forward gate is self-applicable.
// ---------------------------------------------------------------------------

describe("TC-015: spec-change type → biteEvidence absent", () => {
  it(
    "TC-015: request.type=spec-change with base:red + HEAD:green + intact freeze → biteEvidence absent",
    async () => {
      // GIVEN: type=spec-change (non-forward), everything else intact
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "spec-change" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: biteEvidence absent (spec-change is non-forward)
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-016: FORWARD_TYPES exported from gate.ts
// Single source of truth: in-loop gate and archive floor use the same set.
// ---------------------------------------------------------------------------

describe("TC-016: FORWARD_TYPES exported from gate.ts", () => {
  it(
    "TC-016: FORWARD_TYPES is exported from gate.ts, is a Set containing bug-fix and new-feature",
    async () => {
      // Import the gate module dynamically to check for the FORWARD_TYPES export.
      // Named import of a non-exported value yields undefined in Bun/ESM.
      const gateModule = await import("../../../../src/core/step/bite-evidence/gate.js");
      const FORWARD_TYPES = (gateModule as Record<string, unknown>)["FORWARD_TYPES"] as Set<string> | undefined;

      // THEN: FORWARD_TYPES must be exported and be a Set
      expect(FORWARD_TYPES).toBeDefined();
      expect(FORWARD_TYPES).toBeInstanceOf(Set);
      // THEN: contains exactly bug-fix and new-feature
      expect(FORWARD_TYPES?.has("bug-fix")).toBe(true);
      expect(FORWARD_TYPES?.has("new-feature")).toBe(true);
      // THEN: refactoring / spec-change / chore are NOT in the set
      expect(FORWARD_TYPES?.has("refactoring")).toBe(false);
      expect(FORWARD_TYPES?.has("spec-change")).toBe(false);
      expect(FORWARD_TYPES?.has("chore")).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-020: runTestsAtCommit(finalHeadOid) unavailable → biteEvidence absent
// ---------------------------------------------------------------------------

describe("TC-020: HEAD runTestsAtCommit unavailable → biteEvidence absent", () => {
  it(
    "TC-020: base:red established but runTestsAtCommit(finalHeadOid) unavailable → biteEvidence absent",
    async () => {
      // GIVEN: base:red intact, but HEAD run returns unavailable
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "unavailable", reason: "scopedTestCommand not set" },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: biteEvidence absent — HEAD-green not established
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-021: HEAD partial green → biteEvidence absent (complete coverage required)
// ---------------------------------------------------------------------------

describe("TC-021: HEAD partial green → biteEvidence absent", () => {
  it(
    "TC-021: HEAD results only cover subset of materialized test files → biteEvidence absent",
    async () => {
      // GIVEN: two materialized test files, HEAD only returns green for one
      const TWO_FILES = ["tests/unit/foo.test.ts", "tests/unit/bar.test.ts"];
      const runtime = makeFakeRuntime({
        changedFiles: TWO_FILES,
        baseTestResults: {
          kind: "ran",
          results: TWO_FILES.map((f) => ({ file: f, passed: false })),
        },
        headTestResults: {
          kind: "ran",
          // Only foo is green; bar is missing/red → incomplete coverage
          results: [{ file: "tests/unit/foo.test.ts", passed: true }],
        },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: biteEvidence absent — complete coverage (all files) required
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );

  it(
    "TC-021b: HEAD returns some red results (mixed) → biteEvidence absent",
    async () => {
      // GIVEN: base:red for both files, HEAD: foo=green, bar=red
      const TWO_FILES = ["tests/unit/foo.test.ts", "tests/unit/bar.test.ts"];
      const runtime = makeFakeRuntime({
        changedFiles: TWO_FILES,
        baseTestResults: {
          kind: "ran",
          results: TWO_FILES.map((f) => ({ file: f, passed: false })),
        },
        headTestResults: {
          kind: "ran",
          results: [
            { file: "tests/unit/foo.test.ts", passed: true },
            { file: "tests/unit/bar.test.ts", passed: false }, // still red
          ],
        },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-022 / T5: test-cases.md@testCaseGenOid unavailable → testDerivation + biteEvidence absent
//
// If reading test-cases.md at the anchor commit (testCaseGenOid) returns unavailable,
// the scenario freeze cannot be verified → fail-closed.
// ---------------------------------------------------------------------------

describe("TC-022 / T5: test-cases.md@testCaseGenOid unavailable → both absent", () => {
  it(
    "TC-022: readFileAtCommit(testCaseGenOid, test-cases.md) unavailable → both dimensions absent",
    async () => {
      // GIVEN: reading test-cases.md at the anchor commit (testCaseGenOid) is unavailable.
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: "unavailable",
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (anchor unavailable → scenario freeze cannot be verified → fail-closed)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-023: state.request.slug missing → testDerivation + biteEvidence absent
// ---------------------------------------------------------------------------

describe("TC-023: state.request.slug missing → testDerivation + biteEvidence absent", () => {
  it(
    "TC-023: slug is null → cannot resolve archived path → testDerivation and biteEvidence absent",
    async () => {
      // GIVEN: request.slug = null (cannot suffix-resolve archived path)
      const state = makeJobState({ slug: null as unknown as string });

      const runtime = makeFakeRuntime();

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (cannot suffix-resolve without slug)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-024 / T5: test-cases.md@finalHeadOid unavailable → testDerivation + biteEvidence absent
//
// If the anchor read succeeds but reading test-cases.md at finalHeadOid returns unavailable,
// the cross-commit hash comparison cannot complete → fail-closed.
// ---------------------------------------------------------------------------

describe("TC-024 / T5: test-cases.md@finalHeadOid unavailable → both absent", () => {
  it(
    "TC-024: test-cases.md@testCaseGenOid found but @finalHeadOid unavailable → both absent",
    async () => {
      // GIVEN: anchor (testCaseGenOid) read succeeds; HEAD (finalHeadOid) read is unavailable.
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,
        },
        testCasesMdAtHead: "unavailable",
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (HEAD unavailable → cannot compare hashes → fail-closed)
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-025: non-forward type + scenario intact → testDerivation:"frozen", biteEvidence absent
// Type gate is applied to biteEvidence only; testDerivation is type-independent.
// ---------------------------------------------------------------------------

describe("TC-025: non-forward type + scenario intact → testDerivation frozen, biteEvidence absent", () => {
  it(
    "TC-025: type=refactoring + scenario freeze intact → testDerivation=frozen, biteEvidence absent",
    async () => {
      // GIVEN: type=refactoring (non-forward), two-layer freeze intact, base:red, HEAD:green
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN: floor constrains both testDerivation and biteEvidence
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "refactoring" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: testDerivation = "frozen" (type gate does NOT apply to testDerivation)
      expect(achieved.testDerivation).toBe("frozen");
      // THEN: biteEvidence absent (type gate DOES apply — refactoring is not forward-strategy)
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// Positive path: base:red + HEAD:green + scenario frozen + forward type → biteEvidence achieved
// (This verifies TC-002 at the derivation level — the floor integration version is in
//  achieved-assurance-completeness-integration.test.ts)
// ---------------------------------------------------------------------------

describe("Positive derivation path: base:red + HEAD:green + scenario frozen + forward type", () => {
  it(
    "base:red + HEAD:green + scenario frozen + forward type → biteEvidence=required",
    async () => {
      // GIVEN: all conditions met for forward strategy
      const runtime = makeFakeRuntime({
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: biteEvidence = "required"
      expect(achieved.biteEvidence).toBe("required");
      // THEN: testDerivation = "frozen"
      expect(achieved.testDerivation).toBe("frozen");
    },
  );
});

// ---------------------------------------------------------------------------
// Never throws invariant
// ---------------------------------------------------------------------------

describe("deriveAchievedAssurance: never throws", () => {
  it("does not throw for any invalid input combination", async () => {
    // null runtime should not throw
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      config: undefined,
      floor: FLOOR_BOTH_REQUIRED,
      runtime: null,
    })).resolves.toBeDefined();

    // undefined finalHeadOid should not throw
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: undefined,
      cwd: CWD,
      config: { version: 1 as const, agents: {} },
      floor: FLOOR_BOTH_REQUIRED,
      runtime: makeFakeRuntime() as unknown as AssuranceProvenanceRuntime,
    })).resolves.toBeDefined();
  });
});
