/**
 * Materialized test file selection tests for EB↔HEAD diff.
 *
 * Covers:
 *   TC-012: non-test file in EB↔HEAD diff is filtered out by selectMaterializedTestFiles
 *   TC-013: test file in EB↔HEAD diff is selected as materialized (expected behavior — no blob freeze)
 *
 * absorb-test-materialize: blob freeze check (diffPathsBetweenCommits) is removed.
 * testDerivation depends solely on scenario binding (test-cases.md content match).
 * The implementer writing test files after EB base is EXPECTED, not tamper.
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
 * Create a minimal forward-type job state with test-case-gen + implementer.
 * (absorb-test-materialize: test-materialize step abolished)
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
 *  - changedFiles: files returned by listChangedFilesBetweenCommits(baseOid, headOid)
 *    (these are files changed between EB base and HEAD — the implementer's work)
 *  - testFile: which file to return red at baseOid and green at finalHeadOid
 *
 * absorb-test-materialize: diffPathsBetweenCommits and listCommitChangedFiles removed.
 * selectMaterializedTestFiles filters changedFiles to test-only paths.
 */
function makeFakeRuntime(options: {
  changedFiles: string[];
  testFile: string;
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
}): AssuranceProvenanceRuntime {
  const {
    changedFiles,
    testFile,
    baseTestResults = { kind: "ran", results: [{ file: testFile, passed: false }] },
    headTestResults = { kind: "ran", results: [{ file: testFile, passed: true }] },
  } = options;

  const runtime: AssuranceProvenanceRuntime = {
    async listChangedFilesBetweenCommits(
      _baseOid: string,
      _headOid: string,
      _cwd: string,
    ): Promise<ChangedFilesResult> {
      return { kind: "success", files: changedFiles };
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
// TC-012: selectMaterializedTestFiles filters non-test files from EB↔HEAD diff
// ---------------------------------------------------------------------------

describe("TC-012: non-test file in EB↔HEAD diff is filtered out by selectMaterializedTestFiles", () => {
  it(
    "TC-012: test file + non-test file in EB↔HEAD diff → only test file selected → biteEvidence achieved",
    async () => {
      // GIVEN: EB↔HEAD diff contains both a test file and a non-test file
      // (implementer wrote tests and implementation code)
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE, NON_TEST_FILE],
        testFile: TEST_FILE,
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN floor derivation runs with biteEvidence constrained
      const { achieved, diagnostics } = await deriveAchievedAssurance({
        state: makeJobState("bug-fix") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime,
      });

      // THEN non-test file is filtered out by selectMaterializedTestFiles;
      // test file is selected; base:red + HEAD:green → biteEvidence achieved
      const noTestFileDiag = diagnostics.find((d) => d.includes("0 test files"));
      expect(noTestFileDiag).toBeUndefined(); // at least one test file found
      expect(achieved.biteEvidence).toBe("required");
    },
  );

  it(
    "TC-012: test file + non-test file in EB↔HEAD diff → testDerivation also achieved (scenario binding)",
    async () => {
      // GIVEN same scenario: implementer wrote both tests and implementation
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE, NON_TEST_FILE],
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

      // THEN testDerivation=frozen (scenario binding holds), biteEvidence=required
      expect(achieved.testDerivation).toBe("frozen");
      expect(achieved.biteEvidence).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-013: test file in EB↔HEAD diff is expected (no blob freeze in new design)
// ---------------------------------------------------------------------------

describe("TC-013: test file written by implementer is selected as materialized (no tamper concept)", () => {
  it(
    "TC-013: test file in EB↔HEAD diff → materialized test file → biteEvidence achieved (absorb-test-materialize: no blob freeze)",
    async () => {
      // GIVEN: only a test file in EB↔HEAD diff (implementer wrote the test)
      // blob freeze check is REMOVED in absorb-test-materialize
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE],
        testFile: TEST_FILE,
        baseTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: TEST_FILE, passed: true }] },
      });

      // WHEN floor derivation runs with biteEvidence constrained
      const { achieved, diagnostics } = await deriveAchievedAssurance({
        state: makeJobState("bug-fix") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BITE_EVIDENCE_REQUIRED,
        runtime,
      });

      // THEN test file is materialized (implementer wrote it); no "tamper" concept exists
      // base:red + HEAD:green → biteEvidence achieved
      const noTestFileDiag = diagnostics.find((d) => d.includes("0 test files"));
      expect(noTestFileDiag).toBeUndefined();
      expect(achieved.biteEvidence).toBe("required");
    },
  );

  it(
    "TC-013: test file in EB↔HEAD diff + scenario binding holds → testDerivation=frozen, biteEvidence=required",
    async () => {
      // GIVEN same scenario: implementer wrote tests (they appear in EB↔HEAD diff)
      const runtime = makeFakeRuntime({
        changedFiles: [TEST_FILE],
        testFile: TEST_FILE,
      });

      // WHEN floor derivation with both dimensions constrained
      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState("new-feature") as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        config: { version: 1 as const, agents: {} },
        floor: FLOOR_BOTH_REQUIRED,
        runtime,
      });

      // THEN both dimensions achieved (blob freeze removed, scenario binding is sole criterion for testDerivation)
      expect(achieved.testDerivation).toBe("frozen");
      expect(achieved.biteEvidence).toBe("required");
    },
  );
});
