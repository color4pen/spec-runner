/**
 * Contract and behavior tests for round invalidation source-scoped filtering.
 *
 * T-03 (approvedAtCommit contract): fixes the invariant that approvedAtCommit
 *   is set to the reviewed source revision (HEAD before commitRoundArtifacts),
 *   not the round-commit revision (HEAD after commitRoundArtifacts).
 *
 * T-04 (source-scoped invalidation behavior): verifies that the invalidation
 *   diff excludes pipeline-managed change folder paths (specrunner/changes/...)
 *   before evaluating reviewer activation. Scenarios:
 *     Req 2 — change-folder-only diff: broad-activation reviewer is NOT re-run.
 *     Req 3 — source path touched: path-constrained reviewer IS re-run.
 *     Req 4 — always-activate reviewer: always re-run even with change-folder-only diff.
 *
 * T-04 (approval-revision-binding re-anchor): verifies the D5 re-anchor logic.
 *     TC-011 — path-untouched member: when a source path changes but does not touch
 *       the member's activation paths, the coordinator re-anchors approvedAtCommit to
 *       baselineCommit, keeping the member in the fast path (skip maintained).
 *     TC-012 — evidence unavailable: when listChangedFiles returns unavailable, no
 *       re-anchor occurs. approvedAtCommit stays mismatched, member is re-run
 *       (fail-closed per D6 / req 6).
 *
 * All tests use fake executor + fake runtimeStrategy. No filesystem, git, or network I/O.
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
const COORDINATOR = "custom-reviewers";
const MEMBER_A = "reviewer-alpha";

// Change folder path (pipeline-managed, should be excluded from invalidation diff)
const CHANGE_FOLDER_PATH = `specrunner/changes/${SLUG}/alpha-result-001.md`;

// True source path (should remain in invalidation diff)
const SOURCE_PATH = "src/foo.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Make a minimal Step for MEMBER_A that declares the given writes. */
function makeStep(name: string, declaredPaths: string[] = []): Step {
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

/** Minimal spy store. */
function makeStore() {
  return {
    persist: vi.fn(async () => undefined),
    update: vi.fn(async (s: JobState) => s),
    fail: vi.fn(async (s: JobState) => s),
    appendHistory: vi.fn(async (s: JobState) => s),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async () => undefined),
  };
}

/** Make a base JobState with a single pending member. */
function makeBaseState(): JobState {
  return {
    version: 2,
    jobId: "invalidation-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type: "bug-fix",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: COORDINATOR,
    status: "running",
    branch: `change/${SLUG}`,
    history: [],
    error: null,
    steps: {},
    reviewers: [
      {
        name: MEMBER_A,
        maxIterations: 3,
        purpose: "",
        criteria: "",
        judgment: "",
        freeText: "",
      },
    ],
  };
}

/** Make a JobState with MEMBER_A pre-approved (for invalidation re-run checks). */
function makeApprovedState(activationPaths: string[] | undefined): JobState {
  return {
    ...makeBaseState(),
    reviewerStatuses: [
      {
        name: MEMBER_A,
        status: "approved",
        approvedAtCommit: "sha-before",
        activationPaths,
        invalidatedByCommit: null,
      },
    ],
  };
}

/** Build PipelineDeps with a controlled runtimeStrategy. */
function makeDeps(
  store: ReturnType<typeof makeStore>,
  runtimeStrategy: PipelineDeps["runtimeStrategy"],
): PipelineDeps {
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
    storeFactory: () => store as never,
    runtimeStrategy,
  };
}

/** Make a ParallelReviewRound with a single member (MEMBER_A). */
function makeRound(fakeExecutor: StepExecutor, memberStep: Step): ParallelReviewRound {
  const parallelReview: ParallelReviewConfig = {
    coordinator: COORDINATOR,
    members: [MEMBER_A],
  };
  return new ParallelReviewRound({
    executor: fakeExecutor,
    steps: new Map([[MEMBER_A, memberStep]]),
    parallelReview,
    events: new EventBus(),
  });
}

/** Executor that returns a fixed verdict for MEMBER_A. */
function makeFixedExecutor(verdict: "approved" | "needs-fix" | "escalation"): {
  executor: StepExecutor;
  wasCalled: () => boolean;
} {
  const spy = vi.fn(async (_step: Step): Promise<StepExecutionResult> => ({
    kind: "success",
    completion: { verdict, persistToolResult: null },
    completedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    session: null,
  }));

  return {
    executor: { produceResult: spy } as unknown as StepExecutor,
    wasCalled: () => spy.mock.calls.length > 0,
  };
}

