/**
 * Evidence Base gate tests.
 *
 * Verifies the new gate behavior after the Evidence Base refactoring:
 *   TC-003: Adopted operator commit is included in the candidate (HEAD OID used).
 *   TC-006: Non-forward type still defers (preserved invariant).
 *   TC-007: Tamper mismatch still fails (preserved invariant).
 *   TC-008: Unavailable runtime still defers (runTestsOnSynthesizedTree → unavailable).
 *   TC-009: Absent Evidence Base reference defers (empty synthesizedCommits).
 *   TC-010: Absent HEAD OID defers (captureHeadSha returns null).
 *
 * Source (all): spec.md > Requirement: The gate SHALL preserve its deferral, tamper,
 *   type, and never-throw contracts + related scenarios.
 * TC-003 source: spec.md > Requirement: The green candidate SHALL be the effective
 *   branch state reaching adopted operator commits > Scenario: Adopted operator commit
 *   is included in the candidate.
 *
 * Tests that pin NEW behavior (TC-003, TC-008, TC-009, TC-010) will be RED until
 * the gate is rewritten by the implementer (T-03). TC-006 and TC-007 test preserved
 * short-circuit behavior and are GREEN now and after the refactoring.
 */

import { describe, it, expect } from "vitest";
import { runBiteEvidenceGate } from "../gate.js";
import type { JobState, StepRun } from "../../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  requestType: string,
  overrides: Partial<JobState> = {},
): JobState {
  return {
    version: 2,
    jobId: "eb-gate-test-job",
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
  };
}

function makeStepRun(commitOid: string, startedAt = "2026-01-01T00:01:00.000Z"): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt,
    endedAt: startedAt,
    commitOid,
  } as StepRun & { commitOid: string };
}

type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

/**
 * Build a fake runtime that supports the Evidence Base gate interface:
 *   - captureHeadSha: returns a HEAD OID or null
 *   - listChangedFilesBetweenCommits: returns configured files
 *   - runTestsOnSynthesizedTree: per-call results for the new red-side method
 *   - runTestsAtCommit: per-oid results (for candidate/HEAD green check)
 */
function makeFakeRuntime(options: {
  headOid?: string | null;
  changedFiles?: string[];
  synthesizedTreeResult?: IsolatedTestResult;
  testResultsByOid?: Record<string, { file: string; passed: boolean }[]>;
  synthesizedTreeCalls?: { baseRev: string; overlayFiles: string[]; overlayFromOid: string }[];
}) {
  const synthesizedTreeCalls: { baseRev: string; overlayFiles: string[]; overlayFromOid: string }[] =
    options.synthesizedTreeCalls ?? [];

  return {
    captureHeadSha: async (_cwd: string): Promise<string | null> => {
      return options.headOid ?? null;
    },
    listChangedFilesBetweenCommits: async (
      _baseOid: string,
      _headOid: string,
      _cwd: string,
    ): Promise<{ kind: "success"; files: string[] } | { kind: "unavailable"; reason: string }> => {
      const files = options.changedFiles ?? ["src/__tests__/feature.test.ts"];
      return { kind: "success", files };
    },
    runTestsOnSynthesizedTree: async (
      baseRev: string,
      overlayFiles: string[],
      overlayFromOid: string,
      _cwd: string,
      _config: unknown,
    ): Promise<IsolatedTestResult> => {
      synthesizedTreeCalls.push({ baseRev, overlayFiles, overlayFromOid });
      return options.synthesizedTreeResult ?? { kind: "unavailable", reason: "not configured" };
    },
    runTestsAtCommit: async (
      oid: string,
      _testFiles: string[],
      _cwd: string,
      _config: unknown,
    ): Promise<IsolatedTestResult> => {
      const results = options.testResultsByOid?.[oid];
      if (results === undefined) {
        return { kind: "unavailable", reason: `no results configured for oid ${oid}` };
      }
      return { kind: "ran", results };
    },
    _synthesizedTreeCalls: synthesizedTreeCalls,
  };
}

// ---------------------------------------------------------------------------
// TC-006: Non-forward type still defers (preserved invariant)
// ---------------------------------------------------------------------------

