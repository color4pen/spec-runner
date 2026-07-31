/**
 * Gate verdict tests for the test-file selection change.
 *
 * Covers:
 *   TC-009: only non-test files in base commit yields strategy-deferred
 *   TC-010: real biting test passes the gate (base-red → candidate-green)
 *   TC-011: unfixed tooth fails the gate (base-red → candidate-red)
 *   TC-014: tamper mismatch still yields failed
 *
 * TC-009 is intentionally red until the implementation changes the empty-set
 * branch from `failed` to `strategy-deferred` (requirement 3).
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
    jobId: "gate-selection-test-job",
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

function makeStepRunWithOid(commitOid: string, attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt: "2026-01-01T00:01:00.000Z",
    endedAt: "2026-01-01T00:02:00.000Z",
    commitOid,
  } as StepRun & { commitOid: string };
}

type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

/**
 * Build a minimal fake runtime with configurable changedFiles and per-OID results.
 */
function makeFakeRuntime(options: {
  changedFiles?: string[];
  testResultsByOid?: Record<string, { file: string; passed: boolean }[]>;
}) {
  const calls: { oid: string; testFiles: string[] }[] = [];

  return {
    calls,
    runtime: {
      listCommitChangedFiles: async (
        _oid: string,
        _cwd: string,
      ): Promise<{ kind: "success"; files: string[] } | { kind: "unavailable"; reason: string }> => {
        const files = options.changedFiles ?? [];
        return { kind: "success", files };
      },
      runTestsAtCommit: async (
        oid: string,
        testFiles: string[],
        _cwd: string,
        _config: unknown,
      ): Promise<IsolatedTestResult> => {
        calls.push({ oid, testFiles });
        const results = options.testResultsByOid?.[oid];
        if (results === undefined) {
          return { kind: "unavailable", reason: `no results configured for oid ${oid}` };
        }
        return { kind: "ran", results };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// TC-009: only non-test files in base commit yields strategy-deferred
// ---------------------------------------------------------------------------

describe("TC-009: only non-test files in base commit yields strategy-deferred", () => {
  it(
    "TC-009: forward-type job with only package.json and src/lib.rs in base commit → strategy-deferred",
    async () => {
      // GIVEN a forward-type job whose base commit changed only package.json and src/lib.rs
      const baseOid = "base-sha-nontestonly";
      const candidateOid = "candidate-sha-nontestonly";

      const state = makeState("bug-fix", {
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid(candidateOid)],
        },
      });

      const { runtime, calls } = makeFakeRuntime({
        // Base commit only changed non-test files — none match *.test.* / *.spec.* / *_test.*
        changedFiles: ["package.json", "src/lib.rs"],
        testResultsByOid: {},
      });

      // WHEN the bite-evidence gate runs
      const result = await runBiteEvidenceGate({
        state,
        cwd: "/tmp/test-cwd",
        slug: "example",
        config: {} as never,
        runtimeStrategy: runtime as never,
        tamperStatus: "inconclusive",
      });

      // THEN the verdict is strategy-deferred and records are empty.
      // After implementation: the selection is empty before runTestsAtCommit is called,
      // so runTestsAtCommit must NOT have been invoked (calls.length === 0).
      // (Intentionally RED: current implementation calls runTestsAtCommit with the
      // non-test files, not returning strategy-deferred from empty selection.)
      expect(result.verdict).toBe("strategy-deferred");
      expect(result.records).toHaveLength(0);
      // The gate must detect empty selection before invoking runTestsAtCommit.
      expect(calls).toHaveLength(0);
    },
  );

  it(
    "TC-009: non-test files including fixture JSON and implementation .ts → strategy-deferred",
    async () => {
      const baseOid = "base-sha-fixtures";
      const candidateOid = "candidate-sha-fixtures";

      const state = makeState("new-feature", {
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid(candidateOid)],
        },
      });

      const { runtime, calls } = makeFakeRuntime({
        changedFiles: ["fixtures/data.json", "src/feature/index.ts"],
        testResultsByOid: {},
      });

      const result = await runBiteEvidenceGate({
        state,
        cwd: "/tmp/test-cwd",
        slug: "example",
        config: {} as never,
        runtimeStrategy: runtime as never,
        tamperStatus: "inconclusive",
      });

      expect(result.verdict).toBe("strategy-deferred");
      expect(result.records).toHaveLength(0);
      // No runTestsAtCommit calls — empty selection detected before test execution.
      expect(calls).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010: real biting test passes the gate (base-red → candidate-green)
// ---------------------------------------------------------------------------

describe("TC-010: real biting test passes the gate", () => {
  it(
    "TC-010: forward-type job with base-red/candidate-green *.test.ts → passed",
    async () => {
      // GIVEN a forward-type job with a materialized *.test.ts file that is base-red and candidate-green
      const baseOid = "base-sha-biting";
      const candidateOid = "candidate-sha-biting";
      const testFile = "src/__tests__/feature.test.ts";

      const state = makeState("bug-fix", {
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid(candidateOid)],
        },
      });

      const { runtime } = makeFakeRuntime({
        changedFiles: [testFile],
        testResultsByOid: {
          [baseOid]: [{ file: testFile, passed: false }],      // base: RED
          [candidateOid]: [{ file: testFile, passed: true }],  // candidate: GREEN
        },
      });

      // WHEN the bite-evidence gate runs
      const result = await runBiteEvidenceGate({
        state,
        cwd: "/tmp/test-cwd",
        slug: "example",
        config: {} as never,
        runtimeStrategy: runtime as never,
        tamperStatus: "inconclusive",
      });

      // THEN the verdict is passed with a verified record
      expect(result.verdict).toBe("passed");
      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.verified).toBe(true);
      expect(result.records[0]!.baseResult).toBe("red");
      expect(result.records[0]!.candidateResult).toBe("green");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-011: unfixed tooth fails the gate (base-red → candidate-red)
// ---------------------------------------------------------------------------

describe("TC-011: unfixed tooth fails the gate", () => {
  it(
    "TC-011: forward-type job with base-red/candidate-red *.test.ts → failed",
    async () => {
      // GIVEN a forward-type job with a materialized *.test.ts file that is base-red and candidate-red
      const baseOid = "base-sha-unfixed";
      const candidateOid = "candidate-sha-unfixed";
      const testFile = "src/__tests__/unfixed.test.ts";

      const state = makeState("new-feature", {
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid(candidateOid)],
        },
      });

      const { runtime } = makeFakeRuntime({
        changedFiles: [testFile],
        testResultsByOid: {
          [baseOid]: [{ file: testFile, passed: false }],       // base: RED
          [candidateOid]: [{ file: testFile, passed: false }],  // candidate: RED (not fixed)
        },
      });

      // WHEN the bite-evidence gate runs
      const result = await runBiteEvidenceGate({
        state,
        cwd: "/tmp/test-cwd",
        slug: "example",
        config: {} as never,
        runtimeStrategy: runtime as never,
        tamperStatus: "inconclusive",
      });

      // THEN the verdict is failed
      expect(result.verdict).toBe("failed");
      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.verified).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-014: tamper mismatch still yields failed
// ---------------------------------------------------------------------------

describe("TC-014: tamper mismatch still yields failed", () => {
  it(
    "TC-014: forward-type job where gate detects tamper mismatch → verdict is failed",
    async () => {
      // GIVEN a forward-type job where the gate detects a tamper mismatch
      const state = makeState("bug-fix", {
        steps: {
          "test-materialize": [makeStepRunWithOid("base-sha-tamper-014")],
          "implementer": [makeStepRunWithOid("candidate-sha-tamper-014")],
        },
      });

      const { runtime } = makeFakeRuntime({
        changedFiles: ["src/__tests__/example.test.ts"],
        testResultsByOid: {
          "base-sha-tamper-014": [{ file: "src/__tests__/example.test.ts", passed: false }],
          "candidate-sha-tamper-014": [{ file: "src/__tests__/example.test.ts", passed: true }],
        },
      });

      // WHEN the bite-evidence gate runs with tamperStatus: "mismatch"
      const result = await runBiteEvidenceGate({
        state,
        cwd: "/tmp/test-cwd",
        slug: "example",
        config: {} as never,
        runtimeStrategy: runtime as never,
        tamperStatus: "mismatch",
      });

      // THEN the verdict is failed (tamper mismatch behavior is unchanged)
      expect(result.verdict).toBe("failed");
      expect(result.reason).toMatch(/tamper/i);
      expect(result.records).toHaveLength(0);
    },
  );
});