// ---------------------------------------------------------------------------
// T-03: approvedAtCommit is set to the reviewed source revision
//
// Contract: approvedAtCommit = HEAD captured BEFORE commitRoundArtifacts runs.
// If the capture location is moved to after commitRoundArtifacts (regression),
// this test will fail because approvedAtCommit would equal "round-commit-sha".
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — approvedAtCommit is reviewed source revision (T-03)", () => {
  it("approvedAtCommit is set to HEAD before commitRoundArtifacts (source revision, not round-commit revision)", async () => {
    // Stateful fake: head starts at "source-sha", advances to "round-commit-sha"
    // only when commitRoundArtifacts is called.
    let currentHead = "source-sha";
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => currentHead),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      // listWorktreeChanges returns the declared output so commitRoundArtifacts is called
      listWorktreeChanges: vi.fn(async () => ({
        kind: "success" as const,
        paths: [CHANGE_FOLDER_PATH],
      })),
      commitRoundArtifacts: vi.fn(async () => {
        // Simulate HEAD advancing when the round's findings are committed
        currentHead = "round-commit-sha";
      }),
    };

    // MEMBER_A declares CHANGE_FOLDER_PATH as output (so toStage is non-empty)
    const memberStep = makeStep(MEMBER_A, [CHANGE_FOLDER_PATH]);
    const { executor } = makeFixedExecutor("approved");
    const round = makeRound(executor, memberStep);

    const { state } = await round.run(
      COORDINATOR,
      makeBaseState(),
      makeDeps(store, runtimeStrategy as never),
    );

    // commitRoundArtifacts must have been called (head advanced, making the test meaningful)
    expect(runtimeStrategy.commitRoundArtifacts).toHaveBeenCalledTimes(1);
    expect(currentHead).toBe("round-commit-sha");

    // approvedAtCommit must be the PRE-commit source revision, not the round-commit revision
    const memberStatus = state.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
    expect(memberStatus?.approvedAtCommit).toBe("source-sha");
    expect(memberStatus?.approvedAtCommit).not.toBe("round-commit-sha");
  });
});

