/**
 * CommitOrchestrator tests for touchedFiles propagation (TC-009 to TC-012).
 *
 * TC-009: 成功した sequential step の記録が state に書き込まれる
 * TC-010: 同一 step の再実行で記録が置換される
 * TC-011: 記録しない runtime は state を触らない (touchedFiles === undefined)
 * TC-012: touchedFiles が空配列の場合でも state にエントリが書き込まれる
 */

import { describe, it, expect, vi } from "vitest";
import { CommitOrchestrator } from "../commit-orchestrator.js";
import { EventBus } from "../../event/event-bus.js";
import type { Step, AgentStep } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StepCompletion } from "../step-completion.js";
import type { StepExecutionResult } from "../commit-orchestrator.js";
import type { Verdict } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers (mirroring commit-orchestrator.test.ts patterns)
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "tf-test-job",
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
    branch: "feat/example",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as JobState;
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: (_state: JobState, _deps: PipelineDeps) => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeStep(name = "implementer"): Step {
  return makeAgentStep(name);
}

interface StoreMock {
  update: ReturnType<typeof vi.fn>;
  appendHistory: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  appendLineage: ReturnType<typeof vi.fn>;
  appendInterruption: ReturnType<typeof vi.fn>;
}

function makeStoreMock(): StoreMock {
  return {
    update: vi.fn(async (s: JobState, patch: Partial<JobState>) => ({ ...s, ...patch })),
    appendHistory: vi.fn(async (s: JobState) => s),
    fail: vi.fn(async (s: JobState) => ({ ...s, status: "failed" })),
    persist: vi.fn(async () => undefined),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async () => undefined),
  };
}

function makeStoreFactory(mock: StoreMock) {
  return (_jobId: string) => mock as never;
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
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
    storeFactory: () => ({} as never),
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    ...overrides,
  } as PipelineDeps;
}

function makeCompletion(verdict: Verdict = "approved"): StepCompletion {
  return {
    verdict,
    persistToolResult: null,
  };
}

function makeSuccessResult(
  overrides: Partial<StepExecutionResult & { kind: "success" }> = {},
): StepExecutionResult & { kind: "success" } {
  return {
    kind: "success",
    completion: makeCompletion(),
    completedAt: "2026-01-01T00:01:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    session: null,
    ...overrides,
  } as StepExecutionResult & { kind: "success" };
}

// ---------------------------------------------------------------------------
// TC-009: 成功した sequential step の記録が state に書き込まれる
// ---------------------------------------------------------------------------

describe("TC-009: successful sequential step with touchedFiles writes records to state", () => {
  it("state.touchedFiles[step.name] contains the files after commitSuccess", async () => {
    const store = makeStoreMock();

    // Capture the state that is passed to persist
    let persistedState: JobState | undefined;
    store.persist = vi.fn(async (s: JobState) => {
      persistedState = s;
    });

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const result = makeSuccessResult({
      touchedFiles: ["src/core/foo.ts", "src/adapter/bar.ts"],
    });

    await orchestrator.commitSuccess(step, state, deps, result);

    expect(persistedState).toBeDefined();
    const tf = persistedState!.touchedFiles;
    expect(tf).toBeDefined();
    expect(tf!["implementer"]).toEqual(["src/core/foo.ts", "src/adapter/bar.ts"]);
  });

  it("store.persist is called with state containing touchedFiles entry", async () => {
    const store = makeStoreMock();
    const capturedPersistArgs: JobState[] = [];
    store.persist = vi.fn(async (s: JobState) => {
      capturedPersistArgs.push(s);
    });

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    await orchestrator.commitSuccess(
      step,
      state,
      deps,
      makeSuccessResult({
        touchedFiles: ["src/core/foo.ts"],
      }),
    );

    expect(capturedPersistArgs).toHaveLength(1);
    const tf = capturedPersistArgs[0]!.touchedFiles;
    expect(tf?.["implementer"]).toEqual(["src/core/foo.ts"]);
  });
});

