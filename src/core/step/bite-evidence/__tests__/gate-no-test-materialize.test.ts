/**
 * TC-007: gate は test-materialize run 無しで red→green 判定に到達する
 *
 * Source: spec.md > Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う
 *         > Scenario: gate は test-materialize run 無しで red→green 判定に到達する
 *
 * After absorb-test-materialize, the gate must identify materialized test files
 * from Evidence Base (EB) ↔ candidate diff (listChangedFilesBetweenCommits) instead of
 * from the test-materialize commit's changed files (listCommitChangedFiles(baseOid)).
 * A state with NO test-materialize run must reach red→green judgment without strategy-deferred.
 */
import { describe, it, expect } from "vitest";
import { runBiteEvidenceGate } from "../gate.js";
import type { JobState, StepRun } from "../../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(requestType: string, overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "gate-no-mat-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: requestType,
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "bite-evidence",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as unknown as JobState;
}

function makeStepRunWithOid(commitOid: string): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    commitOid,
  } as StepRun & { commitOid: string };
}

/**
 * Build a runtime fake that has the NEW listChangedFilesBetweenCommits API
 * (not listCommitChangedFiles). After absorb-test-materialize, the gate should
 * use listChangedFilesBetweenCommits(evidenceBaseRev, headOid) for file-set identification.
 */
function makeFakeRuntimeWithNewApi(options: {
  headOid: string;
  changedFiles: string[];
  synthesizedTreeResult: { kind: "ran"; results: { file: string; passed: boolean }[] };
  testResultsByOid: Record<string, { file: string; passed: boolean }[]>;
}) {
  return {
    captureHeadSha: async (_cwd: string): Promise<string | null> => options.headOid,
    // New method: listChangedFilesBetweenCommits(baseOid, headOid, cwd)
    // Used by the new gate to identify test files from EB↔candidate diff
    listChangedFilesBetweenCommits: async (
      _baseOid: string,
      _headOid: string,
      _cwd: string,
    ): Promise<{ kind: "success"; files: string[] } | { kind: "unavailable"; reason: string }> => {
      return { kind: "success", files: options.changedFiles };
    },
    runTestsOnSynthesizedTree: async (
      _baseRev: string,
      _overlayFiles: string[],
      _overlayFromOid: string,
      _cwd: string,
      _config: unknown,
    ) => options.synthesizedTreeResult,
    runTestsAtCommit: async (
      oid: string,
      _testFiles: string[],
      _cwd: string,
      _config: unknown,
    ) => {
      const results = options.testResultsByOid[oid];
      if (!results) return { kind: "unavailable" as const, reason: `no results for ${oid}` };
      return { kind: "ran" as const, results };
    },
  };
}

// ---------------------------------------------------------------------------
// TC-007: gate は test-materialize run 無しで red→green 判定に到達する
// ---------------------------------------------------------------------------

describe("TC-007: gate without test-materialize run reaches red→green judgment", () => {
  const headOid = "head-sha-no-mat-007";
  const testFile = "src/__tests__/feature-no-mat.test.ts";

  it("TC-007: forward-type job with NO test-materialize run reaches passed verdict via EB diff", async () => {
    // State: bug-fix (forward type), NO test-materialize run, synthesizedCommits present.
    // After refactoring: gate uses listChangedFilesBetweenCommits(evidenceBaseRev, headOid)
    // instead of listCommitChangedFiles(baseOid).
    // Currently FAILS because: gate checks resolveBaseCandidateOids → baseOid null → strategy-deferred.
    const state = makeState("bug-fix", {
      synthesizedCommits: ["bootstrap-sha-007"],
      steps: {
        // No test-materialize run at all
        implementer: [makeStepRunWithOid("impl-sha-007")],
      },
    });

    const runtime = makeFakeRuntimeWithNewApi({
      headOid,
      changedFiles: [testFile],
      synthesizedTreeResult: {
        kind: "ran",
        results: [{ file: testFile, passed: false }], // base: RED on Evidence Base
      },
      testResultsByOid: {
        [headOid]: [{ file: testFile, passed: true }], // candidate: GREEN at HEAD
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/gate-no-mat-test",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    // After refactoring: should reach red→green judgment and return "passed"
    // Currently: returns "strategy-deferred" because baseOid is null (no test-materialize run)
    expect(result.verdict).toBe("passed");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.baseResult).toBe("red");
    expect(result.records[0]!.candidateResult).toBe("green");
    expect(result.records[0]!.verified).toBe(true);
  });

  it("TC-007: strategy-deferred is NOT returned when test-materialize run is absent", async () => {
    // The absence of a test-materialize run must not trigger strategy-deferred.
    // After refactoring, strategy-deferred is only returned for:
    //   - Non-forward type
    //   - Tamper mismatch → failed
    //   - EB ref absent (synthesizedCommits empty)
    //   - Runtime capability missing
    //   - No test files found
    //   - HEAD OID unavailable
    const state = makeState("new-feature", {
      synthesizedCommits: ["bootstrap-sha-007b"],
      steps: {}, // No test-materialize AND no implementer
    });

    const runtime = makeFakeRuntimeWithNewApi({
      headOid,
      changedFiles: [testFile],
      synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] },
      testResultsByOid: { [headOid]: [{ file: testFile, passed: true }] },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/gate-no-mat-test",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    // Must NOT be strategy-deferred due to absent test-materialize run
    expect(result.verdict).not.toBe("strategy-deferred");
    // Should be "passed" (EB-red + HEAD-green)
    expect(result.verdict).toBe("passed");
  });
});
