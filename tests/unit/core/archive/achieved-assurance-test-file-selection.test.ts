/**
 * Floor tamper check tests for the test-file selection change.
 *
 * Covers:
 *   TC-012: implementation edit of a non-test file is not tamper
 *   TC-013: edit of a materialized test file is still tamper
 *
 * TC-012 is intentionally red until `selectMaterializedTestFiles` is wired into
 * `achieved-assurance.ts` (requirement 4). The fake `diffPathsBetweenCommits`
 * honors its `paths` argument (returns only the intersection of edited files
 * with the `paths` arg), so narrowing `materializedTestFiles` to test-only files
 * removes the non-test file from the tamper surface.
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

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/test-repo";
const SLUG = "my-slug";
const BASE_OID = "base-commit-sha-selection-001";
const FINAL_HEAD_OID = "archive-head-sha-selection-001";

const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-selection-001";

const TEST_FILE = "src/feature.test.ts";
const NON_TEST_FILE = "src/feature/index.ts";

const TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: sample\n";

const FLOOR_BITE_EVIDENCE_REQUIRED = { biteEvidence: "required" as const };
const FLOOR_BOTH_REQUIRED = { testDerivation: "frozen" as const, biteEvidence: "required" as const };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal forward-type job state with test-materialize + test-case-gen.
 */
function makeJobState(type = "bug-fix") {
  return {
    version: 2,
    jobId: "floor-selection-test-job",
    status: "awaiting-archive",
    worktreePath: null,
    branch: `change/${SLUG}-abc12345`,
    noWorktree: false,
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type,
      slug: SLUG,
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    synthesizedCommits: ["bootstrap-commit-sha-selection-001"],
    steps: {
      "test-case-gen": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "success", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:30.000Z",
          commitOid: TEST_CASE_GEN_OID,
        },
      ],
      "test-materialize": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "success", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:00:30.000Z",
          endedAt: "2026-01-01T00:01:00.000Z",
          commitOid: BASE_OID,
        },
      ],
      "implementer": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "success", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:02:00.000Z",
          commitOid: "candidate-sha-selection-001",
        },
      ],
    },
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
 * Build a fake runtime where:
 *  - changedFiles: files returned by listCommitChangedFiles for baseOid
 *  - editedFiles: the files actually edited between base and finalHead
 *    (diffPathsBetweenCommits returns the intersection of editedFiles and the paths arg)
 *  - baseTestFile: which file to return red at baseOid (the test file)
 *  - testCasesContent: content of test-cases.md (same at anchor and head → scenario intact)
 *
 * The CRITICAL invariant: diffPathsBetweenCommits honors its `paths` argument by
 * returning only intersection(editedFiles, paths). This ensures that narrowing
 * materializedTestFiles to test-only files removes non-test files from the tamper surface.
 */
function makeFakeRuntime(options: {
  changedFiles: string[];
  editedFiles: string[];
  testFile: string;
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
}): AssuranceProvenanceRuntime {
  const {
    changedFiles,
    editedFiles,
    testFile,
    baseTestResults = { kind: "ran", results: [{ file: testFile, passed: false }] },
    headTestResults = { kind: "ran", results: [{ file: testFile, passed: true }] },
  } = options;

  const runtime: AssuranceProvenanceRuntime = {
    async listCommitChangedFiles(
      _oid: string,
      _cwd: string,
    ): Promise<ChangedFilesResult> {
      return { kind: "success", files: changedFiles };
    },

    /**
     * diffPathsBetweenCommits honors its `paths` argument:
     * Returns only the intersection of editedFiles with the requested paths.
     *
     * This models the real git behavior where the diff is constrained to the
     * requested paths — narrowing materializedTestFiles removes non-test files
     * from the tamper surface.
     */
    async diffPathsBetweenCommits(
      _baseOid: string,
      _headOid: string,
      paths: string[],
      _cwd: string,
    ): Promise<ChangedFilesResult> {
      // Return only edited files that are also in the requested paths
      const intersection = editedFiles.filter((f) => paths.includes(f));
      return { kind: "success", files: intersection };
    },

    // Evidence Base base-red check (replaces runTestsAtCommit(baseOid)).
    async runTestsOnSynthesizedTree(
      _baseRev: string,
      _overlayFiles: string[],
      _overlayFromOid: string,
      _cwd: string,
      _config: unknown,
    ): Promise<IsolatedTestResult> {
      return baseTestResults;
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
      return { kind: "unavailable", reason: `fake: no results for oid ${oid} (not FINAL_HEAD_OID)` };
    },

    async readFileAtCommit(
      oid: string,
      pathSuffix: string,
      _cwd: string,
    ): Promise<CommitFileResult> {
      if (pathSuffix.endsWith("test-cases.md")) {
        // Scenario intact: same content at anchor and HEAD
        return {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT,
        };
      }
      return {
        kind: "unavailable",
        reason: `fake readFileAtCommit: unknown suffix ${pathSuffix} at oid ${oid}`,
      };
    },
  };

  return runtime;
}

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
// TC-012: implementation edit of a non-test file is not tamper
// ---------------------------------------------------------------------------

