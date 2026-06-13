import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { StepExecutor } from "../executor.js";
import type { AgentStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState, StepRun } from "../../../state/schema.js";

function makeStepRun(overrides: Partial<StepRun> = {}): StepRun {
  return {
    attempt: 1,
    sessionId: "session-1",
    startedAt: "2026-06-12T00:00:00.000Z",
    endedAt: "2026-06-12T00:05:00.000Z",
    outcome: {
      verdict: "needs-fix",
      findingsPath: "specrunner/changes/example/result.md",
      error: null,
      toolResult: null,
    },
    ...overrides,
  };
}

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-1",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/example",
    history: [],
    error: null,
    steps: {
      "spec-review": [makeStepRun()],
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const store = {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };

  return {
    cwd: "/tmp",
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
    resumeContext: {
      resumePoint: {
        step: "spec-review",
        reason: "timeout",
        iterationsExhausted: 2,
      },
    },
    ...overrides,
  } as PipelineDeps;
}

function makeStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

describe("StepExecutor resume context consumption", () => {
  it("consumes unmatched resume context before a later agent step can see it", async () => {
    const prompts: Array<string | undefined> = [];
    const runner = {
      run: vi.fn(async (ctx: { session: { resumePrompt?: string } }) => {
        prompts.push(ctx.session.resumePrompt);
        return {
          completionReason: "success" as const,
          resultContent: null,
          sessionId: null,
          agentBranch: null,
          modelUsage: undefined,
          toolResult: null,
          followUpAttempts: 0,
          transientRetryAttempts: 0,
          completionReportDiagnostics: [],
        };
      }),
    };
    const executor = new StepExecutor(new EventBus(), runner as never, makeDeps().storeFactory);
    const state = makeState();
    const deps = makeDeps({ runner: runner as never });

    await executor.execute(makeStep("design"), state, deps);
    await executor.execute(makeStep("spec-review"), state, deps);

    expect(prompts).toEqual([undefined, undefined]);
    expect(deps.resumeContext).toBeUndefined();
    expect(deps.resumePrompt).toBeUndefined();
  });
});
