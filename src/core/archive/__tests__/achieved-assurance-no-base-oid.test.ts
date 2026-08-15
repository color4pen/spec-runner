/**
 * TC-008: archive floor は baseOid 無しで判定に到達する
 * TC-015: scenario 凍結が intact なら testDerivation は frozen
 * TC-015a: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）
 * TC-016: scenario がすり替えられたら testDerivation は absent
 *
 * Source: spec.md > Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う
 *         > Scenario: archive floor は baseOid 無しで判定に到達する
 *         spec.md > Requirement: testDerivation は scenario 凍結として判定される
 *         > Scenario: scenario 凍結が intact なら testDerivation は frozen
 *         > Scenario: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）
 *         > Scenario: scenario がすり替えられたら testDerivation は absent
 *
 * After absorb-test-materialize:
 * - baseOid (test-materialize commitOid) is no longer required for testDerivation or biteEvidence.
 * - File-set is identified via listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid).
 * - testDerivation = "frozen" based solely on scenario binding (test-cases.md hash intact).
 * - Blob freeze (diffPathsBetweenCommits) is removed from testDerivation judgment.
 */
import { describe, it, expect } from "vitest";
import { deriveAchievedAssurance } from "../achieved-assurance.js";
import type { JobState, StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRunAt(startedAt: string, commitOid: string | undefined, attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt,
    endedAt: startedAt,
    ...(commitOid !== undefined ? { commitOid } : {}),
  } as StepRun;
}

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "assurance-no-base-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "archive",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as JobState;
}

const TC_CONTENT_INTACT = "# Test Cases\n\n## TC-001: sample\nFixed content.\n";
const TC_CONTENT_CHANGED = "# Test Cases\n\n## TC-001: sample\nTAMPERED content!\n";

const TCG_OID = "tcg-oid-no-base-001";
const FINAL_HEAD_OID = "final-head-oid-no-base-001";
const TEST_FILE = "src/__tests__/feature.test.ts";

/**
 * Build a runtime fake with the NEW API:
 * - listChangedFilesBetweenCommits(baseOid, headOid, cwd) instead of listCommitChangedFiles
 * - No diffPathsBetweenCommits (removed for testDerivation)
 * - readFileAtCommit for scenario binding
 * - runTestsOnSynthesizedTree / runTestsAtCommit for biteEvidence
 */
function makeFakeRuntime(options: {
  changedFiles: string[];
  tcContentAtAnchor: string;
  tcContentAtHead: string;
  baseTestResult?: { kind: "ran"; results: { file: string; passed: boolean }[] };
  headTestResult?: { kind: "ran"; results: { file: string; passed: boolean }[] };
}) {
  return {
    // New method: replaces listCommitChangedFiles + diffPathsBetweenCommits for file-set
    listChangedFilesBetweenCommits: async (
      _baseOid: string,
      _headOid: string,
      _cwd: string,
    ): Promise<{ kind: "success"; files: string[] } | { kind: "unavailable"; reason: string }> => {
      return { kind: "success", files: options.changedFiles };
    },
    // readFileAtCommit: used for scenario binding (test-cases.md hash comparison)
    readFileAtCommit: async (
      oid: string,
      _path: string,
      _cwd: string,
    ): Promise<{ kind: "found"; path: string; content: string } | { kind: "unavailable"; reason: string }> => {
      if (oid === TCG_OID) {
        return { kind: "found", path: "example/test-cases.md", content: options.tcContentAtAnchor };
      }
      if (oid === FINAL_HEAD_OID) {
        return { kind: "found", path: "example/test-cases.md", content: options.tcContentAtHead };
      }
      return { kind: "unavailable", reason: `unexpected oid: ${oid}` };
    },
    // biteEvidence: base-red check
    runTestsOnSynthesizedTree: async (
      _baseRev: string,
      _overlayFiles: string[],
      _overlayFromOid: string,
      _cwd: string,
      _config: unknown,
    ) => {
      return options.baseTestResult ?? { kind: "unavailable" as const, reason: "not configured" };
    },
    // biteEvidence: HEAD-green check
    runTestsAtCommit: async (
      _oid: string,
      _testFiles: string[],
      _cwd: string,
      _config: unknown,
    ) => {
      return options.headTestResult ?? { kind: "unavailable" as const, reason: "not configured" };
    },
  };
}

// ---------------------------------------------------------------------------
// TC-008: archive floor は baseOid 無しで判定に到達する
// ---------------------------------------------------------------------------

