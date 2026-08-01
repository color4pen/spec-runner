/**
 * T-03 / T-04 / TC-001〜TC-012: code-fixer no-op detection + finding target exemption.
 *
 * Verifies that StepExecutor overrides verdict to "needs-fix" when:
 * - step.noOpDetect === true
 * - runtimeStrategy is available
 * - headBeforeStep is non-null
 * - completionReason === "success"
 * - listChangedFiles returns only pipeline artifacts (or nothing)
 *
 * And does NOT override when source files were changed.
 *
 * Also verifies requirements 1-4 from approved-fixer-noop-proceeds:
 * - Req 1: approved findings-routing path no-op is NOT escalated
 * - Req 2: needs-fix path no-op IS escalated (#734 regression guard)
 * - Req 3: approved path with source changes loops back (approved)
 * - Req 4: conformance-triggered no-op IS escalated (conformance is not findings-routing)
 *
 * And finding-target-exemption scenarios (noop-detect-finding-target-exemption):
 * - TC-001: finding が change folder doc を名指しし fixer がその doc のみを修正した → no override
 * - TC-002: finding が名指ししない change folder ファイルのみの変更 → needs-fix
 * - TC-003: finding がソースを名指しし変更もソースのみの通常ケース → no override
 * - TC-004: finding が state.json を名指しても needs-fix (pipelineManagedPaths 上限)
 * - TC-005: informational finding が doc を名指しし変更もその doc のみ → needs-fix (non-fixable は免除対象外)
 * - TC-006: 非 code-fixer step では免除集合が空 (noOpDetect not true → no exemption)
 * - TC-007: artifact のみの変更で finding が名指ししない (#734 escalate 維持)
 * - TC-008: approved findings-routing no-op は従来どおり抑止される
 * - TC-009: conformance 分岐（branch 1）で implementation-notes.md が免除される
 * - TC-010: coordinator-loop 分岐（branch 2）で implementation-notes.md が免除される
 * - TC-012: noOpDetect !== true の step では collectRoutedFixerFindings を呼ばない
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { EventBus } from "../../event/event-bus.js";
import { StepExecutor } from "../executor.js";
import type { SpawnFn as GitSpawnFn } from "../../../util/git-exec.js";
import type { AgentStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 2,
    jobId: "no-op-test-job",
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
    step: "code-fixer",
    status: "running",
    branch: "feat/example-abc12345",
    history: [],
    error: null,
    steps: {},
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
  // runner.run always succeeds; listChangedFiles is mocked separately in makeRuntimeStrategy
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

function makeRuntimeStrategy(changedFiles: string[]) {
  return {
    captureHeadSha: vi.fn(async () => "abc123head" as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => [] as never[]),
    listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: changedFiles })),
  };
}

function makeStep(noOpDetect?: boolean): AgentStep {
  return {
    kind: "agent",
    name: "code-fixer",
    agent: { id: "code-fixer-agent" } as never,
    completionVerdict: "approved" as const,
    noOpDetect,
    buildMessage: () => "fix the code",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeDeps(runtimeStrategy?: ReturnType<typeof makeRuntimeStrategy>): PipelineDeps {
  const store = makeStore();
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
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    runtimeStrategy: runtimeStrategy as never,
  } as PipelineDeps;
}

/**
 * Returns a GitSpawnFn that satisfies the git-exec ChildProcess interface.
 * Emits the given headSha on stdout when called with `git rev-parse HEAD`,
 * so that gitExec() in runAgentStep returns a non-null headBeforeStep.
 */
