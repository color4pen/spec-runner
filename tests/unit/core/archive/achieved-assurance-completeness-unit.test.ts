/**
 * Unit tests for deriveAchievedAssurance: achieved-assurance completeness.
 *
 *   - TC-003: testCaseGenOid absent → testDerivation absent
 *   - TC-004: test-cases.md hash mismatch → testDerivation absent
 *   - TC-007: spec-review verdict approved + spec.md unchanged → specReview:"required"
 *   - TC-010: no spec-review run → specReview absent
 *   - TC-011: verdict needs-fix → specReview absent
 *   - TC-012: verdict escalation → specReview absent
 *   - TC-013: verdict null → specReview absent
 *   - TC-022: test-cases.md readFileAtCommit unavailable → testDerivation absent
 *   - TC-023: state.request.slug missing → testDerivation absent
 *   - TC-024: test-cases.md@finalHeadOid unavailable → testDerivation absent
 *   - TC-025: non-forward type + intact scenario → testDerivation frozen (biteEvidence dimension removed)
 *   - Positive path: scenario frozen + forward type → testDerivation=frozen
 *   - Never throws invariant
 *
 * Removed (biteEvidence feature removed):
 *   - TC-014: chore type → biteEvidence absent
 *   - TC-015: spec-change type → biteEvidence absent
 *   - TC-016: FORWARD_TYPES exported from gate.ts
 *   - TC-020: runTestsAtCommit unavailable → biteEvidence absent
 *   - TC-021: HEAD partial green → biteEvidence absent
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { deriveAchievedAssurance } from "../../../../src/core/archive/achieved-assurance.js";
import type { AssuranceProvenanceRuntime } from "../../../../src/core/archive/achieved-assurance.js";

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/test-repo";
const SLUG = "my-slug";
const FINAL_HEAD_OID = "archive-head-sha-unit-001";

/** OID assigned to the test-case-gen confirmation commit (the "anchor"). */
const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-unit-001";
const SPEC_REVIEW_OID = "spec-review-commit-sha-unit-001";

const TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: sample\n";
const TEST_CASES_CONTENT_MODIFIED = "# Test Cases MODIFIED\n\nWAS CHANGED AFTER TEST-CASE-GEN\n";

const SPEC_CONTENT = "# Spec\n\n## Requirement: foo\n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    synthesizedCommits: ["bootstrap-commit-sha-unit-001"],
    pullRequest: {
      url: "https://github.com/user/repo/pull/1",
      number: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFakeRuntime(options: {
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";
  testCasesMdAtHead?: CommitFileResult | "unavailable";
  specMdAtAnchor?: CommitFileResult | "unavailable";
  specMdAtHead?: CommitFileResult | "unavailable";
} = {}): AssuranceProvenanceRuntime {
  const defaultTestCasesMdResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: TEST_CASES_CONTENT,
  };
  const defaultSpecMdResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
    content: SPEC_CONTENT,
  };

  const resolvedTcAtAnchor = options.testCasesMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@anchor unavailable" }
    : (options.testCasesMdAtAnchor ?? defaultTestCasesMdResult);
  const resolvedTcAtHead = options.testCasesMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@head unavailable" }
    : (options.testCasesMdAtHead ?? defaultTestCasesMdResult);
  const resolvedSpecAtAnchor = options.specMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@anchor unavailable" }
    : (options.specMdAtAnchor ?? defaultSpecMdResult);
  const resolvedSpecAtHead = options.specMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@head unavailable" }
    : (options.specMdAtHead ?? defaultSpecMdResult);

  return {
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
}

const FLOOR_TEST_DERIVATION_REQUIRED = { testDerivation: "frozen" as const };
const FLOOR_SPEC_REVIEW_REQUIRED = { specReview: "required" as const };
const FLOOR_BOTH_REQUIRED = { testDerivation: "frozen" as const, specReview: "required" as const };

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-003: testCaseGenOid absent → testDerivation absent
// ---------------------------------------------------------------------------

