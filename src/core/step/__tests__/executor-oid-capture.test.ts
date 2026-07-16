/**
 * TC-012: Executor captures HEAD OID into commitOid after per-node commit.
 *
 * Verifies:
 *   - TC-012: sequential agent step captures HEAD OID into commitOid after finalizeStepArtifacts
 *
 * Source: tasks.md > T-02: Capture the commit OID in the executor and thread it into the success result
 *
 * GIVEN a sequential agent step (roundOwnsGitEffects === false) whose runtime strategy
 *   captureHeadSha returns "sha-candidate-001"
 * WHEN runAgentStep completes finalizeStepArtifacts and builds the success result
 * THEN the StepRun.commitOid recorded for that step is "sha-candidate-001"
 */

import { describe, it, expect, vi } from "vitest";
import { StepExecutor } from "../executor.js";
import { EventBus } from "../../event/event-bus.js";
import type { AgentStep } from "../types.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "oid-capture-test-job",
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
    step: "implementer",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeTrackingStore() {
  let lastPersisted: JobState | null = null;

  return {
    update: vi.fn(async (s: JobState, patch: Partial<JobState>) => ({ ...s, ...patch })),
    appendHistory: vi.fn(async (s: JobState) => s),
    fail: vi.fn(async (s: JobState) => ({ ...s, status: "failed" as const })),
    persist: vi.fn(async (s: JobState) => { lastPersisted = s; }),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async () => undefined),
    get lastPersistedState() { return lastPersisted; },
  };
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    completionVerdict: "success",
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
  };
}

function makeSuccessRunner() {
  return {
    run: vi.fn(async () => ({
      completionReason: "success" as const,
      resultContent: null,
      sessionId: "sess-oid-001",
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
    })),
  };
}

/**
 * Build PipelineDeps with a fake runtimeStrategy that:
 * - captureHeadSha returns the given commitOid
 * - finalizeStepArtifacts is a no-op
 * - roundOwnsGitEffects is false (sequential step mode)
 */
function makeDepsWithCaptureHeadSha(
  store: ReturnType<typeof makeTrackingStore>,
  captureHeadShaResult: string,
): PipelineDeps {
  const storeFactory = () => store as never;

  const runtimeStrategy = {
    captureHeadSha: vi.fn(async (_cwd: string): Promise<string | null> => captureHeadShaResult),
    finalizeStepArtifacts: vi.fn(async () => {}),
    prepareStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    digestArtifacts: vi.fn(async (_refs: { path: string }[]) => _refs.map((r) => ({ path: r.path, hash: null }))),
    captureMainCheckoutGuard: vi.fn(async () => null),
    snapshotMainCheckoutGuard: vi.fn(async () => null),
    listChangedFiles: vi.fn(async () => ({ kind: "unavailable" as const, reason: "fake" })),
    verifyFindingRefs: vi.fn(async () => []),
  };

  return {
    cwd: "/tmp/worktree",
    slug: "example",
    config: {} as never,
    request: {
      type: "bug-fix",
      title: "Example",
      slug: "example",
      baseBranch: "main",
      content: "Example request",
      adr: false,
      path: "specrunner/changes/example/request.md",
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: vi.fn() as never,
    storeFactory,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    runtimeStrategy,
    roundOwnsGitEffects: false,
  } as unknown as PipelineDeps;
}

// ---------------------------------------------------------------------------
// TC-012: Sequential step captures HEAD OID into commitOid
// ---------------------------------------------------------------------------

describe("TC-012: sequential agent step captures HEAD OID into commitOid after per-node commit", () => {
  it("TC-012: StepRun.commitOid matches captureHeadSha return value after finalizeStepArtifacts", async () => {
    const EXPECTED_COMMIT_OID = "sha-candidate-001";

    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);

    const step = makeAgentStep("implementer");
    const state = makeState();
    const deps = makeDepsWithCaptureHeadSha(store, EXPECTED_COMMIT_OID);

    await executor.execute(step, state, deps);

    // Verify the recorded StepRun has commitOid set to the value from captureHeadSha
    const persistedState = store.lastPersistedState;
    expect(persistedState).not.toBeNull();

    const stepRuns = persistedState!.steps?.["implementer"] ?? [];
    expect(stepRuns).toHaveLength(1);

    const run = stepRuns[0]! as StepRun & { commitOid?: string };
    expect(run.commitOid).toBe(EXPECTED_COMMIT_OID);
  });

  it("TC-012: captureHeadSha is called after finalizeStepArtifacts completes", async () => {
    const EXPECTED_COMMIT_OID = "sha-finalize-order-001";

    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);

    const step = makeAgentStep("implementer");
    const state = makeState();

    const callOrder: string[] = [];
    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => {
        callOrder.push("captureHeadSha");
        return EXPECTED_COMMIT_OID;
      }),
      finalizeStepArtifacts: vi.fn(async () => {
        callOrder.push("finalizeStepArtifacts");
      }),
      prepareStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      digestArtifacts: vi.fn(async (_refs: { path: string }[]) => _refs.map((r) => ({ path: r.path, hash: null }))),
      snapshotMainCheckoutGuard: vi.fn(async () => null),
      listChangedFiles: vi.fn(async () => ({ kind: "unavailable" as const, reason: "fake" })),
      verifyFindingRefs: vi.fn(async () => []),
    };

    const deps = {
      cwd: "/tmp/worktree",
      slug: "example",
      config: {} as never,
      request: {
        type: "bug-fix",
        title: "Example",
        slug: "example",
        baseBranch: "main",
        content: "Example request",
        adr: false,
        path: "specrunner/changes/example/request.md",
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory: () => store as never,
      runner: {} as never,
      resumePrompt: undefined,
      resumeContext: undefined,
      runtimeStrategy,
      roundOwnsGitEffects: false,
    } as unknown as PipelineDeps;

    await executor.execute(step, state, deps);

    // finalizeStepArtifacts must be called BEFORE captureHeadSha
    // (OID captures the commit AFTER the artifacts are committed)
    const finalizeIdx = callOrder.indexOf("finalizeStepArtifacts");
    const captureIdx = callOrder.indexOf("captureHeadSha");

    expect(captureIdx).toBeGreaterThan(-1);
    expect(finalizeIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(finalizeIdx);
  });

  it("TC-012: commitOid is not set when runtimeStrategy is absent", async () => {
    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);

    const step = makeAgentStep("implementer");
    const state = makeState();

    // No runtimeStrategy in deps
    const deps = {
      cwd: "/tmp/worktree",
      slug: "example",
      config: {} as never,
      request: {
        type: "bug-fix",
        title: "Example",
        slug: "example",
        baseBranch: "main",
        content: "Example request",
        adr: false,
        path: "specrunner/changes/example/request.md",
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory: () => store as never,
      runner: {} as never,
      resumePrompt: undefined,
      resumeContext: undefined,
      // runtimeStrategy intentionally omitted
    } as PipelineDeps;

    await executor.execute(step, state, deps);

    const persistedState = store.lastPersistedState;
    const stepRuns = persistedState?.steps?.["implementer"] ?? [];
    expect(stepRuns).toHaveLength(1);

    const run = stepRuns[0]! as StepRun & { commitOid?: string };
    // Without runtimeStrategy, commitOid is not captured
    expect(run.commitOid).toBeUndefined();
  });
});