function makeGitRevParseSpawnFn(headSha: string): GitSpawnFn {
  return (_bin: string, args: string[], _opts): ChildProcess => {
    const child = new EventEmitter();
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    Object.assign(child, { stdout: stdoutEE, stderr: stderrEE, stdin: { end: () => {} } });
    setImmediate(() => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        stdoutEE.emit("data", Buffer.from(`${headSha}\n`));
        child.emit("close", 0);
      } else {
        child.emit("close", 128);
      }
    });
    return child as unknown as ChildProcess;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StepExecutor — T-03: no-op detection", () => {
  it("no source files changed → verdict overridden to 'needs-fix'", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);  // no changed files
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);  // noOpDetect: true
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    // listChangedFiles must have been called with headBeforeStep
    expect(runtimeStrategy.listChangedFiles).toHaveBeenCalledWith(
      "abc123head",
      "/tmp/worktree",
      "feat/example-abc12345",
    );

    // Verdict must be overridden to needs-fix
    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  it("only artifact files changed → verdict overridden to 'needs-fix' (artifacts don't count as source)", async () => {
    const runner = makeRunner();
    // Files that look like artifact files only
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "specrunner/changes/example/events.jsonl",
      ".specrunner/local/example/liveness.json",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  it("source files changed → verdict stays 'approved' (no override)", async () => {
    const runner = makeRunner();
    // Mix of source and artifact files → source change present
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "src/core/step/executor.ts",  // source file
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("noOpDetect: false → listChangedFiles not called, verdict not overridden", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(false);  // noOpDetect: false
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("noOpDetect: undefined → listChangedFiles not called, verdict not overridden", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(undefined);  // noOpDetect: undefined
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("runtimeStrategy absent → no-op detection does not activate", async () => {
    const runner = makeRunner();
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);  // noOpDetect: true
    const state = makeState();
    const deps = makeDeps(undefined);  // no runtimeStrategy
    deps.storeFactory = storeFactory;

    // Should not throw and should produce approved (no listChangedFiles call)
    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // Without runtimeStrategy, headBeforeStep is null → no-op detection skipped → approved
    expect(lastRun?.outcome.verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Requirements 1-4: approved-fixer-noop-proceeds
// ---------------------------------------------------------------------------

import { STEP_NAMES } from "../step-names.js";

/** Build a state that has a code-review run with the given verdict + findings. */
function makeStateWithCodeReview(
  verdict: string,
  findings: Array<{ severity: string; resolution: string }> = [],
): JobState {
  return {
    ...makeState(),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict,
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: findings.map((f) => ({
                severity: f.severity,
                resolution: f.resolution,
                file: "src/foo.ts",
                title: "T",
                rationale: "R",
              })),
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

describe("StepExecutor — approved-fixer-noop-proceeds requirements", () => {
  // ---------------------------------------------------------------------------
  // Requirement 1: approved findings-routing no-op does NOT escalate
  // ---------------------------------------------------------------------------
  it("Req 1: code-review approved + low fixable findings, no source changes → verdict stays 'approved' (not escalated)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",  // only artifact files
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);  // noOpDetect: true
    // State: code-review approved + low fixable finding → findings-routing path
    const state = makeStateWithCodeReview("approved", [
      { severity: "low", resolution: "fixable" },
    ]);
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // No mandatory findings → no-op is legitimate → verdict must stay "approved", not escalated
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // ---------------------------------------------------------------------------
  // Requirement 2: needs-fix path no-op IS escalated (#734 regression guard)
  // ---------------------------------------------------------------------------
  it("Req 2: code-review needs-fix, no source changes → verdict overridden to 'needs-fix' (escalated)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);  // no changed files
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);  // noOpDetect: true
    // State: code-review needs-fix → fixer must work, no-op is a genuine failure
    const state = makeStateWithCodeReview("needs-fix", [
      { severity: "high", resolution: "fixable" },
    ]);
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // needs-fix path → no-op must be escalated
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  // ---------------------------------------------------------------------------
  // Requirement 3: approved path with source changes → approved (re-review loop)
  // ---------------------------------------------------------------------------
  it("Req 3: code-review approved + fixable findings, source files changed → verdict 'approved' (re-review)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "src/foo.ts",  // real source file changed
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);  // noOpDetect: true
    const state = makeStateWithCodeReview("approved", [
      { severity: "low", resolution: "fixable" },
    ]);
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // Source changed → no no-op → verdict stays "approved" (triggers re-review)
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // ---------------------------------------------------------------------------
  // Requirement 4: conformance-triggered no-op IS escalated (not findings-routing)
  // ---------------------------------------------------------------------------
  it("Req 4: conformance needs-fix:code-fixer (after code-review approved+fixable), no source changes → escalated", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);  // no source changes
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);  // noOpDetect: true
    // State: code-review approved + fixable, BUT conformance ran later with needs-fix:code-fixer
    // → conformance is the trigger, not findings-routing → must escalate
    const state: JobState = {
      ...makeStateWithCodeReview("approved", [{ severity: "low", resolution: "fixable" }]),
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:01:00Z",
            endedAt: "2026-01-01T00:01:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "low", resolution: "fixable", file: "src/foo.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:05:00Z",
            endedAt: "2026-01-01T00:05:30Z",
            outcome: {
              verdict: "needs-fix:code-fixer",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "high", resolution: "fixable", file: "src/bar.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // conformance triggered this → codeReviewFindingsRoutingActive = false → escalate
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-001 to TC-012: noop-detect-finding-target-exemption
//
// These tests verify the finding-target exemption introduced by the change:
// "finding が名指しした path への変更は仕事として数える"
// Implemented via collectRoutedFixerFindings (routed-findings.ts, T-01) +
// findingTargetPaths/pipelineManagedPaths params in detectNoOp (T-02) +
// executor calling site (T-03).
// ---------------------------------------------------------------------------

import { CUSTOM_REVIEWERS_STEP_NAME } from "../../pipeline/types.js";

/**
 * Build a state that has a code-review run with the given verdict and a finding
 * targeting the specified file. Used for active-reviewer branch scenarios.
 */
function makeStateWithFinding(
  verdict: string,
  findingFile: string,
  resolution: "fixable" | "decision-needed" | "informational" = "fixable",
): JobState {
  return {
    ...makeState(),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict,
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution,
                  file: findingFile,
                  title: "T",
                  rationale: "R",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/** Build a state where conformance is the active trigger, with a finding for findingFile. */
function makeStateWithConformanceFinding(
  conformanceFindingFile: string,
): JobState {
  return {
    ...makeState(),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "low",
                  resolution: "fixable",
                  file: "src/foo.ts",
                  title: "T",
                  rationale: "R",
                },
              ],
            },
          },
        },
      ],
      [STEP_NAMES.CONFORMANCE]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:05:00Z",
          endedAt: "2026-01-01T00:05:30Z",
          outcome: {
            verdict: "needs-fix:code-fixer",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: conformanceFindingFile,
                  title: "T",
                  rationale: "R",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/** Build a state where coordinator-loop is active and a custom reviewer has a finding. */
function makeStateWithCoordinatorFinding(
  reviewerName: string,
  findingFile: string,
): JobState {
  return {
    ...makeState(),
    reviewers: [
      {
        name: reviewerName,
        maxIterations: 3,
        purpose: "test reviewer",
        criteria: "criteria",
        judgment: "judgment",
        freeText: "",
      },
    ],
    steps: {
      // coordinator ran with needs-fix → isCoordinatorLoopActive = true
      [CUSTOM_REVIEWERS_STEP_NAME]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:02:00Z",
          endedAt: "2026-01-01T00:02:30Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
      // custom reviewer step has needs-fix finding for the target file
      [reviewerName]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:02:05Z",
          endedAt: "2026-01-01T00:02:25Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: findingFile,
                  title: "T",
                  rationale: "R",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

describe("StepExecutor — finding-target exemption (noop-detect-finding-target-exemption)", () => {
  // -------------------------------------------------------------------------
  // TC-001: #927 実例 — finding が change folder doc を名指しし、fixer が当該 doc のみを修正した
  // Source: spec.md > Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える
  //         > Scenario: finding が change folder doc を名指しし fixer がその doc のみを修正した（#927 実例）
  // -------------------------------------------------------------------------
  it("TC-001: finding names implementation-notes.md, change is implementation-notes.md only → approved (no-op suppressed)", async () => {
    const runner = makeRunner();
    // Only the finding-named doc was changed — would normally be no-op but exemption applies
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true); // noOpDetect: true (code-fixer)
    // Active reviewer (code-review) has needs-fix + finding naming implementation-notes.md
    // Supplementary note: #927 composed-path (regression-gate) also uses the same active-reviewer branch
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // finding named the changed file → exemption applies → NOT a no-op → verdict stays "approved"
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // TC-002: finding が名指ししない change folder ファイルのみの変更 → needs-fix（従来どおり no-op）
  // Source: spec.md > Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える
  //         > Scenario: finding が名指ししない change folder ファイルのみの変更（従来どおり no-op）
  // -------------------------------------------------------------------------
  it("TC-002: finding names implementation-notes.md, change is other-doc.md only → needs-fix (no exemption)", async () => {
    const runner = makeRunner();
    // Changed file is different from what the finding names → NOT exempt
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/other-doc.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // other-doc.md is not named by any finding → no exemption → artifact-only → needs-fix
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  // -------------------------------------------------------------------------
  // TC-003: finding がソースを名指しし変更もソースのみの通常ケース（免除の影響なし）
  // Source: spec.md > Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える
  //         > Scenario: finding がソースを名指しし変更もソースのみの通常ケース（免除の影響なし）
  // -------------------------------------------------------------------------
  it("TC-003: finding names src/foo.ts, change is src/foo.ts only → approved (source change, normal case)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy(["src/foo.ts"]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    const state = makeStateWithFinding("needs-fix", "src/foo.ts");
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // src/foo.ts is a source file → always counted as work (pre-existing path, no change from exemption)
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // TC-004: finding が state.json を名指しても needs-fix（pipelineManagedPaths 上限）
  // Source: spec.md > Requirement: pipelineManagedPaths は finding が名指ししても仕事に数えない
  //         > Scenario: finding が state.json を名指しても needs-fix
  // -------------------------------------------------------------------------
  it("TC-004: finding names state.json, change is state.json only → needs-fix (pipelineManagedPaths cap)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    // finding names state.json but pipelineManagedPaths caps the exemption
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/state.json",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // state.json is in pipelineManagedPaths → even if finding names it, NOT exempt → needs-fix
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  // -------------------------------------------------------------------------
  // TC-005: informational resolution finding が doc を名指しし変更もその doc のみ → needs-fix
  // Source: routed-findings.ts branch 3 が collectFixableFindings を適用し、
  //         non-fixable finding (informational) を exemption 集合から除外することを
  //         executor 統合レベルで固定する。
  //         collectFixableFindings が branch 3 から除去された場合にこのテストが失敗し、
  //         unit test (routed-findings.test.ts TC-005 extended) と二重で捕捉できる。
  // -------------------------------------------------------------------------
  it("TC-005: informational finding names implementation-notes.md, change is implementation-notes.md only → needs-fix (non-fixable excluded from exemption)", async () => {
    const runner = makeRunner();
    // Only the finding-named doc was changed — but the finding is informational, not fixable
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true); // noOpDetect: true (code-fixer)
    // finding resolution is "informational" → collectFixableFindings excludes it from the exemption set
    // Even though the changed file matches the finding's file, no exemption is granted
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/implementation-notes.md",
      "informational",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // informational finding → not in exemption set → implementation-notes.md not exempt →
    // artifact-only change → needs-fix
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  // -------------------------------------------------------------------------
  // TC-006: 非 code-fixer step では免除集合が空
  // Source: spec.md > Requirement: 免除集合は「当該 fixer run に routing された findings」から機械的に導出される
  //         > Scenario: 非 code-fixer step では免除集合が空
  // -------------------------------------------------------------------------
  it("TC-006: noOpDetect not set → exemption not applied, listChangedFiles not called, verdict approved", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    // Step without noOpDetect (simulates non-code-fixer step like spec-fixer / build-fixer)
    const step = makeStep(undefined); // noOpDetect: undefined
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    // listChangedFiles not called when noOpDetect is not true
    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();
    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // No no-op detection → verdict stays "approved"
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // TC-007: artifact のみの変更で finding が名指ししない（#734 escalate 維持）
  // Source: spec.md > Requirement: 既存の no-op 挙動を保存する
  //         > Scenario: artifact のみの変更で finding が名指ししない（#734 escalate 維持）
  // -------------------------------------------------------------------------
  it("TC-007: finding names implementation-notes.md, but only state.json/events.jsonl changed → needs-fix (#734)", async () => {
    const runner = makeRunner();
    // Changed files are artifacts that the finding does NOT name → no exemption
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "specrunner/changes/example/events.jsonl",
      ".specrunner/local/example/liveness.json",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    // Finding names implementation-notes.md, but fixer changed state.json instead
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // state.json / events.jsonl are not in the finding set → not exempt → artifact-only → needs-fix
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  // -------------------------------------------------------------------------
  // TC-008: approved findings-routing no-op は従来どおり抑止される
  // Source: spec.md > Requirement: 既存の no-op 挙動を保存する
  //         > Scenario: approved findings-routing no-op は従来どおり抑止される
  // -------------------------------------------------------------------------
  it("TC-008: code-review approved + fixable finding, only artifact files changed → approved (findingsRoutingApproved suppression)", async () => {
    const runner = makeRunner();
    // Artifacts only changed → would be needs-fix, but findingsRoutingApproved suppresses it
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    // code-review approved + fixable → findingsRoutingApproved = true
    const state = makeStateWithFinding(
      "approved", // approved verdict → codeReviewFindingsRoutingActive = true
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // findingsRoutingApproved suppresses no-op → verdict stays "approved"
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // TC-009: collectRoutedFixerFindings — conformance 分岐（branch 1）で implementation-notes.md が免除される
  // Source: tasks.md > T-04（conformance 分岐シナリオ）
  // -------------------------------------------------------------------------
  it("TC-009: conformance finding names implementation-notes.md, change is implementation-notes.md → approved (branch 1)", async () => {
    const runner = makeRunner();
    // Only the conformance-finding-named doc was changed
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    // conformance.endedAt (00:05:30) > code-review.endedAt (00:01:30) → conformance takes precedence
    // collectRoutedFixerFindings takes branch 1: returns conformance findings
    const state = makeStateWithConformanceFinding(
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // conformance finding names implementation-notes.md → exempt → NOT a no-op → approved
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // TC-010: collectRoutedFixerFindings — coordinator-loop 分岐（branch 2）で implementation-notes.md が免除される
  // Source: tasks.md > T-04（coordinator-loop 分岐シナリオ）
  // -------------------------------------------------------------------------
  it("TC-010: coordinator finding names implementation-notes.md, change is implementation-notes.md → approved (branch 2)", async () => {
    const runner = makeRunner();
    // Only the coordinator-finding-named doc was changed
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(true);
    // Coordinator loop active: custom reviewer "doc-reviewer" has needs-fix finding for implementation-notes.md
    // collectRoutedFixerFindings takes branch 2: returns coordinator findings (via collectParallelFixerFindings)
    const state = makeStateWithCoordinatorFinding(
      "doc-reviewer",
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // coordinator finding names implementation-notes.md → exempt → NOT a no-op → approved
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // TC-012: executor — noOpDetect !== true の step では collectRoutedFixerFindings を呼ばない
  // Source: tasks.md > T-03（Acceptance Criteria）
  // -------------------------------------------------------------------------
  it("TC-012: noOpDetect: false → collectRoutedFixerFindings not invoked, listChangedFiles not called, verdict approved", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory, makeGitRevParseSpawnFn("abc123head"));

    const step = makeStep(false); // noOpDetect: false
    // Even with coordinator loop active and findings present, noOpDetect=false skips all routing
    const state = makeStateWithCoordinatorFinding(
      "doc-reviewer",
      "specrunner/changes/example/implementation-notes.md",
    );
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    // listChangedFiles not called (no-op detection entirely skipped)
    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();
    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // No override → verdict stays "approved"
    expect(lastRun?.outcome.verdict).toBe("approved");
  });
});