describe("TC-003: testCaseGenOid absent → testDerivation absent", () => {
  it(
    "TC-003: no test-case-gen step (commitOid absent) → testDerivation absent (fail-closed)",
    async () => {
      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature", includeTestCaseGen: false }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004 / T1: test-cases.md content mismatch → testDerivation absent
// ---------------------------------------------------------------------------

describe("TC-004 / T1: test-cases.md anchor≠HEAD → testDerivation absent", () => {
  it(
    "TC-004: test-cases.md@testCaseGenOid=S, @finalHeadOid=S' → testDerivation absent (scenario tampered after gen)",
    async () => {
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT_MODIFIED,
        },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// T2: cooperative tampering — cross-commit OID binding detects mismatch
// ---------------------------------------------------------------------------

describe("T2: cooperative tampering → cross-commit OID binding still detects mismatch", () => {
  it(
    "T2: test-cases.md@finalHeadOid=S' (tampered) — anchor comparison detects it → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT_MODIFIED,
        },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
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
      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010: no spec-review run → specReview absent
// ---------------------------------------------------------------------------

describe("TC-010: no spec-review run → specReview absent", () => {
  it("TC-010: steps['spec-review'] is empty → achieved.specReview is absent", async () => {
    const state = makeJobState({ specReviewRuns: [] });
    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime,
    });

    expect(achieved.specReview).toBeUndefined();
  });

  it("TC-010: steps['spec-review'] key absent → achieved.specReview is absent", async () => {
    const state = makeJobState();
    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-011: spec-review verdict needs-fix → specReview absent
// ---------------------------------------------------------------------------

describe("TC-011: spec-review verdict needs-fix → specReview absent", () => {
  it("TC-011: latest run verdict=needs-fix → specReview absent (fail-closed)", async () => {
    const state = makeJobState({ specReviewRuns: [{ verdict: "needs-fix" }] });
    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: spec-review verdict escalation → specReview absent
// ---------------------------------------------------------------------------

describe("TC-012: spec-review verdict escalation → specReview absent", () => {
  it("TC-012: latest run verdict=escalation → specReview absent (fail-closed)", async () => {
    const state = makeJobState({ specReviewRuns: [{ verdict: "escalation" }] });
    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013: spec-review verdict null → specReview absent
// ---------------------------------------------------------------------------

describe("TC-013: spec-review verdict null → specReview absent", () => {
  it("TC-013: latest run verdict=null → specReview absent (fail-closed)", async () => {
    const state = makeJobState({ specReviewRuns: [{ verdict: null }] });
    const runtime = makeFakeRuntime();

    const { achieved } = await deriveAchievedAssurance({
      state: state as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_SPEC_REVIEW_REQUIRED,
      runtime,
    });

    expect(achieved.specReview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-022 / T5: test-cases.md@testCaseGenOid unavailable → testDerivation absent
// ---------------------------------------------------------------------------

describe("TC-022 / T5: test-cases.md@testCaseGenOid unavailable → testDerivation absent", () => {
  it(
    "TC-022: readFileAtCommit(testCaseGenOid, test-cases.md) unavailable → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime({ testCasesMdAtAnchor: "unavailable" });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-023: state.request.slug missing → testDerivation absent
// ---------------------------------------------------------------------------

describe("TC-023: state.request.slug missing → testDerivation absent", () => {
  it(
    "TC-023: slug is null → cannot resolve archived path → testDerivation absent",
    async () => {
      const state = makeJobState({ slug: null as unknown as string });
      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-024 / T5: test-cases.md@finalHeadOid unavailable → testDerivation absent
// ---------------------------------------------------------------------------

describe("TC-024 / T5: test-cases.md@finalHeadOid unavailable → testDerivation absent", () => {
  it(
    "TC-024: test-cases.md@testCaseGenOid found but @finalHeadOid unavailable → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,
        },
        testCasesMdAtHead: "unavailable",
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-025: non-forward type + intact scenario → testDerivation frozen
// (biteEvidence dimension removed; testDerivation is type-independent)
// ---------------------------------------------------------------------------

describe("TC-025: non-forward type + scenario intact → testDerivation frozen", () => {
  it(
    "TC-025: type=refactoring + scenario freeze intact → testDerivation=frozen",
    async () => {
      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "refactoring" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      // testDerivation is type-independent — must be "frozen" for any type when scenario intact
      expect(achieved.testDerivation).toBe("frozen");
    },
  );
});

// ---------------------------------------------------------------------------
// Positive path: scenario frozen → testDerivation=frozen
// ---------------------------------------------------------------------------

describe("Positive derivation path: scenario frozen + intact runtime", () => {
  it(
    "scenario frozen → testDerivation=frozen",
    async () => {
      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBe("frozen");
    },
  );

  it(
    "both testDerivation and specReview achieved when scenario frozen and spec approved",
    async () => {
      const state = makeJobState({
        type: "new-feature",
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      expect(achieved.testDerivation).toBe("frozen");
      expect(achieved.specReview).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// Never throws invariant
// ---------------------------------------------------------------------------

describe("deriveAchievedAssurance: never throws", () => {
  it("does not throw for null runtime", async () => {
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_TEST_DERIVATION_REQUIRED,
      runtime: null,
    })).resolves.toBeDefined();
  });

  it("does not throw for undefined finalHeadOid", async () => {
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: undefined,
      cwd: CWD,
      floor: FLOOR_TEST_DERIVATION_REQUIRED,
      runtime: makeFakeRuntime(),
    })).resolves.toBeDefined();
  });
});
