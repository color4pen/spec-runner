/**
 * Intended-invariant tests for coordinator round git effect ownership.
 *
 * T-05 (round-owned-git-effects): verifies that ParallelReviewRound correctly:
 *   1. Passes roundOwnsGitEffects=true to all member executions.
 *   2. Calls commitRoundArtifacts with only the declared outputs that were changed
 *      (toStage = changed ∩ declared) when there are no offending paths.
 *   3. Halts the round (escalation + ROUND_NONDECLARED_CHANGE) when changed ⊄ declared
 *      (after excluding pipeline-managed paths), WITHOUT calling commitRoundArtifacts.
 *   4. Excludes pipeline-managed paths (state.json etc.) from staging even if they changed.
 *   5. listWorktreeChanges returning empty paths → commitRoundArtifacts not called (no-op path).
 *
 * All scenarios use fake members and fake runtimeStrategy to drive ParallelReviewRound.run
 * without any git, filesystem, or network I/O.
 */

import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { ParallelReviewRound } from "../parallel-review-round.js";
import type { ParallelReviewConfig } from "../types.js";
import type { Step } from "../../step/types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StepExecutor } from "../../step/executor.js";
import type { StepExecutionResult } from "../../step/commit-orchestrator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "my-change";
const MEMBER_A = "reviewer-alpha";
const MEMBER_B = "reviewer-beta";
const COORDINATOR = "custom-reviewers";

const DECLARED_A = `specrunner/changes/${SLUG}/alpha-result-001.md`;
const DECLARED_B = `specrunner/changes/${SLUG}/beta-result-001.md`;
const UNDECLARED = "src/sneaky.ts";
const STATE_JSON = `specrunner/changes/${SLUG}/state.json`;
const EVENTS_JSONL = `specrunner/changes/${SLUG}/events.jsonl`;
const USAGE_JSON = `specrunner/changes/${SLUG}/usage.json`;

// ---------------------------------------------------------------------------
// Success StepExecutionResult fixture
// ---------------------------------------------------------------------------

function makeApprovedResult(): StepExecutionResult {
  return {
    kind: "success",
    completion: { verdict: "approved", persistToolResult: null },
    completedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    session: null,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 2,
    jobId: "round-git-effects-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "specrunner/changes/my-change/request.md", title: "Test", type: "bug-fix" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: COORDINATOR,
    status: "running",
    branch: "change/my-change",
    history: [],
    error: null,
    steps: {},
    reviewers: [
      { name: MEMBER_A, maxIterations: 3, purpose: "", criteria: "", judgment: "", freeText: "" },
      { name: MEMBER_B, maxIterations: 3, purpose: "", criteria: "", judgment: "", freeText: "" },
    ],
  };
}

function makeStore() {
  return {
    persist: async () => undefined,
    update: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    appendHistory: async (state: JobState) => state,
    appendLineage: async () => undefined,
    appendInterruption: async (state: JobState) => state,
  };
}

/**
 * Build a Step fake that declares writes() returning the given paths.
 */
function makeStepWithWrites(name: string, declaredPaths: string[]): Step {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes: () => declaredPaths.map((path) => ({ path })),
  } as unknown as Step;
}

/**
 * Fake executor that immediately returns an approved StepExecutionResult for each member.
 * Uses produceResult (not execute) — member does not persist state.
 * Also captures the deps.roundOwnsGitEffects flag per member.
 */
function makeFakeExecutor(): {
  executor: StepExecutor;
  getCapturedRoundOwnsGitEffects: (name: string) => boolean | undefined;
} {
  const capturedFlags = new Map<string, boolean | undefined>();

  const executor = {
    produceResult: async (step: Step, _state: JobState, deps: PipelineDeps): Promise<StepExecutionResult> => {
      capturedFlags.set(step.name, deps.roundOwnsGitEffects);
      return makeApprovedResult();
    },
  } as unknown as StepExecutor;

  return {
    executor,
    getCapturedRoundOwnsGitEffects: (name: string) => capturedFlags.get(name),
  };
}

/**
 * Build a runtimeStrategy fake with spied listWorktreeChanges and commitRoundArtifacts.
 * worktreeChanges: string[] → listWorktreeChanges returns {kind:"success", paths}
 * inspectionResult: WorktreeInspectionResult → listWorktreeChanges returns the given DU directly
 */
