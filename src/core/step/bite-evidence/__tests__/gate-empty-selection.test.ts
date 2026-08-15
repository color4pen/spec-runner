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
 * Includes captureHeadSha and runTestsOnSynthesizedTree for Evidence Base gate.
 */
function makeFakeRuntime(options: {
  headOid?: string | null;
  changedFiles?: string[];
  synthesizedTreeResult?: IsolatedTestResult;
  testResultsByOid?: Record<string, { file: string; passed: boolean }[]>;
}) {
  const calls: { oid: string; testFiles: string[] }[] = [];

  return {
    calls,
    runtime: {
      captureHeadSha: async (_cwd: string): Promise<string | null> => {
        return options.headOid ?? null;
      },
      listChangedFilesBetweenCommits: async (
        _baseOid: string,
        _headOid: string,
        _cwd: string,
      ): Promise<{ kind: "success"; files: string[] } | { kind: "unavailable"; reason: string }> => {
        const files = options.changedFiles ?? [];
        return { kind: "success", files };
      },
      runTestsOnSynthesizedTree: async (
        _baseRev: string,
        _overlayFiles: string[],
        _overlayFromOid: string,
        _cwd: string,
        _config: unknown,
      ): Promise<IsolatedTestResult> => {
        return options.synthesizedTreeResult ?? { kind: "unavailable", reason: "synthesizedTreeResult not configured" };
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

      const state = makeState("bug-fix", {
        synthesizedCommits: ["bootstrap-sha-nontestonly"],
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid("impl-sha-nontestonly")],
        },
      });

      const { runtime, calls } = makeFakeRuntime({
        headOid: "head-sha-nontestonly",
        // Base commit only changed non-test files — none match *.test.* / *.spec.* / *_test.*
        changedFiles: ["package.json", "src/lib.rs"],
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
      // Empty selection detected before invoking runTestsOnSynthesizedTree or runTestsAtCommit.
      expect(result.verdict).toBe("strategy-deferred");
      expect(result.records).toHaveLength(0);
      expect(calls).toHaveLength(0);
    },
  );

  it(
    "TC-009: non-test files including fixture JSON and implementation .ts → strategy-deferred",
    async () => {
      const baseOid = "base-sha-fixtures";

      const state = makeState("new-feature", {
        synthesizedCommits: ["bootstrap-sha-fixtures"],
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid("impl-sha-fixtures")],
        },
      });

      const { runtime, calls } = makeFakeRuntime({
        headOid: "head-sha-fixtures",
        changedFiles: ["fixtures/data.json", "src/feature/index.ts"],
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
    "TC-010: forward-type job with EB-red/HEAD-green *.test.ts → passed",
    async () => {
      // GIVEN a forward-type job with a materialized *.test.ts file that is EB-red and HEAD-green
      const baseOid = "base-sha-biting";
      const headOid = "head-sha-biting";
      const testFile = "src/__tests__/feature.test.ts";

      const state = makeState("bug-fix", {
        synthesizedCommits: ["bootstrap-sha-biting"],
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid("impl-sha-biting")],
        },
      });

      const { runtime } = makeFakeRuntime({
        headOid,
        changedFiles: [testFile],
        synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] }, // EB: RED
        testResultsByOid: {
          [headOid]: [{ file: testFile, passed: true }],  // HEAD: GREEN
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
    "TC-011: forward-type job with EB-red/HEAD-red *.test.ts → failed",
    async () => {
      // GIVEN a forward-type job with a materialized *.test.ts file that is EB-red and HEAD-red (not fixed)
      const baseOid = "base-sha-unfixed";
      const headOid = "head-sha-unfixed";
      const testFile = "src/__tests__/unfixed.test.ts";

      const state = makeState("new-feature", {
        synthesizedCommits: ["bootstrap-sha-unfixed"],
        steps: {
          "test-materialize": [makeStepRunWithOid(baseOid)],
          "implementer": [makeStepRunWithOid("impl-sha-unfixed")],
        },
      });

      const { runtime } = makeFakeRuntime({
        headOid,
        changedFiles: [testFile],
        synthesizedTreeResult: { kind: "ran", results: [{ file: testFile, passed: false }] }, // EB: RED
        testResultsByOid: {
          [headOid]: [{ file: testFile, passed: false }],  // HEAD: RED (not fixed)
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