describe("TC-008: archive floor without test-materialize run reaches judgment", () => {
  it("TC-008: forward-type job with NO test-materialize run and intact scenario achieves biteEvidence + testDerivation", async () => {
    // State: bug-fix, NO test-materialize run, synthesizedCommits present,
    // test-case-gen run with commitOid (for scenario binding).
    // Currently FAILS because: P2 (resolveBaseCandidateOids → baseOid null → early return).
    // After refactoring: reaches judgment via EB diff + scenario binding.
    const state = makeState({
      synthesizedCommits: ["bootstrap-sha-008"],
      steps: {
        // No test-materialize run
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        "implementer": [makeRunAt("2026-01-01T00:02:00.000Z", "impl-sha-008")],
      },
    });

    const runtime = makeFakeRuntime({
      changedFiles: [TEST_FILE],
      tcContentAtAnchor: TC_CONTENT_INTACT,
      tcContentAtHead: TC_CONTENT_INTACT, // same → scenario intact
      baseTestResult: {
        kind: "ran",
        results: [{ file: TEST_FILE, passed: false }], // base: RED on EB
      },
      headTestResult: {
        kind: "ran",
        results: [{ file: TEST_FILE, passed: true }], // HEAD: GREEN
      },
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      config: {} as never,
      floor: { biteEvidence: "required", testDerivation: "frozen" } as never,
      runtime: runtime as never,
    });

    // After refactoring: both dimensions should be achieved
    expect(output.achieved.biteEvidence).toBe("required");
    expect(output.achieved.testDerivation).toBe("frozen");
    // No baseOid-related early-return diagnostic
    expect(
      output.diagnostics.every((d) => !d.includes("baseOid is null")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-015: scenario 凍結が intact なら testDerivation は frozen
// ---------------------------------------------------------------------------

describe("TC-015: scenario intact → testDerivation frozen (no test-materialize run)", () => {
  it("TC-015: testDerivation=frozen when test-cases.md content matches at anchor and HEAD", async () => {
    // Currently FAILS because: P2 (baseOid null → early return → testDerivation absent)
    // After refactoring: testDerivation depends only on scenario binding.
    const state = makeState({
      synthesizedCommits: ["bootstrap-sha-015"],
      steps: {
        // No test-materialize run
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    const runtime = makeFakeRuntime({
      changedFiles: [TEST_FILE],
      tcContentAtAnchor: TC_CONTENT_INTACT,
      tcContentAtHead: TC_CONTENT_INTACT, // same → scenario intact
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      config: {} as never,
      floor: { testDerivation: "frozen" } as never, // only testDerivation constrained
      runtime: runtime as never,
    });

    // testDerivation should be "frozen" based on scenario binding alone
    expect(output.achieved.testDerivation).toBe("frozen");
    // baseOid-related diagnostic must NOT appear
    expect(
      output.diagnostics.every((d) => !d.includes("baseOid")),
    ).toBe(true);
  });

  it("TC-015: baseOid absence does NOT block testDerivation judgment after refactoring", async () => {
    // Regression guard: testDerivation must not be gated on test-materialize commitOid.
    const state = makeState({
      synthesizedCommits: ["bootstrap-sha-015b"],
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        // Explicitly no test-materialize
      },
    });

    const runtime = makeFakeRuntime({
      changedFiles: [TEST_FILE],
      tcContentAtAnchor: TC_CONTENT_INTACT,
      tcContentAtHead: TC_CONTENT_INTACT,
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      config: {} as never,
      floor: { testDerivation: "frozen" } as never,
      runtime: runtime as never,
    });

    expect(output.achieved.testDerivation).toBe("frozen");
  });
});

// ---------------------------------------------------------------------------
// TC-015a: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）
// ---------------------------------------------------------------------------

describe("TC-015a: testDerivation frozen even when materializedTestFiles is empty (D4 independence)", () => {
  it("TC-015a: testDerivation=frozen when EB↔HEAD diff returns no test files", async () => {
    // After refactoring: testDerivation depends only on scenario binding, NOT on materializedTestFiles.
    // Currently FAILS because: P2 (baseOid null → early return)
    // OR because materializedTestFiles = [] causes early return for both dimensions.
    const state = makeState({
      synthesizedCommits: ["bootstrap-sha-015a"],
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        // No test-materialize
      },
    });

    const runtime = makeFakeRuntime({
      changedFiles: [], // No test files in EB↔HEAD diff → materializedTestFiles = []
      tcContentAtAnchor: TC_CONTENT_INTACT,
      tcContentAtHead: TC_CONTENT_INTACT, // scenario intact
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      config: {} as never,
      floor: { testDerivation: "frozen" } as never,
      runtime: runtime as never,
    });

    // testDerivation must be "frozen" even though materializedTestFiles is empty
    // (testDerivation independence from materializedTestFiles — D4)
    expect(output.achieved.testDerivation).toBe("frozen");
  });
});

// ---------------------------------------------------------------------------
// TC-016: scenario がすり替えられたら testDerivation は absent
// ---------------------------------------------------------------------------

describe("TC-016: scenario tampered → testDerivation absent (fail-closed)", () => {
  it("TC-016: testDerivation=absent when test-cases.md content differs at anchor and HEAD", async () => {
    // State with no test-materialize run and scenario mismatch.
    // After refactoring: scenario mismatch → testDerivation absent (fail-closed).
    // Currently: may return absent for wrong reason (baseOid null), but behavior is same.
    const state = makeState({
      synthesizedCommits: ["bootstrap-sha-016"],
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        // No test-materialize
      },
    });

    const runtime = makeFakeRuntime({
      changedFiles: [TEST_FILE],
      tcContentAtAnchor: TC_CONTENT_INTACT,
      tcContentAtHead: TC_CONTENT_CHANGED, // MISMATCH: scenario was tampered
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      config: {} as never,
      floor: { testDerivation: "frozen" } as never,
      runtime: runtime as never,
    });

    // testDerivation must be absent (fail-closed) when scenario is tampered
    expect(output.achieved.testDerivation).toBeUndefined();
  });

  it("TC-016: testDerivation absent even when blob freeze would have been intact", async () => {
    // Regression guard: scenario mismatch takes precedence over any blob state.
    // testDerivation must be absent purely due to scenario mismatch.
    const state = makeState({
      synthesizedCommits: ["bootstrap-sha-016b"],
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    const runtime = makeFakeRuntime({
      changedFiles: [TEST_FILE],
      tcContentAtAnchor: TC_CONTENT_INTACT,
      tcContentAtHead: "Completely different content that was tampered after test-case-gen",
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      config: {} as never,
      floor: { testDerivation: "frozen" } as never,
      runtime: runtime as never,
    });

    expect(output.achieved.testDerivation).toBeUndefined();
  });
});
