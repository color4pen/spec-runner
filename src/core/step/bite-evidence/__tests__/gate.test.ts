/**
 * Bite-evidence gate tests.
 *
 * Verifies:
 *   - TC-003: real tooth passes and records evidence (base-red → candidate-green)
 *   - TC-004: base-green test is rejected (hollow test)
 *   - TC-005: candidate that stays red is rejected
 *   - TC-006: tampered test-cases.md is rejected
 *   - TC-007: refactoring job defers (non-forward type)
 *   - TC-008: only materialized test files are executed
 *   - TC-022: gate emits strategy-deferred when base OID is absent
 *   - TC-030: state.biteEvidence is populated after forward-strategy gate (via commitSuccess)
 *   - TC-031: strategy-deferred run does not populate state.biteEvidence
 *   - TC-032: tamper check returns inconclusive when frozen hash is absent
 */

import { describe, it, expect, vi } from "vitest";
import { runBiteEvidenceGate } from "../gate.js";
import { checkTamperStatus } from "../tamper.js";
import type { JobState, StepRun } from "../../../../state/schema.js";
import type { BiteEvidenceRecord } from "../../../../state/schema.js";
import type { LineageRecord } from "../../../../store/event-journal.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  requestType: string,
  overrides: Partial<JobState> = {},
): JobState {
  return {
    version: 2,
    jobId: "gate-test-job",
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

/**
 * Fake runtime that records calls to runTestsAtCommit and listCommitChangedFiles.
 * Configurable per-oid results for testing different scenarios.
 */
type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

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
        const files = options.changedFiles ?? ["src/__tests__/foo.test.ts"];
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
// TC-022: gate emits strategy-deferred when base OID is absent
// ---------------------------------------------------------------------------

describe("TC-022: gate emits strategy-deferred when base OID is absent", () => {
  it("TC-022: bug-fix job with no test-materialize run returns strategy-deferred with empty records", async () => {
    const state = makeState("bug-fix", { steps: {} });
    const { runtime } = makeFakeRuntime({});

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
  });

  it("TC-022: returns strategy-deferred (not failed) when candidate OID is also absent", async () => {
    const state = makeState("bug-fix", {
      steps: {
        "test-materialize": [makeStepRunWithOid("base-sha-001")],
        // no implementer runs
      },
    });
    const { runtime } = makeFakeRuntime({});

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
  });
});

// ---------------------------------------------------------------------------
// TC-007: refactoring job defers
// ---------------------------------------------------------------------------

describe("TC-007: non-forward job type emits strategy-deferred", () => {
  it("TC-007: refactoring job defers without generating BiteEvidence", async () => {
    const state = makeState("refactoring", {
      steps: {
        "test-materialize": [makeStepRunWithOid("base-sha-001")],
        "implementer": [makeStepRunWithOid("candidate-sha-001")],
      },
    });
    const { runtime } = makeFakeRuntime({});

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
  });
});

// ---------------------------------------------------------------------------
// TC-003: real tooth passes and records evidence
// ---------------------------------------------------------------------------

describe("TC-003: real tooth — base-red, candidate-green produces passed verdict", () => {
  it("TC-003: gate passes with verified BiteEvidence when base fails and candidate passes", async () => {
    const baseOid = "base-sha-real-tooth";
    const candidateOid = "candidate-sha-real-tooth";
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
        [baseOid]: [{ file: testFile, passed: false }],       // base: RED
        [candidateOid]: [{ file: testFile, passed: true }],   // candidate: GREEN
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    expect(result.verdict).toBe("passed");
    expect(result.records).toHaveLength(1);

    const record = result.records[0]!;
    expect(record.testId).toBe(testFile);
    expect(record.strategy).toBe("forward");
    expect(record.baseResult).toBe("red");
    expect(record.candidateResult).toBe("green");
    expect(record.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-004: base-green test is rejected (hollow test)
// ---------------------------------------------------------------------------

describe("TC-004: base-green test (hollow tooth) is rejected fail-closed", () => {
  it("TC-004: gate returns failed when base passes the test (hollow, no tooth)", async () => {
    const baseOid = "base-sha-hollow";
    const candidateOid = "candidate-sha-hollow";
    const testFile = "src/__tests__/hollow.test.ts";

    const state = makeState("bug-fix", {
      steps: {
        "test-materialize": [makeStepRunWithOid(baseOid)],
        "implementer": [makeStepRunWithOid(candidateOid)],
      },
    });

    const { runtime } = makeFakeRuntime({
      changedFiles: [testFile],
      testResultsByOid: {
        [baseOid]: [{ file: testFile, passed: true }],        // base: GREEN (hollow!)
        [candidateOid]: [{ file: testFile, passed: true }],   // candidate: GREEN
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    expect(result.verdict).toBe("failed");

    const record = result.records[0];
    expect(record).toBeDefined();
    expect(record!.baseResult).toBe("green");
    expect(record!.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-005: candidate that stays red is rejected
// ---------------------------------------------------------------------------

describe("TC-005: candidate that stays red is rejected", () => {
  it("TC-005: gate returns failed when candidate test still fails", async () => {
    const baseOid = "base-sha-candidate-red";
    const candidateOid = "candidate-sha-candidate-red";
    const testFile = "src/__tests__/not-implemented.test.ts";

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
        [candidateOid]: [{ file: testFile, passed: false }],  // candidate: RED (not fixed!)
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    expect(result.verdict).toBe("failed");

    const record = result.records[0];
    expect(record).toBeDefined();
    expect(record!.candidateResult).toBe("red");
    expect(record!.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-006: tampered test-cases.md is rejected
// ---------------------------------------------------------------------------

describe("TC-006: tampered test-cases.md is rejected fail-closed", () => {
  it("TC-006: gate returns failed when tamperStatus is mismatch", async () => {
    const state = makeState("bug-fix", {
      steps: {
        "test-materialize": [makeStepRunWithOid("base-sha-tamper")],
        "implementer": [makeStepRunWithOid("candidate-sha-tamper")],
      },
    });
    const { runtime } = makeFakeRuntime({
      changedFiles: ["src/__tests__/example.test.ts"],
      testResultsByOid: {
        "base-sha-tamper": [{ file: "src/__tests__/example.test.ts", passed: false }],
        "candidate-sha-tamper": [{ file: "src/__tests__/example.test.ts", passed: true }],
      },
    });

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "mismatch",  // <-- tamper detected
    });

    expect(result.verdict).toBe("failed");
    expect(result.reason).toMatch(/tamper/i);
    expect(result.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008: only materialized test files are executed
// ---------------------------------------------------------------------------

describe("TC-008: only materialized test files are executed (not full suite)", () => {
  it("TC-008: runTestsAtCommit is called only with files from the base commit excluding pipeline artifacts", async () => {
    const baseOid = "base-sha-scoped";
    const candidateOid = "candidate-sha-scoped";

    // The changed files include a test file and some pipeline artifacts to be excluded
    const materializedTestFile = "src/__tests__/my-feature.test.ts";
    const pipelineArtifact = "specrunner/changes/example/test-cases.md";
    const specrunnerConfig = ".specrunner/config.json";

    const state = makeState("bug-fix", {
      steps: {
        "test-materialize": [makeStepRunWithOid(baseOid)],
        "implementer": [makeStepRunWithOid(candidateOid)],
      },
    });

    const { runtime, calls } = makeFakeRuntime({
      changedFiles: [materializedTestFile, pipelineArtifact, specrunnerConfig],
      testResultsByOid: {
        [baseOid]: [{ file: materializedTestFile, passed: false }],
        [candidateOid]: [{ file: materializedTestFile, passed: true }],
      },
    });

    await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    // Verify runTestsAtCommit was called for both base and candidate
    expect(calls).toHaveLength(2);

    for (const call of calls) {
      // Must NOT include pipeline artifacts or .specrunner/ files
      expect(call.testFiles).not.toContain(pipelineArtifact);
      expect(call.testFiles).not.toContain(specrunnerConfig);

      // Must include the materialized test file
      expect(call.testFiles).toContain(materializedTestFile);
    }
  });

  it("TC-008: calls are made separately for base and candidate OIDs", async () => {
    const baseOid = "base-sha-separate";
    const candidateOid = "candidate-sha-separate";
    const testFile = "src/__tests__/separate.test.ts";

    const state = makeState("bug-fix", {
      steps: {
        "test-materialize": [makeStepRunWithOid(baseOid)],
        "implementer": [makeStepRunWithOid(candidateOid)],
      },
    });

    const { runtime, calls } = makeFakeRuntime({
      changedFiles: [testFile],
      testResultsByOid: {
        [baseOid]: [{ file: testFile, passed: false }],
        [candidateOid]: [{ file: testFile, passed: true }],
      },
    });

    await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    // Verify two separate calls: one for base, one for candidate
    const oids = calls.map((c) => c.oid);
    expect(oids).toContain(baseOid);
    expect(oids).toContain(candidateOid);
  });
});

// ---------------------------------------------------------------------------
// TC-032: tamper check returns inconclusive when frozen hash is absent
// ---------------------------------------------------------------------------

describe("TC-032: tamper check inconclusive when frozen hash absent", () => {
  it("TC-032: checkTamperStatus returns inconclusive when lineage is empty", () => {
    // No lineage records → no test-case-gen record → inconclusive
    const result = checkTamperStatus([], "sha256:abc123");
    expect(result.status).toBe("inconclusive");
  });

  it("TC-032: checkTamperStatus returns inconclusive when lineage has no test-case-gen step", () => {
    // Lineage from another step, not test-case-gen
    const lineage: LineageRecord[] = [
      {
        type: "lineage",
        step: "spec-review",
        ts: "2026-01-01T00:00:00.000Z",
        outputs: [
          { path: "specrunner/changes/example/spec-review-result-001.md", hash: "sha256:def456" },
        ],
        inputs: [],
      },
    ];

    const result = checkTamperStatus(lineage, "sha256:abc123");
    expect(result.status).toBe("inconclusive");
  });

  it("TC-032: checkTamperStatus returns inconclusive when test-case-gen lineage lacks test-cases.md hash", () => {
    // test-case-gen lineage exists but doesn't include test-cases.md output
    const lineage: LineageRecord[] = [
      {
        type: "lineage",
        step: "test-case-gen",
        ts: "2026-01-01T00:00:00.000Z",
        outputs: [
          // Only other files, not test-cases.md
          { path: "specrunner/changes/example/spec.md", hash: "sha256:other" },
        ],
        inputs: [],
      },
    ];

    const result = checkTamperStatus(lineage, "sha256:abc123");
    expect(result.status).toBe("inconclusive");
  });

  it("TC-032: inconclusive tamper allows gate to proceed evaluating base/candidate", async () => {
    const baseOid = "base-sha-inconclusive";
    const candidateOid = "candidate-sha-inconclusive";
    const testFile = "src/__tests__/inconclusive.test.ts";

    const state = makeState("bug-fix", {
      steps: {
        "test-materialize": [makeStepRunWithOid(baseOid)],
        "implementer": [makeStepRunWithOid(candidateOid)],
      },
    });

    const { runtime } = makeFakeRuntime({
      changedFiles: [testFile],
      testResultsByOid: {
        [baseOid]: [{ file: testFile, passed: false }],
        [candidateOid]: [{ file: testFile, passed: true }],
      },
    });

    // Gate should proceed (not fail-closed) when tamperStatus is "inconclusive"
    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    // Gate evaluates base/candidate normally and passes
    expect(result.verdict).toBe("passed");
    expect(result.records[0]!.verified).toBe(true);
  });

  it("TC-032: checkTamperStatus returns mismatch when hashes differ", () => {
    const frozenHash = "sha256:frozen-abc123";
    const currentHash = "sha256:different-xyz789";

    const lineage: LineageRecord[] = [
      {
        type: "lineage",
        step: "test-case-gen",
        ts: "2026-01-01T00:00:00.000Z",
        outputs: [
          { path: "specrunner/changes/example/test-cases.md", hash: frozenHash },
        ],
        inputs: [],
      },
    ];

    const result = checkTamperStatus(lineage, currentHash);
    expect(result.status).toBe("mismatch");
  });

  it("TC-032: checkTamperStatus returns match when hashes are equal", () => {
    const hash = "sha256:same-abc123";

    const lineage: LineageRecord[] = [
      {
        type: "lineage",
        step: "test-case-gen",
        ts: "2026-01-01T00:00:00.000Z",
        outputs: [
          { path: "specrunner/changes/example/test-cases.md", hash },
        ],
        inputs: [],
      },
    ];

    const result = checkTamperStatus(lineage, hash);
    expect(result.status).toBe("match");
  });
});

// ---------------------------------------------------------------------------
// TC-030: state.biteEvidence populated after forward-strategy gate
// ---------------------------------------------------------------------------

describe("TC-030: state.biteEvidence is populated from gate result and survives persist/reload", () => {
  it("TC-030: commitSuccess reflects biteEvidence from gate StepCompletion into state", async () => {
    const { CommitOrchestrator } = await import("../../commit-orchestrator.js");
    const { EventBus } = await import("../../../event/event-bus.js");
    const { validateJobState } = await import("../../../../state/schema.js");

    const biteEvidenceRecords: BiteEvidenceRecord[] = [
      {
        testId: "src/__tests__/foo.test.ts",
        strategy: "forward",
        baseResult: "red",
        candidateResult: "green",
        verified: true,
      },
    ];

    // Build a StepCompletion with biteEvidence (T-08 adds this field)
    const completion = {
      verdict: "passed" as const,
      persistToolResult: null,
      biteEvidence: biteEvidenceRecords,
    };

    const state = makeState("bug-fix");

    const persistedStates: JobState[] = [];
    const store = {
      update: vi.fn(async (s: JobState, patch: Partial<JobState>) => ({ ...s, ...patch })),
      appendHistory: vi.fn(async (s: JobState) => s),
      fail: vi.fn(async (s: JobState) => ({ ...s, status: "failed" })),
      persist: vi.fn(async (s: JobState) => { persistedStates.push(s); }),
      appendLineage: vi.fn(async () => undefined),
      appendInterruption: vi.fn(async () => undefined),
    };

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator((_jobId: string) => store as never, events);

    const deps = {
      cwd: "/tmp",
      slug: "example",
      config: {} as never,
      request: {
        type: "bug-fix",
        title: "Example",
        slug: "example",
        baseBranch: "main",
        content: "Example",
        adr: false,
        path: "specrunner/changes/example/request.md",
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory: (_jobId: string) => store as never,
      runner: {} as never,
      resumePrompt: undefined,
      resumeContext: undefined,
    };

    const step = {
      kind: "cli" as const,
      name: "bite-evidence",
      run: async () => {},
      resultFilePath: () => "specrunner/changes/example/bite-evidence-result.md",
      parseResult: () => ({
        verdict: "passed" as const,
        findingsPath: null,
        biteEvidence: biteEvidenceRecords,
      }),
    };

    const result = {
      kind: "success" as const,
      completion,
      completedAt: "2026-01-01T00:02:00.000Z",
      startedAt: "2026-01-01T00:01:00.000Z",
      session: null,
    };

    await orchestrator.commitSuccess(step as never, state, deps as never, result as never);

    expect(persistedStates).toHaveLength(1);
    const persistedState = persistedStates[0]!;

    // biteEvidence should be reflected into state (T-08)
    const biteEvidence = (persistedState as JobState & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;
    expect(biteEvidence).toBeDefined();
    expect(biteEvidence).toHaveLength(1);
    expect(biteEvidence![0]!.testId).toBe("src/__tests__/foo.test.ts");
    expect(biteEvidence![0]!.verified).toBe(true);

    // Verify it survives validateJobState (serialization round-trip)
    const raw = JSON.parse(JSON.stringify(persistedState));
    const reloaded = validateJobState(raw);
    const reloadedBiteEvidence = (reloaded as JobState & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;
    expect(reloadedBiteEvidence).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-031: strategy-deferred run does not populate state.biteEvidence
// ---------------------------------------------------------------------------

describe("TC-031: strategy-deferred does not populate state.biteEvidence", () => {
  it("TC-031: refactoring job gate returns strategy-deferred and biteEvidence remains absent", async () => {
    const state = makeState("refactoring", {
      steps: {
        "test-materialize": [makeStepRunWithOid("base-sha-ref")],
        "implementer": [makeStepRunWithOid("candidate-sha-ref")],
      },
    });

    const { runtime } = makeFakeRuntime({});

    const result = await runBiteEvidenceGate({
      state,
      cwd: "/tmp/test-cwd",
      slug: "example",
      config: {} as never,
      runtimeStrategy: runtime as never,
      tamperStatus: "inconclusive",
    });

    // strategy-deferred means no BiteEvidence was generated
    expect(result.verdict).toBe("strategy-deferred");
    expect(result.records).toHaveLength(0);
  });
});