function makeRuntimeStrategy(opts: {
  worktreeChanges?: string[];
  inspectionResult?: { kind: "success"; paths: string[] } | { kind: "unavailable"; reason: string };
}) {
  const inspectionResult = opts.inspectionResult ?? { kind: "success" as const, paths: opts.worktreeChanges ?? [] };
  return {
    captureHeadSha: vi.fn(async () => "abc123"),
    listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    digestArtifacts: vi.fn(async (refs: { path: string }[]) => refs.map((r) => ({ path: r.path, hash: null as null }))),
    listWorktreeChanges: vi.fn(async (_cwd: string) => inspectionResult),
    commitRoundArtifacts: vi.fn(
      async (
        _stagePaths: string[],
        _cwd: string,
        _branch: string,
        _coordinatorName: string,
        _slug: string,
        _infra: unknown,
      ) => {},
    ),
  };
}

/**
 * Build a ParallelReviewRound with the given fake executor and steps.
 */
function makeRound(fakeExecutor: StepExecutor, steps: Map<string, Step>): ParallelReviewRound {
  const parallelReview: ParallelReviewConfig = {
    coordinator: COORDINATOR,
    members: [MEMBER_A, MEMBER_B],
  };
  return new ParallelReviewRound({
    executor: fakeExecutor,
    steps,
    parallelReview,
    events: new EventBus(),
  });
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    cwd: "/tmp/test",
    slug: SLUG,
    config: {} as never,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "...",
      adr: false,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "test",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) as never,
    storeFactory: () => makeStore() as never,
    roundGitEffects: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: declared-only changes → commitRoundArtifacts called with toStage
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — declared-only changes → scoped commit", () => {
  it("commitRoundArtifacts is called with declared paths when changed ⊆ declared", async () => {
    const runtimeStrategy = makeRuntimeStrategy({ worktreeChanges: [DECLARED_A, DECLARED_B] });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // Should NOT halt
    expect(result.outcome).toBe("approved");

    // commitRoundArtifacts must be called exactly once with both declared paths
    expect(runtimeStrategy.commitRoundArtifacts).toHaveBeenCalledTimes(1);
    const [stagePaths, , , coordinatorArg, slugArg] = runtimeStrategy.commitRoundArtifacts.mock.calls[0]!;
    expect(stagePaths).toContain(DECLARED_A);
    expect(stagePaths).toContain(DECLARED_B);
    // Pipeline-managed paths must not be in stagePaths
    expect(stagePaths).not.toContain(STATE_JSON);
    expect(coordinatorArg).toBe(COORDINATOR);
    expect(slugArg).toBe(SLUG);
  });

  it("commitRoundArtifacts stagePaths = changed ∩ declared (not all declared)", async () => {
    // Only DECLARED_A was actually changed (DECLARED_B was not written by any member)
    const runtimeStrategy = makeRuntimeStrategy({ worktreeChanges: [DECLARED_A] });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A, DECLARED_B])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    const [stagePaths] = runtimeStrategy.commitRoundArtifacts.mock.calls[0]!;
    // Only the actually-changed declared path goes to staging
    expect(stagePaths).toEqual([DECLARED_A]);
    expect(stagePaths).not.toContain(DECLARED_B);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: undeclared changes → round halt, commitRoundArtifacts NOT called
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — undeclared changes → round halt", () => {
  it("outcome is escalation when undeclared path is in changed", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, UNDECLARED],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
  });

  it("commitRoundArtifacts is NOT called when there are offending paths", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, UNDECLARED],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(runtimeStrategy.commitRoundArtifacts).not.toHaveBeenCalled();
  });

  it("state.error records ROUND_NONDECLARED_CHANGE with offending paths", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, UNDECLARED],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.state.error).not.toBeNull();
    expect(result.state.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
    expect(result.state.error?.message).toContain(UNDECLARED);
  });

  it("synthetic coordinator StepRun outcome has escalation verdict when offending", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, UNDECLARED],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    const coordinatorRuns = result.state.steps?.[COORDINATOR] ?? [];
    const lastRun = coordinatorRuns[coordinatorRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("escalation");
    expect(lastRun?.outcome.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: pipeline-managed paths in changed → excluded from stage AND halt
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — pipeline-managed paths excluded from stage and halt", () => {
  it("state.json, events.jsonl, usage.json in changed → not staged, no halt", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, STATE_JSON, EVENTS_JSONL, USAGE_JSON],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // Should NOT halt (pipeline-managed paths are exempt)
    expect(result.outcome).toBe("approved");

    // commitRoundArtifacts should be called with only the declared changed path
    expect(runtimeStrategy.commitRoundArtifacts).toHaveBeenCalledTimes(1);
    const [stagePaths] = runtimeStrategy.commitRoundArtifacts.mock.calls[0]!;
    expect(stagePaths).toEqual([DECLARED_A]);
    expect(stagePaths).not.toContain(STATE_JSON);
    expect(stagePaths).not.toContain(EVENTS_JSONL);
    expect(stagePaths).not.toContain(USAGE_JSON);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: no changes → commitRoundArtifacts NOT called (no-op)
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — no changes → no commit", () => {
  it("commitRoundArtifacts is NOT called when worktree has no changes", async () => {
    const runtimeStrategy = makeRuntimeStrategy({ worktreeChanges: [] });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("approved");
    expect(runtimeStrategy.commitRoundArtifacts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: roundOwnsGitEffects is passed to members
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — members receive roundOwnsGitEffects=true", () => {
  it("all pending members receive roundOwnsGitEffects === true", async () => {
    const runtimeStrategy = makeRuntimeStrategy({ worktreeChanges: [] });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor, getCapturedRoundOwnsGitEffects } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(getCapturedRoundOwnsGitEffects(MEMBER_A)).toBe(true);
    expect(getCapturedRoundOwnsGitEffects(MEMBER_B)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: listWorktreeChanges returns no paths → commitRoundArtifacts not called
//
// D6: all capability methods are required. Capability absence is expressed by
// roundGitEffects being undefined. When roundGitEffects is present but
// listWorktreeChanges returns no changed paths, commitRoundArtifacts is not called
// (nothing to stage). Round completes normally.
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — listWorktreeChanges returns empty → commit skipped", () => {
  it("round completes without error when listWorktreeChanges returns no changed paths", async () => {
    // D6: all capability methods required; roundGitEffects=undefined expresses absence.
    // Here we provide a full capability where listWorktreeChanges returns no paths.
    const minimalRuntimeStrategy = {
      captureHeadSha: vi.fn(async () => "abc123"),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      // listWorktreeChanges returns no changes → commitRoundArtifacts not called
      listWorktreeChanges: vi.fn(async () => ({ kind: "success" as const, paths: [] })),
      commitRoundArtifacts: vi.fn(async () => {}),
      digestArtifacts: vi.fn(async () => []),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: minimalRuntimeStrategy as never,
    }));

    // Round should complete as approved (no changed paths → commit skipped, no halt)
    expect(result.outcome).toBe("approved");
    expect(minimalRuntimeStrategy.commitRoundArtifacts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: listWorktreeChanges returns unavailable → escalation (fail-closed)
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — inspection unavailable → fail-closed escalation", () => {
  it("outcome is escalation when inspection returns unavailable", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      inspectionResult: { kind: "unavailable", reason: "git status exited with code 128" },
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
  });

  it("state.error.code is ROUND_INSPECTION_UNAVAILABLE when inspection unavailable", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      inspectionResult: { kind: "unavailable", reason: "spawn ENOENT" },
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.state.error).not.toBeNull();
    expect(result.state.error?.code).toBe("ROUND_INSPECTION_UNAVAILABLE");
    expect(result.state.error?.message).toContain("spawn ENOENT");
  });

  it("commitRoundArtifacts is NOT called when inspection is unavailable", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      inspectionResult: { kind: "unavailable", reason: "git status exited with code 1" },
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(runtimeStrategy.commitRoundArtifacts).not.toHaveBeenCalled();
  });

  it("synthetic coordinator StepRun has escalation verdict and ROUND_INSPECTION_UNAVAILABLE error", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      inspectionResult: { kind: "unavailable", reason: "git not found" },
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    const coordinatorRuns = result.state.steps?.[COORDINATOR] ?? [];
    const lastRun = coordinatorRuns[coordinatorRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("escalation");
    expect(lastRun?.outcome.error?.code).toBe("ROUND_INSPECTION_UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: inspection escalation keeps members pending (fail-closed on resume)
// ---------------------------------------------------------------------------
// Regression guard for the resume bypass: when the round escalates because the
// worktree could not be inspected (unavailable) or produced undeclared changes
// (offending), member reviewer statuses MUST NOT be persisted as approved. They
// stay pending so resume re-runs the fan-out and re-inspects. Otherwise
// selectPendingMembers would return empty on resume and the all-approved fast
// path would finalize the round as approved without ever passing inspection.

function memberStatus(state: JobState, name: string): string | undefined {
  return state.reviewerStatuses?.find((s) => s.name === name)?.status;
}

describe("ParallelReviewRound git effects — inspection escalation keeps members pending", () => {
  it("member statuses stay pending (not approved) when inspection is unavailable", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      inspectionResult: { kind: "unavailable", reason: "git status exited with code 128" },
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // Members approved in-round, but the worktree could not be inspected → not approved.
    expect(result.outcome).toBe("escalation");
    expect(memberStatus(result.state, MEMBER_A)).toBe("pending");
    expect(memberStatus(result.state, MEMBER_B)).toBe("pending");
  });

  it("member statuses stay pending (not approved) when there are undeclared changes", async () => {
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, UNDECLARED],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
    expect(memberStatus(result.state, MEMBER_A)).toBe("pending");
    expect(memberStatus(result.state, MEMBER_B)).toBe("pending");
  });

  it("member statuses ARE approved when inspection succeeds (positive control)", async () => {
    const runtimeStrategy = makeRuntimeStrategy({ worktreeChanges: [DECLARED_A, DECLARED_B] });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("approved");
    expect(memberStatus(result.state, MEMBER_A)).toBe("approved");
    expect(memberStatus(result.state, MEMBER_B)).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: commitRoundArtifacts push failure → OID recorded in synthesizedCommits
// ---------------------------------------------------------------------------
// Regression guard: if commitRoundArtifacts throws (push failure after commit was
// created), the commit OID must still be appended to synthesizedCommits so that
// egress checks on the next resume do not see EGRESS_UNKNOWN_COMMIT deadlock.
// The round records ROUND_COMMIT_PUSH_FAILED escalation and does NOT re-throw.
//
// HEAD-change semantics: the coordinator captures HEAD before and after
// commitRoundArtifacts. A changed HEAD means a local commit was created (push may
// have failed after the commit). An unchanged HEAD means the error fired before
// any commit (e.g., UNPUSHABLE_PATH_BLOCKED). Only a changed HEAD enters the ledger.

describe("ParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits", () => {
  const BASELINE_OID = "baseline-oid-before-commit";
  const PUSH_FAIL_OID = "push-fail-commit-oid-abc123";

  function makeRuntimeStrategyWithPushFailure() {
    // captureHeadSha: returns BASELINE_OID on the first two calls (invalidation + headSha capture),
    // then PUSH_FAIL_OID once the commit has been created locally (HEAD advanced after commit).
    // The round calls captureHeadSha in this order:
    //   1. baselineCommit capture (step 2, before fan-out)
    //   2. HEAD guard check after fan-out (step 5b) — returns BASELINE_OID (no self-commit)
    //   3. headSha for verdicts (step 6) — returns BASELINE_OID
    //   4. headBeforeCommit capture (new, before commitRoundArtifacts)
    //   5. headAfterCommit capture (new, after commitRoundArtifacts / push failure)
    // We simulate HEAD advancing at call 5 (commit was created before push failed).
    let captureCount = 0;
    return {
      captureHeadSha: vi.fn(async () => {
        captureCount++;
        // Calls 1-4: baseline / fan-out guard / verdict / pre-commit = BASELINE_OID
        // Call 5: after commit (HEAD advanced due to local commit) = PUSH_FAIL_OID
        return captureCount >= 5 ? PUSH_FAIL_OID : BASELINE_OID;
      }),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      listWorktreeChanges: vi.fn(async (_cwd: string) => ({
        kind: "success" as const,
        paths: [DECLARED_A],
      })),
      commitRoundArtifacts: vi.fn(async () => {
        throw Object.assign(new Error("git push origin HEAD:refs/heads/change/... exited with code 1"), { code: "PUSH_FAILED" });
      }),
    };
  }

  it("round does NOT throw when commitRoundArtifacts push fails", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithPushFailure();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    // Must resolve (not throw) — push failure is converted to escalation in state
    await expect(
      round.run(COORDINATOR, makeState(), makeDeps({ roundGitEffects: runtimeStrategy as never })),
    ).resolves.toBeDefined();
  });

  it("round outcome is escalation and error.code is ROUND_COMMIT_PUSH_FAILED", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithPushFailure();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_COMMIT_PUSH_FAILED");
  });

  it("push-fail commit OID is appended to synthesizedCommits (prevents EGRESS_UNKNOWN_COMMIT on resume)", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithPushFailure();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // synthesizedCommits must contain the OID captured after the failed push
    // (HEAD changed from BASELINE_OID to PUSH_FAIL_OID, so commit was made locally)
    expect(result.state.synthesizedCommits).toContain(PUSH_FAIL_OID);
    // The pre-commit baseline OID must NOT be in the ledger
    expect(result.state.synthesizedCommits).not.toContain(BASELINE_OID);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: commitRoundArtifacts pre-commit failure (UNPUSHABLE_PATH_BLOCKED)
// → HEAD unchanged → pre-existing HEAD NOT recorded in synthesizedCommits
// ---------------------------------------------------------------------------
// Regression guard: when commitRoundArtifacts throws before creating any local
// commit (e.g., Layer 2 backstop fires before git add/commit), HEAD does not
// advance. Recording the pre-existing HEAD as a synthesized commit would corrupt
// the egress authorization ledger. The round must leave synthesizedCommits unchanged.

describe("ParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded", () => {
  const BASELINE_OID = "baseline-oid-before-backstop";

  function makeRuntimeStrategyWithBackstopRejection() {
    // captureHeadSha always returns BASELINE_OID — HEAD never changes because
    // UNPUSHABLE_PATH_BLOCKED fires before any git add/commit.
    return {
      captureHeadSha: vi.fn(async () => BASELINE_OID),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      listWorktreeChanges: vi.fn(async (_cwd: string) => ({
        kind: "success" as const,
        paths: [DECLARED_A],
      })),
      // Throws UNPUSHABLE_PATH_BLOCKED — no commit was created
      commitRoundArtifacts: vi.fn(async () => {
        throw Object.assign(
          new Error("Unpushable path blocked: .github/workflows/ci.yml matches .github/workflows/**"),
          { code: "UNPUSHABLE_PATH_BLOCKED" },
        );
      }),
    };
  }

  it("round does NOT throw when backstop rejects before commit", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithBackstopRejection();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await expect(
      round.run(COORDINATOR, makeState(), makeDeps({ roundGitEffects: runtimeStrategy as never })),
    ).resolves.toBeDefined();
  });

  it("backstop rejection: outcome is escalation with ROUND_COMMIT_PUSH_FAILED", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithBackstopRejection();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_COMMIT_PUSH_FAILED");
  });

  it("backstop rejection: pre-existing HEAD is NOT recorded in synthesizedCommits (ledger integrity)", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithBackstopRejection();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // synthesizedCommits must NOT contain the pre-existing HEAD — no commit was created.
    // Recording it would falsely authorize the pre-existing commits for future egress checks.
    expect(result.state.synthesizedCommits ?? []).not.toContain(BASELINE_OID);
  });
});

// ---------------------------------------------------------------------------
// Scenario 11: pre-commit HEAD capture returns null + backstop rejection
// → evidence-unavailable: existing HEAD OID must NOT enter synthesizedCommits
// ---------------------------------------------------------------------------
// Regression guard for finding: "[HIGH] An unavailable pre-commit HEAD is still
// interpreted as proof that a round commit was created".
//
// When captureHeadSha returns null before commitRoundArtifacts is called, and then
// returns a valid OID after the (rejected) call, the comparison
//   headAfterCommit !== headBeforeCommit
// is vacuously true (someOID !== null), which would incorrectly record the existing
// HEAD as a newly synthesized commit, corrupting the egress authorization ledger.
//
// The fix: require BOTH headBeforeCommit AND headAfterCommit to be non-null before
// inferring HEAD advancement. If headBeforeCommit is null, escalate with evidence-
// unavailable reason and do NOT append any OID to synthesizedCommits.

describe("ParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable", () => {
  const EXISTING_OID = "existing-head-oid-before-null-capture";

  function makeRuntimeStrategyWithNullPreCapture() {
    // captureHeadSha call sequence:
    //   Call 1 (baselineCommit): EXISTING_OID
    //   Call 2 (headAfterFanOut guard): EXISTING_OID (no self-commit)
    //   Call 3 (headSha for verdict/approvedAtCommit): EXISTING_OID
    //   Call 4 (headBeforeCommit): null ← pre-commit capture fails transiently
    //   Call 5 (headAfterCommit): EXISTING_OID (HEAD unchanged; backstop threw before commit)
    let captureCount = 0;
    return {
      captureHeadSha: vi.fn(async () => {
        captureCount++;
        if (captureCount === 4) return null; // pre-commit capture unavailable
        return EXISTING_OID;
      }),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      listWorktreeChanges: vi.fn(async (_cwd: string) => ({
        kind: "success" as const,
        paths: [DECLARED_A],
      })),
      // Backstop rejection: throws before creating any commit
      commitRoundArtifacts: vi.fn(async () => {
        throw Object.assign(
          new Error("Unpushable path blocked: .github/workflows/ci.yml matches .github/workflows/**"),
          { code: "UNPUSHABLE_PATH_BLOCKED" },
        );
      }),
    };
  }

  it("round does NOT throw when pre-commit capture is null and backstop rejects", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithNullPreCapture();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await expect(
      round.run(COORDINATOR, makeState(), makeDeps({ roundGitEffects: runtimeStrategy as never })),
    ).resolves.toBeDefined();
  });

  it("null pre-observation + backstop rejection: outcome is escalation", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithNullPreCapture();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_COMMIT_PUSH_FAILED");
  });

  it("null pre-observation + backstop rejection: existing HEAD OID NOT in synthesizedCommits (ledger integrity)", async () => {
    // Core invariant: when headBeforeCommit is null, the post-commit capture returning
    // the existing HEAD must NOT be appended to synthesizedCommits. The null pre-observation
    // means we cannot infer advancement — recording the existing OID would falsely authorize
    // a pre-existing commit through the egress boundary.
    const runtimeStrategy = makeRuntimeStrategyWithNullPreCapture();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // The existing HEAD OID must NOT appear in synthesizedCommits regardless of
    // what headAfterCommit returns — no commit was created (backstop rejected).
    expect(result.state.synthesizedCommits ?? []).not.toContain(EXISTING_OID);
  });

  it("null pre-observation + backstop rejection: hint reflects evidence-unavailable (not backstop hint)", async () => {
    const runtimeStrategy = makeRuntimeStrategyWithNullPreCapture();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    const coordinatorRun = result.state.steps?.[COORDINATOR]?.at(-1);
    // The hint must describe the evidence-unavailable condition, not the backstop rejection
    // (which would be misleading since we cannot actually confirm no commit was created).
    expect(coordinatorRun?.outcome.error?.hint).toContain("null");
  });
});

// ---------------------------------------------------------------------------
// Scenario 12: both HEAD observations non-null and different → OID IS recorded
// (positive control — existing Scenario 9 behavior maintained)
// ---------------------------------------------------------------------------
// Confirms that the null-guard fix does NOT break the normal push-failure path
// where both headBeforeCommit and headAfterCommit are available and HEAD advanced.

describe("ParallelReviewRound git effects — both HEAD observations non-null, different → OID recorded (positive control)", () => {
  const BASELINE_OID = "baseline-oid-positive-control";
  const COMMIT_OID = "new-commit-oid-positive-control";

  function makeRuntimeStrategyBothNonNull() {
    // captureHeadSha call sequence:
    //   Call 1 (baselineCommit): BASELINE_OID
    //   Call 2 (headAfterFanOut guard): BASELINE_OID (no self-commit)
    //   Call 3 (headSha for verdict/approvedAtCommit): BASELINE_OID
    //   Call 4 (headBeforeCommit): BASELINE_OID (non-null, normal)
    //   Call 5 (headAfterCommit): COMMIT_OID (HEAD advanced — commit was created)
    let captureCount = 0;
    return {
      captureHeadSha: vi.fn(async () => {
        captureCount++;
        return captureCount >= 5 ? COMMIT_OID : BASELINE_OID;
      }),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      listWorktreeChanges: vi.fn(async (_cwd: string) => ({
        kind: "success" as const,
        paths: [DECLARED_A],
      })),
      // Push fails after commit was created locally
      commitRoundArtifacts: vi.fn(async () => {
        throw Object.assign(new Error("git push exited with code 1"), { code: "PUSH_FAILED" });
      }),
    };
  }

  it("when both HEAD observations are non-null and differ, commit OID IS recorded in synthesizedCommits", async () => {
    const runtimeStrategy = makeRuntimeStrategyBothNonNull();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    // The new commit OID must be in synthesizedCommits (commit was created locally)
    expect(result.state.synthesizedCommits).toContain(COMMIT_OID);
    // The baseline OID must NOT appear (it was not a new commit)
    expect(result.state.synthesizedCommits).not.toContain(BASELINE_OID);
  });

  it("when both HEAD observations are non-null and differ, outcome is escalation (push failed)", async () => {
    const runtimeStrategy = makeRuntimeStrategyBothNonNull();
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
    }));

    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_COMMIT_PUSH_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Scenario 13: stagingExcludePatterns → excluded path does not trigger
// ROUND_NONDECLARED_CHANGE (Finding 1 regression guard)
// ---------------------------------------------------------------------------
// When a guarded step generates an excluded untracked file (e.g., a CI workflow
// updated by an implementer), the parallel-review coordinator must NOT classify it
// as an offending non-declared change. The excluded path is filtered from
// inspection.paths before partitionRoundChanges is called.

describe("ParallelReviewRound git effects — stagingExcludePatterns prevents ROUND_NONDECLARED_CHANGE", () => {
  const EXCLUDED_PATH = ".github/workflows/ci.yml";
  const EXCLUDE_PATTERN = ".github/workflows/**";

  it("excluded path in worktreeChanges + stagingExcludePatterns → outcome is approved (not escalation)", async () => {
    // GIVEN: worktree has a declared path AND an excluded path
    // AND: config has stagingExcludePatterns that matches the excluded path
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, EXCLUDED_PATH],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    // WHEN: round.run with config that excludes the path
    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      config: { pipeline: { stagingExcludePatterns: [EXCLUDE_PATTERN] } } as never,
    }));

    // THEN: round completes as approved — excluded path is not treated as offending
    expect(result.outcome).toBe("approved");
    expect(result.state.error).toBeNull();
  });

  it("commitRoundArtifacts called with declared paths only (excluded path NOT staged)", async () => {
    // GIVEN: same setup as above
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, EXCLUDED_PATH],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      config: { pipeline: { stagingExcludePatterns: [EXCLUDE_PATTERN] } } as never,
    }));

    // THEN: commitRoundArtifacts called with only the declared path (excluded path filtered out)
    expect(runtimeStrategy.commitRoundArtifacts).toHaveBeenCalledTimes(1);
    const [stagePaths] = runtimeStrategy.commitRoundArtifacts.mock.calls[0]!;
    expect(stagePaths).toContain(DECLARED_A);
    expect(stagePaths).not.toContain(EXCLUDED_PATH);
  });

  it("regression guard: same excluded path WITHOUT stagingExcludePatterns → escalation (ROUND_NONDECLARED_CHANGE)", async () => {
    // GIVEN: worktree has a declared path AND an undeclared path
    // AND: config has NO stagingExcludePatterns
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, EXCLUDED_PATH],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    // WHEN: round.run with NO exclusion config
    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      // config has no stagingExcludePatterns
    }));

    // THEN: round escalates — the path is undeclared and no exclusion applies
    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
    expect(result.state.error?.message).toContain(EXCLUDED_PATH);
  });

  // ---------------------------------------------------------------------------
  // Regression guard: protected canon path matching exclusion pattern must still
  // trigger ROUND_NONDECLARED_CHANGE (Finding: parallel-review exclusion ordering)
  // ---------------------------------------------------------------------------
  // Before the fix, applyStagingExclusions filtered ALL paths including protected
  // canon paths. A reviewer that modifies spec.md (and the pattern covers it) would
  // bypass the partition check entirely. After the fix, canon paths bypass exclusion
  // and always reach partitionRoundChanges.

  it("regression guard: protected canon path in worktreeChanges + matching exclusion → still escalation (ROUND_NONDECLARED_CHANGE)", async () => {
    // GIVEN: worktree has a declared path AND a protected canon path (spec.md)
    // AND: config has stagingExcludePatterns that matches the canon path
    const CANON_PATH = `specrunner/changes/${SLUG}/spec.md`;
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, CANON_PATH],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    // WHEN: round.run with stagingExcludePatterns that matches spec.md
    // (specrunner/changes/** would match spec.md — but spec.md must NOT be excluded
    //  from the offending-path check)
    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      config: { pipeline: { stagingExcludePatterns: ["specrunner/changes/**"] } } as never,
    }));

    // THEN: round escalates — spec.md is a protected canon path and must not be
    // silently excluded from the partition check regardless of exclusion patterns
    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
    expect(result.state.error?.message).toContain(CANON_PATH);
  });

  // ---------------------------------------------------------------------------
  // Regression guard: undeclared judge artifact matching exclusion pattern must
  // still trigger ROUND_NONDECLARED_CHANGE (iter-3 F-001 fix).
  // ---------------------------------------------------------------------------
  // Before the fix, the bypass set was limited to protectedCanonPaths. An undeclared
  // review-feedback-*.md / *-result-*.md matching an exclusion pattern would be
  // silently filtered from inspection.paths before partitionRoundChanges, allowing
  // tampered review evidence to bypass ROUND_NONDECLARED_CHANGE enforcement.
  //
  // After the fix, findWriteScopeViolations predicate (forbidden ∪ isJudgeArtifact,
  // !declared) is used as the bypass set, covering undeclared judge artifacts too.

  it("regression guard: undeclared review-feedback-*.md matching 'specrunner/changes/**' exclusion → still ROUND_NONDECLARED_CHANGE", async () => {
    // GIVEN: worktree has a declared path AND an undeclared review-feedback artifact
    // AND: config has stagingExcludePatterns: ["specrunner/changes/**"] that matches both
    // AND: review-feedback-001.md is NOT declared by any round member
    const REVIEW_FEEDBACK = `specrunner/changes/${SLUG}/review-feedback-001.md`;
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, REVIEW_FEEDBACK],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    // WHEN: round.run with stagingExcludePatterns that matches the review-feedback path
    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      config: { pipeline: { stagingExcludePatterns: ["specrunner/changes/**"] } } as never,
    }));

    // THEN: round escalates — undeclared judge artifact bypasses exclusion filter
    // and is detected as offending by partitionRoundChanges
    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
    expect(result.state.error?.message).toContain(REVIEW_FEEDBACK);
  });

  it("regression guard: undeclared *-result-*.md matching 'specrunner/changes/**' exclusion → still ROUND_NONDECLARED_CHANGE", async () => {
    // GIVEN: worktree has a declared path AND an undeclared *-result-*.md artifact
    // AND: config has stagingExcludePatterns: ["specrunner/changes/**"]
    // AND: code-review-result-001.md is NOT declared by any round member
    const UNDECLARED_RESULT = `specrunner/changes/${SLUG}/code-review-result-001.md`;
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A, UNDECLARED_RESULT],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      config: { pipeline: { stagingExcludePatterns: ["specrunner/changes/**"] } } as never,
    }));

    expect(result.outcome).toBe("escalation");
    expect(result.state.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
    expect(result.state.error?.message).toContain(UNDECLARED_RESULT);
  });

  it("declared *-result-*.md bypasses exclusion and IS committed (positive control — member must write its declared result)", async () => {
    // GIVEN: worktree has DECLARED_A (a *-result-*.md declared by MEMBER_A)
    // AND: config has stagingExcludePatterns: ["specrunner/changes/**"]
    // DECLARED_A = "specrunner/changes/my-change/alpha-result-001.md" (is a judge artifact)
    //
    // REGRESSION GUARD (F-002 / iter-4 fix):
    // findWriteScopeViolations uses !declared in its predicate, so DECLARED_A is NOT in
    // potentialViolations. Without the declaredSet bypass, DECLARED_A would be subject to
    // applyStagingExclusions: "specrunner/changes/**" matches → DECLARED_A filtered from
    // filteredPaths → partitionRoundChanges sees nothing → toStage=[] → NOT committed.
    // The file then remains in the worktree and is flagged as an undeclared judge artifact
    // by the downstream step, triggering WRITE_SCOPE_VIOLATION.
    //
    // After the fix, declaredSet paths bypass exclusion, so DECLARED_A always reaches
    // partitionRoundChanges → toStage=[DECLARED_A] → commitRoundArtifacts is called.
    const runtimeStrategy = makeRuntimeStrategy({
      worktreeChanges: [DECLARED_A],
    });
    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    // WHEN: round.run with stagingExcludePatterns matching the declared result file
    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      roundGitEffects: runtimeStrategy as never,
      config: { pipeline: { stagingExcludePatterns: ["specrunner/changes/**"] } } as never,
    }));

    // THEN: round completes as approved — declared result file is not offending
    expect(result.outcome).toBe("approved");
    expect(result.state.error).toBeNull();

    // AND: commitRoundArtifacts IS called with DECLARED_A (bypasses exclusion → committed)
    // This is the critical invariant: declared round evidence must be committed regardless
    // of stagingExcludePatterns, or the downstream step will see it as an undeclared judge
    // artifact and trigger WRITE_SCOPE_VIOLATION.
    expect(runtimeStrategy.commitRoundArtifacts).toHaveBeenCalledTimes(1);
    const [stagePaths] = runtimeStrategy.commitRoundArtifacts.mock.calls[0]!;
    expect(stagePaths).toContain(DECLARED_A);
  });
});