// ---------------------------------------------------------------------------
// TC-010: 同一 step の再実行で記録が置換される
// ---------------------------------------------------------------------------

describe("TC-010: re-run of same step replaces touchedFiles record (not append)", () => {
  it("second run overwrites first run's touchedFiles for the same step", async () => {
    const store = makeStoreMock();
    const persistedStates: JobState[] = [];
    store.persist = vi.fn(async (s: JobState) => {
      persistedStates.push(JSON.parse(JSON.stringify(s)) as JobState);
    });

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // First run: records ["a.ts", "b.ts"]
    const stateAfterRun1 = await orchestrator.commitSuccess(
      step,
      makeState(),
      deps,
      makeSuccessResult({
        touchedFiles: ["a.ts", "b.ts"],
      }),
    );

    // Second run: same step, different files
    await orchestrator.commitSuccess(
      step,
      stateAfterRun1,
      deps,
      makeSuccessResult({
        touchedFiles: ["b.ts", "c.ts"],
      }),
    );

    expect(persistedStates).toHaveLength(2);
    const tf = persistedStates[1]!.touchedFiles;

    // Must be ["b.ts", "c.ts"] — not ["a.ts", "b.ts", "c.ts"]
    expect(tf!["implementer"]).toEqual(["b.ts", "c.ts"]);
    expect(tf!["implementer"]).not.toContain("a.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-011: 記録しない runtime は state を触らない（touchedFiles === undefined）
// ---------------------------------------------------------------------------

describe("TC-011: runtime that does not record (touchedFiles === undefined) leaves state.touchedFiles unchanged", () => {
  it("does not add any touchedFiles entry when result.touchedFiles is undefined", async () => {
    const store = makeStoreMock();
    let persistedState: JobState | undefined;
    store.persist = vi.fn(async (s: JobState) => {
      persistedState = s;
    });

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState(); // no touchedFiles in initial state
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // No touchedFiles in result (codex/managed runtime)
    const result = makeSuccessResult(); // touchedFiles: undefined

    await orchestrator.commitSuccess(step, state, deps, result);

    expect(persistedState).toBeDefined();
    // touchedFiles should not exist on state at all (or remain undefined)
    expect(persistedState!.touchedFiles).toBeUndefined();
  });

  it("does not overwrite existing touchedFiles from prior steps when result.touchedFiles is undefined", async () => {
    const store = makeStoreMock();
    let persistedState: JobState | undefined;
    store.persist = vi.fn(async (s: JobState) => {
      persistedState = s;
    });

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("code-review"); // different step from what was recorded
    const state = makeState({
      touchedFiles: {
        implementer: ["src/core/prior.ts"],
      },
    });
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // No touchedFiles in result (undefined = codex/managed)
    await orchestrator.commitSuccess(step, state, deps, makeSuccessResult());

    expect(persistedState).toBeDefined();
    const tf = persistedState!.touchedFiles;
    // Prior implementer entry must be preserved
    expect(tf?.["implementer"]).toEqual(["src/core/prior.ts"]);
    // No code-review entry added
    expect(tf?.["code-review"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: touchedFiles が空配列の場合でも state にエントリが書き込まれる
// ---------------------------------------------------------------------------

describe("TC-012: empty array touchedFiles (touch-nothing run) is recorded as [] not undefined", () => {
  it("writes state.touchedFiles[step.name] = [] when result.touchedFiles is []", async () => {
    const store = makeStoreMock();
    let persistedState: JobState | undefined;
    store.persist = vi.fn(async (s: JobState) => {
      persistedState = s;
    });

    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    await orchestrator.commitSuccess(
      step,
      state,
      deps,
      makeSuccessResult({
        touchedFiles: [], // empty array: recorded, but empty
      }),
    );

    expect(persistedState).toBeDefined();
    const tf = persistedState!.touchedFiles;

    // Entry must exist as [] — not undefined
    expect(tf).toBeDefined();
    expect("implementer" in tf!).toBe(true);
    expect(tf!["implementer"]).toEqual([]);
  });
});