// ---------------------------------------------------------------------------
// T-04: source-scoped invalidation behavior
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Req 2a: change-folder-pipeline-output-only diff, broad-activation ["specrunner/changes/**"]
// CHANGE_FOLDER_PATH is a pipeline output (alpha-result-001.md), NOT a canonical document.
// After excludePipelineManagedChangePaths, pipeline outputs are excluded → sourceTouched is
// empty → not activated → NOT re-run.
// Note: if CHANGE_FOLDER_PATH were a canonical document (e.g. design.md under the change
// folder), excludePipelineManagedChangePaths would PRESERVE it in sourceTouched → activated
// → re-run (new canon-binding behavior enforced by TC-005 / TC-016).
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — pipeline-output-only diff does not invalidate broad-activation reviewer (T-04 Req 2a)", () => {
  it("approved member with activationPaths ['specrunner/changes/**'] stays approved when only change folder paths changed", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      // listChangedFiles returns ONLY a change folder path
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    const { outcome } = await round.run(
      COORDINATOR,
      makeApprovedState(["specrunner/changes/**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    // All-approved fast path: MEMBER_A was NOT invalidated → no fan-out → executor NOT called
    expect(wasCalled()).toBe(false);
    expect(outcome).toBe("approved");
  });

  it("result state shows MEMBER_A still approved when change-folder-only diff with broad activation", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    const { state } = await round.run(
      COORDINATOR,
      makeApprovedState(["specrunner/changes/**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    const memberStatus = state.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Req 2b: change-folder-path-only diff, even broader ["**"] activation
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — change-folder-only diff does not invalidate ** reviewer (T-04 Req 2b)", () => {
  it("approved member with activationPaths ['**'] stays approved when only change folder paths changed", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    const { outcome } = await round.run(
      COORDINATOR,
      makeApprovedState(["**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    // All-approved fast path: executor NOT called
    expect(wasCalled()).toBe(false);
    expect(outcome).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Req 3: source path touched → path-constrained reviewer IS re-run
// listChangedFiles returns both source path and change folder path.
// After excludeChangeFolderPaths, sourceTouched = ["src/foo.ts"] → matches "src/**"
// → member invalidated → pending → executor IS called.
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — source path change invalidates path-constrained reviewer (T-04 Req 3)", () => {
  it("approved member with activationPaths ['src/**'] is re-run when src/foo.ts is in the diff", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      // listChangedFiles returns source path + change folder path
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [SOURCE_PATH, CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    await round.run(
      COORDINATOR,
      makeApprovedState(["src/**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    // Member was invalidated → fan-out → executor IS called
    expect(wasCalled()).toBe(true);
  });

  it("member is invalidated (pending) and outcome is needs-fix after source path change", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [SOURCE_PATH, CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    const { outcome } = await round.run(
      COORDINATOR,
      makeApprovedState(["src/**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    // Executor returns needs-fix → aggregate needs-fix
    expect(outcome).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// Req 4 (legacy path — no digestArtifacts): always-activate reviewer (activationPaths
// undefined) is always invalidated when currentCanonHash === undefined.
//
// In this path (runtimeStrategy.digestArtifacts absent), the canon-binding guard at
// parallel-review-round.ts:175 does NOT fire because the condition requires
// currentCanonHash !== undefined. computeInvalidations runs as before, and
// always-activate reviewers (activationPaths=undefined) are re-run regardless of
// whether sourceTouched is empty. Backward-compat with pre-canon-binding callers.
//
// Real runtime (digestArtifacts present) with pipeline-output-only diff and no canonical
// doc change: currentCanonHash is defined → guard fires → always-activate is NOT
// invalidated (skip). See "real-runtime path" describe block below for that test.
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — always-activate reviewer is re-run in legacy path without digestArtifacts (T-04 Req 4)", () => {
  it("approved always-activate reviewer (activationPaths undefined) is re-run when only change folder paths changed", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      // listChangedFiles returns ONLY a change folder path (sourceTouched = [] after filter)
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    await round.run(
      COORDINATOR,
      // activationPaths: undefined → always-activate
      makeApprovedState(undefined),
      makeDeps(store, runtimeStrategy as never),
    );

    // Legacy path (no digestArtifacts): guard does not fire → computeInvalidations runs
    // → always-activate triggers invalidation even with empty sourceTouched → executor IS called
    expect(wasCalled()).toBe(true);
  });

  it("always-activate reviewer outcome is needs-fix after invalidation with change-folder-only diff", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    const { outcome } = await round.run(
      COORDINATOR,
      makeApprovedState(undefined),
      makeDeps(store, runtimeStrategy as never),
    );

    expect(outcome).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// Req 4 (real-runtime path — digestArtifacts present): always-activate reviewer
// (activationPaths undefined) is NOT re-run when digestArtifacts is available and
// only pipeline outputs changed (no canonical doc change, canonHash matches).
//
// Flow: listChangedFiles returns CHANGE_FOLDER_PATH (pipeline output) →
// excludePipelineManagedChangePaths filters it out → sourceTouched = [] →
// currentCanonHash defined (digestArtifacts present) → guard fires at
// parallel-review-round.ts:175 → skip computeInvalidations → re-anchor
// approvedAtCommit to baselineCommit → selectPendingMembers: revision matches,
// canonHash matches → executor NOT called.
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — always-activate reviewer skips in real-runtime path with pipeline-output-only diff (T-04 Req 4 real-runtime)", () => {
  // The canon hash computed from digestArtifacts returning one non-null hash.
  // computeCanonHash([{ path: "specrunner/changes/my-change/request.md", hash: "abc123" }])
  // → "specrunner/changes/my-change/request.md:abc123"
  const CANON_HASH = `specrunner/changes/${SLUG}/request.md:abc123`;

  it("approved always-activate reviewer stays approved when digestArtifacts present and only pipeline outputs changed", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      // listChangedFiles returns ONLY a pipeline output (NOT a canonical doc)
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [CHANGE_FOLDER_PATH] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      // digestArtifacts present (real runtime): returns hash matching state.canonHash
      digestArtifacts: vi.fn(async () => [
        { path: `specrunner/changes/${SLUG}/request.md`, hash: "abc123" },
      ]),
    };

    // Always-activate reviewer pre-approved with canon hash bound to CANON_HASH.
    // approvedAtCommit intentionally differs from captureHeadSha ("sha-before" ≠ "current-sha")
    // to ensure re-anchor fires; after re-anchor, revision and canonHash both match → skip.
    const state: JobState = {
      ...makeBaseState(),
      reviewerStatuses: [
        {
          name: MEMBER_A,
          status: "approved",
          approvedAtCommit: "sha-before",
          activationPaths: undefined, // always-activate
          invalidatedByCommit: null,
          canonHash: CANON_HASH,
        },
      ],
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    const { outcome } = await round.run(
      COORDINATOR,
      state,
      makeDeps(store, runtimeStrategy as never),
    );

    // Real runtime: guard fires (sourceTouched=[], currentCanonHash defined) →
    // re-anchor approvedAtCommit to "current-sha" → selectPendingMembers: skip →
    // executor NOT called → all-approved fast path → outcome "approved"
    expect(wasCalled()).toBe(false);
    expect(outcome).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-011 (T-04 approval-revision-binding re-anchor):
// path-untouched member is re-anchored to baselineCommit, skip maintained.
//
// When listChangedFiles returns positive evidence (kind === "success") and the
// changed source path does NOT match the member's activation paths, the member
// is NOT invalidated. The coordinator re-anchors approvedAtCommit to
// baselineCommit, so that selectPendingMembers can still exclude the member
// (skip maintained). The executor is NOT called (all-approved fast path).
//
// Without re-anchor: approvedAtCommit ("sha-before") ≠ baselineCommit
// ("current-sha") → selectPendingMembers would put member back to pending →
// unnecessary re-run (regresses the 2026-07-15-round-invalidation-source-scoped
// optimisation). With re-anchor: both match → skip.
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — path-untouched member is re-anchored, skip maintained (TC-011)", () => {
  it("re-anchors approvedAtCommit to baselineCommit when source path change does not touch activation paths", async () => {
    const store = makeStore();

    // captureHeadSha returns a NEW sha different from the member's approvedAtCommit
    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      // Changed file is in src/other/, NOT in src/specific/ (member's activation path)
      listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: ["src/other/bar.ts"] })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("needs-fix");
    const round = makeRound(executor, memberStep);

    // Member A approved at "sha-before", activation path ["src/specific/**"]
    // Changed file "src/other/bar.ts" does not match ["src/specific/**"] → not invalidated
    const { outcome, state } = await round.run(
      COORDINATOR,
      makeApprovedState(["src/specific/**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    // Path not touched → not invalidated → re-anchor → all-approved fast path
    expect(wasCalled()).toBe(false);
    expect(outcome).toBe("approved");

    // approvedAtCommit must be re-anchored to baselineCommit ("current-sha")
    // so that the next round / resume does not put the member back to pending
    const memberStatus = state.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
    expect(memberStatus?.approvedAtCommit).toBe("current-sha");
  });
});

// ---------------------------------------------------------------------------
// TC-012 (T-04 approval-revision-binding re-anchor):
// evidence unavailable → no re-anchor → fail-closed.
//
// When listChangedFiles returns unavailable (kind !== "success"), the
// coordinator does NOT re-anchor approvedAtCommit. Because approvedAtCommit
// ("sha-before") ≠ baselineCommit ("current-sha"), selectPendingMembers
// returns the member as pending. The member IS re-run (fail-closed per D6).
//
// This preserves the invariant: "承認の有効性が判定不能な場合は再実行に倒す"
// (approval validity cannot be confirmed without evidence → re-run).
// ---------------------------------------------------------------------------

describe("ParallelReviewRound — evidence unavailable: no re-anchor, member is re-run (TC-012)", () => {
  it("does not re-anchor and re-runs member when listChangedFiles returns unavailable", async () => {
    const store = makeStore();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "current-sha"),
      // listChangedFiles returns unavailable (git error)
      listChangedFiles: vi.fn(async () => ({ kind: "unavailable" as const, reason: "git spawn failed" })),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    };

    const memberStep = makeStep(MEMBER_A);
    const { executor, wasCalled } = makeFixedExecutor("approved");
    const round = makeRound(executor, memberStep);

    // Member A approved at "sha-before", baselineCommit = "current-sha"
    // No re-anchor → approvedAtCommit stays "sha-before" → mismatch → pending → re-run
    await round.run(
      COORDINATOR,
      makeApprovedState(["src/specific/**"]),
      makeDeps(store, runtimeStrategy as never),
    );

    // Evidence unavailable → no re-anchor → fail-closed → member is re-run
    expect(wasCalled()).toBe(true);
  });
});