describe("TC-006: Non-forward type still defers", () => {
  it("TC-006: refactoring job defers without generating records (short-circuits before EB resolution)", async () => {
    const state = makeState("refactoring", {
      synthesizedCommits: ["bootstrap-sha"],
      steps: {
        "test-materialize": [makeStepRun("base-sha")],
        "implementer": [makeStepRun("candidate-sha")],
      },
    });

    const fake = makeFakeRuntime({ headOid: "head-sha" });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "inconclusive",
    });

    expect(result.verdict).toBe("strategy-deferred");
    expect(result.records).toHaveLength(0);
    // Short-circuit before any synthesized-tree calls
    expect(fake._synthesizedTreeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-007: Tamper mismatch still fails (preserved invariant)
// ---------------------------------------------------------------------------

describe("TC-007: Tamper mismatch still fails", () => {
  it("TC-007: tamperStatus=mismatch yields failed with tamper reason regardless of EB state", async () => {
    const state = makeState("bug-fix", {
      synthesizedCommits: ["bootstrap-sha"],
      steps: {
        "test-materialize": [makeStepRun("base-sha")],
        "implementer": [makeStepRun("candidate-sha")],
      },
    });

    const fake = makeFakeRuntime({ headOid: "head-sha" });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "mismatch",
    });

    expect(result.verdict).toBe("failed");
    expect(result.reason).toMatch(/tamper/i);
    expect(result.records).toHaveLength(0);
    // Short-circuit before any synthesized-tree calls
    expect(fake._synthesizedTreeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008: Unavailable runtime still defers
// ---------------------------------------------------------------------------

describe("TC-008: Unavailable runtime still defers", () => {
  it("TC-008: runTestsOnSynthesizedTree returning unavailable causes strategy-deferred", async () => {
    const testFile = "src/__tests__/feature.test.ts";
    const headOid = "head-sha-008";
    const baseOid = "base-sha-008";
    const implOid = "impl-sha-008";

    const state = makeState("bug-fix", {
      synthesizedCommits: ["bootstrap-sha-008"],
      steps: {
        "test-materialize": [makeStepRun(baseOid)],
        "implementer": [makeStepRun(implOid)],
      },
    });

    // Runtime that DOES exist but runTestsOnSynthesizedTree returns unavailable
    // (simulates managed runtime or unset scopedTestCommand).
    //
    // Also configure testResultsByOid for the OLD gate path (base-red, impl-green)
    // so the old gate would return "passed". This makes TC-008 properly RED with
    // old code (old gate returns "passed", not "strategy-deferred") and GREEN with
    // new code (runTestsOnSynthesizedTree unavailable → defers).
    const fake = makeFakeRuntime({
      headOid,
      changedFiles: [testFile],
      synthesizedTreeResult: { kind: "unavailable", reason: "no scopedTestCommand configured" },
      testResultsByOid: {
        // Old gate uses these OIDs for runTestsAtCommit(base/candidate):
        [baseOid]: [{ file: testFile, passed: false }],   // base-red (old gate path)
        [implOid]: [{ file: testFile, passed: true }],    // candidate-green (old gate path)
        // New gate uses headOid for runTestsAtCommit(candidate), but defers before reaching it:
        [headOid]: [{ file: testFile, passed: true }],
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "inconclusive",
    });

    // THEN the gate defers because the synthesized-tree execution is unavailable.
    // (Old gate returns "passed" via runTestsAtCommit — the assertion fails → RED.
    //  New gate calls runTestsOnSynthesizedTree → unavailable → strategy-deferred → GREEN.)
    expect(result.verdict).toBe("strategy-deferred");
    expect(result.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-009: Absent Evidence Base reference defers
// ---------------------------------------------------------------------------

describe("TC-009: Absent Evidence Base reference defers", () => {
  it("TC-009: empty synthesizedCommits → resolveEvidenceBaseRev null → strategy-deferred, no synthesized-tree call", async () => {
    const testFile = "src/__tests__/feature.test.ts";
    const baseOid = "base-sha-009";
    const implOid = "impl-sha-009";
    const headOid = "head-sha-009";

    // State has a test-materialize commit (so baseOid is resolvable) and implementer
    // commit (no contamination in old sense), but synthesizedCommits is EMPTY →
    // resolveEvidenceBaseRev returns null in the new code.
    //
    // Also configure testResultsByOid for the OLD gate path (base-red, impl-green)
    // so the old gate returns "passed". This makes TC-009 properly RED with old code.
    const state = makeState("bug-fix", {
      synthesizedCommits: [],   // <-- EMPTY: EB ref cannot be resolved
      steps: {
        "test-materialize": [makeStepRun(baseOid, "2026-01-01T00:01:00.000Z")],
        "implementer": [makeStepRun(implOid, "2026-01-01T00:02:00.000Z")],
      },
    });

    const fake = makeFakeRuntime({
      headOid,
      changedFiles: [testFile],
      synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] },
      testResultsByOid: {
        [baseOid]: [{ file: testFile, passed: false }],   // base-red (old gate path)
        [implOid]: [{ file: testFile, passed: true }],    // impl-green (old gate path)
        [headOid]: [{ file: testFile, passed: true }],    // HEAD-green (new gate path)
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "inconclusive",
    });

    // THEN the gate defers because the Evidence Base reference cannot be resolved.
    // (Old gate returns "passed" via runTestsAtCommit(base/impl) — assertion fails → RED.
    //  New gate: resolveEvidenceBaseRev returns null → strategy-deferred → GREEN.)
    expect(result.verdict).toBe("strategy-deferred");
    expect(result.records).toHaveLength(0);
    // No synthesized-tree execution should have happened (deferred before that step)
    expect(fake._synthesizedTreeCalls).toHaveLength(0);
  });

  it("TC-009: absent synthesizedCommits field → strategy-deferred (legacy state, no EB ref)", async () => {
    const testFile = "src/__tests__/feature.test.ts";
    const baseOid = "base-sha-009b";
    const implOid = "impl-sha-009b";
    const headOid = "head-sha-009b";

    const state = makeState("bug-fix", {
      // synthesizedCommits absent entirely
      steps: {
        "test-materialize": [makeStepRun(baseOid)],
        "implementer": [makeStepRun(implOid)],
      },
    });

    const fake = makeFakeRuntime({
      headOid,
      changedFiles: [testFile],
      synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] },
      testResultsByOid: {
        [baseOid]: [{ file: testFile, passed: false }],
        [implOid]: [{ file: testFile, passed: true }],
        [headOid]: [{ file: testFile, passed: true }],
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "inconclusive",
    });

    expect(result.verdict).toBe("strategy-deferred");
    expect(result.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-010: Absent HEAD OID defers
// ---------------------------------------------------------------------------

describe("TC-010: Absent HEAD OID defers", () => {
  it("TC-010: captureHeadSha returns null → strategy-deferred (HEAD OID not obtainable)", async () => {
    const testFile = "src/__tests__/feature.test.ts";
    const baseOid = "base-sha-010";
    const implOid = "impl-sha-010";

    // State with valid EB ref (synthesizedCommits[0] present) and materialize commit.
    // Also configure testResultsByOid for the OLD gate path (base-red, impl-green)
    // so the old gate returns "passed". This makes TC-010 properly RED with old code.
    const state = makeState("bug-fix", {
      synthesizedCommits: ["bootstrap-sha-010"],
      steps: {
        "test-materialize": [makeStepRun(baseOid)],
        "implementer": [makeStepRun(implOid)],
      },
    });

    // captureHeadSha returns null — no HEAD reachable
    const fake = makeFakeRuntime({
      headOid: null,   // <-- null HEAD: new gate defers here; old gate ignores this
      changedFiles: [testFile],
      synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] },
      testResultsByOid: {
        [baseOid]: [{ file: testFile, passed: false }],   // base-red (old gate path)
        [implOid]: [{ file: testFile, passed: true }],    // impl-green (old gate path → PASSED)
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "inconclusive",
    });

    // THEN the gate defers because HEAD OID is not obtainable.
    // (Old gate: doesn't call captureHeadSha, runs via runTestsAtCommit(base/impl) → "passed"
    //  → assertion fails → RED.
    //  New gate: captureHeadSha → null → strategy-deferred → GREEN.)
    expect(result.verdict).toBe("strategy-deferred");
    expect(result.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-003: Adopted operator commit is included in the candidate
// ---------------------------------------------------------------------------

describe("TC-003: Adopted operator commit is included in the candidate", () => {
  it("TC-003: gate uses HEAD OID (not implementer.commitOid) as candidate when HEAD includes adopted commit", async () => {
    const testFile = "src/__tests__/feature.test.ts";
    // The operator commit was adopted AFTER the implementer ran.
    // HEAD now reaches this adopted commit.
    const implementerOid = "impl-sha-003";
    const adoptedOperatorOid = "operator-adopted-sha-003";   // HEAD

    const state = makeState("bug-fix", {
      synthesizedCommits: ["bootstrap-sha-003"],
      steps: {
        "test-materialize": [makeStepRun("base-sha-003")],
        "implementer": [makeStepRun(implementerOid)],
        // synthesizedCommits ledger also has the adopted commit (via --adopt-commits)
        // but implementer.commitOid is NOT updated — it remains implementerOid
      },
    });

    // HEAD is adoptedOperatorOid (post-adoption); base is "bootstrap-sha-003^"
    const fake = makeFakeRuntime({
      headOid: adoptedOperatorOid,   // HEAD reaches the adopted commit
      changedFiles: [testFile],
      // Red side (Evidence Base): runTestsOnSynthesizedTree with overlay from HEAD
      synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] },
      // Green side: runTestsAtCommit(HEAD = adoptedOperatorOid) → passes
      testResultsByOid: {
        [adoptedOperatorOid]: [{ file: testFile, passed: true }],
        // implementerOid NOT configured — if the gate uses it, runTestsAtCommit → unavailable
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: fake as never,
      tamperStatus: "inconclusive",
    });

    // THEN the verdict is passed (red→green) using HEAD as the candidate
    expect(result.verdict).toBe("passed");
    expect(result.records).toHaveLength(1);

    const record = result.records[0]!;
    // The candidate OID must be the HEAD OID (adoptedOperatorOid), NOT the implementer OID
    expect(record.candidateOid).toBe(adoptedOperatorOid);
    expect(record.candidateOid).not.toBe(implementerOid);

    expect(record.baseResult).toBe("red");
    expect(record.candidateResult).toBe("green");
    expect(record.verified).toBe(true);

    // The synthesized-tree call should have used HEAD as the overlay source
    expect(fake._synthesizedTreeCalls).toHaveLength(1);
    expect(fake._synthesizedTreeCalls[0]!.overlayFromOid).toBe(adoptedOperatorOid);
  });
});
