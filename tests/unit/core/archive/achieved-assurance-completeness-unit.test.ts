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

// Predefined test-cases.md content and its canonical hash.
// digestArtifacts uses sha256 over utf8 bytes of the file content.
const TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: sample\n";
const TEST_CASES_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(TEST_CASES_CONTENT, "utf8"))
  .digest("hex");

// A mismatched hash (different from TEST_CASES_HASH).
const WRONG_HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal events.jsonl content with a test-case-gen lineage record.
 * frozenHash: the hash value to embed in the test-cases.md output entry.
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
 * Create a job state with configurable fields.
 * Defaults to a "new-feature" type with test-materialize and implementer steps set.
 */
function makeJobState(overrides: {
  type?: string;
  slug?: string | null;
  specReviewRuns?: Array<{ verdict: string | null }>;
  includeTestMaterialize?: boolean;
} = {}) {
  const {
    type = "new-feature",
    slug = SLUG,
    specReviewRuns,
    includeTestMaterialize = true,
  } = overrides;

  const specReviewSteps = specReviewRuns
    ? specReviewRuns.map((r, i) => ({
        attempt: i + 1,
        sessionId: null,
        outcome: { verdict: r.verdict, findingsPath: null, error: null },
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:02:00.000Z",
      }))
    : undefined;

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
 * Build a "fully achieved" fake runtime for the new implementation:
 * - base:red for BASE_OID
 * - HEAD:green for FINAL_HEAD_OID
 * - scenario two-layer freeze intact (events.jsonl frozen hash matches test-cases.md content hash)
 * - blob freeze intact (no diff between base and HEAD)
 *
 * Options allow injecting failures at specific points to produce red tests.
 */
function makeFakeRuntime(options: {
  changedFiles?: string[] | "unavailable";
  diffFiles?: string[] | "unavailable";
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
  eventsJsonlResult?: CommitFileResult | "unavailable";
  testCasesMdResult?: CommitFileResult | "unavailable";
  includeReadFileAtCommit?: boolean;
} = {}): AssuranceProvenanceRuntime & {
  readFileAtCommit?(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
} {
  const {
    changedFiles = [TEST_FILE],
    diffFiles = [],
    baseTestResults = { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
    headTestResults = { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
    eventsJsonlResult,
    testCasesMdResult,
    includeReadFileAtCommit = true,
  } = options;

  // Default scenario freeze: events.jsonl with matching hash, test-cases.md with matching content.
  const defaultEventsJsonlResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
    content: makeEventsJsonl(TEST_CASES_HASH),
  };
  const defaultTestCasesMdResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: TEST_CASES_CONTENT,
  };

  const resolvedEventsResult = eventsJsonlResult === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake events.jsonl unavailable" }
    : (eventsJsonlResult ?? defaultEventsJsonlResult);

  const resolvedTestCasesMdResult = testCasesMdResult === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md unavailable" }
    : (testCasesMdResult ?? defaultTestCasesMdResult);

  const runtime: AssuranceProvenanceRuntime & {
    readFileAtCommit?(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
  } = {
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
      // Default: base OID returns baseTestResults
      return baseTestResults;
    },
  };

  if (includeReadFileAtCommit) {
    // TC-022, TC-023, TC-024, etc. require readFileAtCommit.
    // The new implementation (T-04) will check this method in P3 and call it for scenario freeze.
    // Tests that omit this will fail at P3 check (both dimensions absent).
    runtime.readFileAtCommit = async (
      _oid: string,
      pathSuffix: string,
      _cwd: string,
    ): Promise<CommitFileResult> => {
      if (pathSuffix.endsWith("events.jsonl")) {
        return resolvedEventsResult;
      }
      if (pathSuffix.endsWith("test-cases.md")) {
        return resolvedTestCasesMdResult;
      }
      return { kind: "unavailable", reason: `fake readFileAtCommit: unknown suffix ${pathSuffix}` };
    };
  }

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
// TC-003: lineage frozen hash null → testDerivation + biteEvidence absent
//
// DESTRUCTIVE INVARIANT: if scenario hash check is removed, the current impl would
// set testDerivation="frozen" even when frozen hash is null. TC-003 catches this.
// ---------------------------------------------------------------------------

describe("TC-003: lineage frozen hash null → testDerivation + biteEvidence absent", () => {
  it(
    "TC-003: frozen hash null in lineage → testDerivation and biteEvidence absent (fail-closed)",
    async () => {
      // GIVEN: events.jsonl lineage has test-case-gen record with test-cases.md hash = null
      const runtime = makeFakeRuntime({
        eventsJsonlResult: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(null), // frozen hash is null
        },
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN: deriveAchievedAssurance with both dimensions constrained
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both testDerivation and biteEvidence must be absent (fail-closed)
      // DESTRUCTIVE INVARIANT: removing scenario hash check would leave testDerivation="frozen"
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: test-cases.md hash mismatch → testDerivation + biteEvidence absent
//
// DESTRUCTIVE INVARIANT: removing hash comparison would cause testDerivation="frozen"
// even when test-cases.md has been modified after test-case-gen.
// ---------------------------------------------------------------------------

describe("TC-004: test-cases.md hash mismatch → testDerivation + biteEvidence absent", () => {
  it(
    "TC-004: frozen hash non-null but test-cases.md content hash does not match → both absent",
    async () => {
      // GIVEN: lineage has frozen hash WRONG_HASH, but actual test-cases.md content hashes differently
      const runtime = makeFakeRuntime({
        eventsJsonlResult: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(WRONG_HASH), // frozen hash != actual content hash
        },
        testCasesMdResult: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT, // hash = TEST_CASES_HASH ≠ WRONG_HASH
        },
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN: deriveAchievedAssurance
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime: runtime as unknown as AssuranceProvenanceRuntime,
      });

      // THEN: both absent (hash mismatch = scenario tampered)
      // DESTRUCTIVE INVARIANT: without hash comparison, mismatch would yield testDerivation="frozen"
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
    "TC-007: latest spec-review run verdict=approved → achieved.specReview=required",
    async () => {
      // GIVEN: latest spec-review run has verdict="approved"
      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved" }],
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

      // THEN: specReview must be "required"
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
// TC-022: events.jsonl readFileAtCommit unavailable → testDerivation + biteEvidence absent
// ---------------------------------------------------------------------------

describe("TC-022: events.jsonl unavailable → testDerivation + biteEvidence absent", () => {
  it(
    "TC-022: readFileAtCommit(finalHeadOid, slug/events.jsonl) unavailable → both dimensions absent",
    async () => {
      // GIVEN: readFileAtCommit for events.jsonl returns unavailable
      const runtime = makeFakeRuntime({
        eventsJsonlResult: "unavailable",
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

      // THEN: both absent (events.jsonl is required for scenario freeze)
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
// TC-024: test-cases.md readFileAtCommit unavailable → testDerivation + biteEvidence absent
// ---------------------------------------------------------------------------

describe("TC-024: test-cases.md readFileAtCommit unavailable → testDerivation + biteEvidence absent", () => {
  it(
    "TC-024: events.jsonl found (frozen hash present) but test-cases.md unavailable → both absent",
    async () => {
      // GIVEN: events.jsonl returns valid lineage with non-null frozen hash,
      // but reading test-cases.md returns unavailable
      const runtime = makeFakeRuntime({
        eventsJsonlResult: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(TEST_CASES_HASH), // frozen hash non-null and correct
        },
        testCasesMdResult: "unavailable",
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

      // THEN: both absent (cannot verify hash without test-cases.md content)
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
