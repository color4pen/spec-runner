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
 *   5. Existing test fakes without listWorktreeChanges continue to work (skip git ops).
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
    runtimeStrategy: undefined,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
    }));

    expect(getCapturedRoundOwnsGitEffects(MEMBER_A)).toBe(true);
    expect(getCapturedRoundOwnsGitEffects(MEMBER_B)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: test fake without listWorktreeChanges → skip git ops (regression)
// ---------------------------------------------------------------------------

describe("ParallelReviewRound git effects — fake without listWorktreeChanges still works", () => {
  it("round completes without error when runtimeStrategy has no listWorktreeChanges", async () => {
    // Simulate the existing test pattern where the fake has no listWorktreeChanges
    const minimalRuntimeStrategy = {
      captureHeadSha: vi.fn(async () => "abc123"),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      // No listWorktreeChanges — omitted intentionally
    };

    const steps = new Map<string, Step>([
      [MEMBER_A, makeStepWithWrites(MEMBER_A, [DECLARED_A])],
      [MEMBER_B, makeStepWithWrites(MEMBER_B, [DECLARED_B])],
    ]);
    const { executor } = makeFakeExecutor();
    const round = makeRound(executor, steps);

    const result = await round.run(COORDINATOR, makeState(), makeDeps({
      runtimeStrategy: minimalRuntimeStrategy as never,
    }));

    // Round should complete as approved (git ops skipped, no halt)
    expect(result.outcome).toBe("approved");
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
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

describe("ParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits", () => {
  const PUSH_FAIL_OID = "push-fail-commit-oid-abc123";

  function makeRuntimeStrategyWithPushFailure() {
    return {
      captureHeadSha: vi.fn(async () => PUSH_FAIL_OID),
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
      round.run(COORDINATOR, makeState(), makeDeps({ runtimeStrategy: runtimeStrategy as never })),
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
      runtimeStrategy: runtimeStrategy as never,
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
      runtimeStrategy: runtimeStrategy as never,
    }));

    // synthesizedCommits must contain the OID captured after the failed push
    expect(result.state.synthesizedCommits).toContain(PUSH_FAIL_OID);
  });
});
