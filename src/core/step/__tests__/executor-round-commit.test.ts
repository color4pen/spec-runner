/**
 * Intended-invariant tests for the executor finalizeStepArtifacts gate.
 *
 * T-05 (round-owned-git-effects): verifies that the roundOwnsGitEffects flag in
 * PipelineDeps gates the finalizeStepArtifacts call in StepExecutor.runAgentStep.
 *
 * Invariants:
 *   - roundOwnsGitEffects === true  → finalizeStepArtifacts is NOT called
 *     (member is inside a coordinator round; coordinator owns git side effects)
 *   - roundOwnsGitEffects absent/false → finalizeStepArtifacts IS called
 *     (sequential / non-round execution; existing behavior unchanged)
 */

import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { StepExecutor } from "../executor.js";
import type { AgentStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 2,
    jobId: "round-commit-test-job",
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
    step: "reviewer-alpha",
    status: "running",
    branch: "change/example",
    history: [],
    error: null,
    steps: {},
  };
}

function makeAgentStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeStore() {
  return {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };
}

function makeRunner() {
  return {
    run: vi.fn(async () => ({
      completionReason: "success" as const,
      resultContent: null,
      sessionId: null,
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
    })),
  };
}

function makeRuntimeStrategy(finalizeStepArtifacts = vi.fn(async () => {})) {
  return {
    captureHeadSha: vi.fn(async () => null as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts,
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
  };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const store = makeStore();
  return {
    cwd: "/tmp/test",
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
    ...overrides,
  } as PipelineDeps;
}

// ---------------------------------------------------------------------------
// Tests: roundOwnsGitEffects === true → finalizeStepArtifacts NOT called
// ---------------------------------------------------------------------------

describe("StepExecutor — roundOwnsGitEffects: true → finalizeStepArtifacts skipped", () => {
  it("finalizeStepArtifacts is NOT called when roundOwnsGitEffects is true", async () => {
    const finalizeStepArtifacts = vi.fn(async () => {});
    const runtimeStrategy = makeRuntimeStrategy(finalizeStepArtifacts);
    const runner = makeRunner();
    const store = makeStore();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    await executor.execute(
      makeAgentStep("reviewer-alpha"),
      makeState(),
      makeDeps({
        runtimeStrategy: runtimeStrategy as never,
        roundOwnsGitEffects: true,
      }),
    );

    // D3 (round-owned-git-effects): coordinator owns git side effects — member must NOT commit
    expect(finalizeStepArtifacts).not.toHaveBeenCalled();
  });

  it("both members in a parallel round skip finalizeStepArtifacts", async () => {
    const finalizeStepArtifacts = vi.fn(async () => {});
    const runtimeStrategy = makeRuntimeStrategy(finalizeStepArtifacts);
    const runner = makeRunner();
    const store = makeStore();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    const deps = makeDeps({
      runtimeStrategy: runtimeStrategy as never,
      roundOwnsGitEffects: true,
    });

    await Promise.allSettled([
      executor.execute(makeAgentStep("reviewer-alpha"), makeState(), deps),
      executor.execute(makeAgentStep("reviewer-beta"), makeState(), deps),
    ]);

    expect(finalizeStepArtifacts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: roundOwnsGitEffects absent/false → finalizeStepArtifacts IS called
// ---------------------------------------------------------------------------

describe("StepExecutor — roundOwnsGitEffects absent → finalizeStepArtifacts called (sequential unchanged)", () => {
  it("finalizeStepArtifacts IS called when roundOwnsGitEffects is absent", async () => {
    const finalizeStepArtifacts = vi.fn(async () => {});
    const runtimeStrategy = makeRuntimeStrategy(finalizeStepArtifacts);
    const runner = makeRunner();
    const store = makeStore();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    await executor.execute(
      makeAgentStep("implementer"),
      makeState(),
      // No roundOwnsGitEffects — sequential path
      makeDeps({ runtimeStrategy: runtimeStrategy as never }),
    );

    expect(finalizeStepArtifacts).toHaveBeenCalledTimes(1);
  });

  it("finalizeStepArtifacts IS called when roundOwnsGitEffects is false", async () => {
    const finalizeStepArtifacts = vi.fn(async () => {});
    const runtimeStrategy = makeRuntimeStrategy(finalizeStepArtifacts);
    const runner = makeRunner();
    const store = makeStore();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    await executor.execute(
      makeAgentStep("implementer"),
      makeState(),
      makeDeps({
        runtimeStrategy: runtimeStrategy as never,
        roundOwnsGitEffects: false,
      }),
    );

    expect(finalizeStepArtifacts).toHaveBeenCalledTimes(1);
  });
});