describe("TC-012: implementation edit of a non-test file is not tamper", () => {
  it(
    "TC-012: non-test file edited between base and HEAD — biteEvidence achieved (no tamper)",
    async () => {
      // GIVEN a base commit containing src/feature.test.ts and src/feature/index.ts
      // AND src/feature/index.ts is edited between the base commit and the final HEAD
      // WHILE src/feature.test.ts is byte-identical, base-red, and HEAD-green
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE, NON_TEST_FILE],
        // Only the non-test file was edited:
        editedFiles: [NON_TEST_FILE],
        testFile: TEST_FILE,
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN the floor derivation runs with biteEvidence constrained
      const { achieved, diagnostics } = await deriveAchievedAssurance({
        state: makeJobState("bug-fix") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime,
      });

      // THEN no tamper is reported and biteEvidence is achieved
      // (Intentionally RED before implementation: current code includes NON_TEST_FILE
      //  in materializedTestFiles, so diffPathsBetweenCommits detects it as tamper.)
      const tamperDiag = diagnostics.find((d) => d.includes("tamper"));
      expect(tamperDiag).toBeUndefined();
      expect(achieved.biteEvidence).toBe("required");
    },
  );

  it(
    "TC-012: test file unchanged + non-test file edited → testDerivation also achieved",
    async () => {
      // GIVEN same scenario: non-test file edited, test file unchanged
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE, NON_TEST_FILE],
        editedFiles: [NON_TEST_FILE],
        testFile: TEST_FILE,
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN floor derivation with both dimensions constrained
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState("bug-fix") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN testDerivation is also achieved (blob freeze intact for test file)
      // (Also RED before implementation for the same tamper false-positive reason.)
      expect(achieved.testDerivation).toBe("frozen");
      expect(achieved.biteEvidence).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-013: edit of a materialized test file is still tamper
// ---------------------------------------------------------------------------

describe("TC-013: edit of a materialized test file is still tamper", () => {
  it(
    "TC-013: test file edited between base and HEAD → tamper reported, biteEvidence absent",
    async () => {
      // GIVEN a base commit containing src/feature.test.ts
      // AND src/feature.test.ts differs between the base commit and the final HEAD
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE],
        // The test file itself was edited:
        editedFiles: [TEST_FILE],
        testFile: TEST_FILE,
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN the floor derivation runs with biteEvidence constrained
      const { achieved, diagnostics } = await deriveAchievedAssurance({
        state: makeJobState("bug-fix") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime,
      });

      // THEN tamper is reported and biteEvidence is absent
      const tamperDiag = diagnostics.find((d) => d.includes("tamper"));
      expect(tamperDiag).toBeDefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );

  it(
    "TC-013: test file edited → testDerivation also absent",
    async () => {
      // GIVEN same scenario: test file edited between base and HEAD
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE],
        editedFiles: [TEST_FILE],
        testFile: TEST_FILE,
      });

      // WHEN floor derivation with both dimensions constrained
      const { achieved, diagnostics } = await deriveAchievedAssurance({
        state: makeJobState("new-feature") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN both dimensions are absent (freeze broken)
      const tamperDiag = diagnostics.find((d) => d.includes("tamper"));
      expect(tamperDiag).toBeDefined();
      expect(achieved.testDerivation).toBeUndefined();
      expect(achieved.biteEvidence).toBeUndefined();
    },
  );
});
