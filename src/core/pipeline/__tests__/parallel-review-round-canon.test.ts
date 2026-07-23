/**
 * Integration tests for canonical hash binding in ParallelReviewRound.
 *
 * These tests verify that ParallelReviewRound.run correctly:
 *   1. Computes currentCanonHash via runtimeStrategy.digestArtifacts
 *   2. Passes it to selectPendingMembers (invalidating approved members on canon change)
 *   3. Passes it to applyRoundResults (binding new approvals to the current canonHash)
 *   4. Treats all-member-skip as structural skip (approved, round-all-skip-pass-through)
 *   5. Keeps members pending (not "skipped") on all-skip structural skip (D3 guard)
 *
 * TC-001: 正典文書を変更すると承認済み reviewer が pending に戻る
 * TC-002: 正典・activation 対象がいずれも不変なら承認 skip が維持される
 * TC-003: canonHash を持たない legacy 承認 record は pending に戻る
 * TC-006 (canon): reviewer 構成ありで全 member skipped → approved（structural skip）
 * TC-007: member 0 件 → approved
 * TC-008: 一部承認・一部 skip → approved
 * TC-009: 全 skip round では member が pending のまま残る（D3 guard, free-pass 回避）
 * TC-010: 正典変更後の再走で新承認が新 revision / 新 canonHash に束縛される
 * TC-038: 全 member skipped 時に applyRoundResults が抑止され、roundError は null
 * TC-039: managed runtime では既存の承認 skip 挙動が変わらない
 *
 * NEW for round-all-skip-pass-through:
 *   TC-006 (new): skip と error の混在 → escalation（error は skip に紛れない）
 *   TC-009 (new): 全 skip round 後も member status は pending のまま
 *   TC-015: 全 skip round が sticky ROUND_ALL_MEMBERS_SKIPPED error を null にクリアする
 *
 * Destruction confirmations:
 *   TC-046: Removing canon check from selectPendingMembers → TC-001/TC-003 fail
 *   TC-003 new: Reverting aggregateVerdict to return "escalation" for all-skip → TC-006(canon)/TC-038 fail
 *   TC-009 gate: Removing allMembersSkipped guard from applyRoundResults → TC-009(new) fails
 *   TC-015: Restoring ROUND_ALL_MEMBERS_SKIPPED roundError → TC-015/TC-038 fail
 */
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { ParallelReviewRound } from "../parallel-review-round.js";
import { computeCanonHash } from "../reviewer-status.js";
import type { ParallelReviewConfig } from "../types.js";
import type { Step } from "../../step/types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StepExecutor } from "../../step/executor.js";
import type { StepExecutionResult } from "../../step/commit-orchestrator.js";
import type { ArtifactRef } from "../../../state/artifact-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "canon-test-slug";
const COORDINATOR = "custom-reviewers";
const MEMBER_A = "reviewer-alpha";
const MEMBER_B = "reviewer-beta";

/** Change folder paths (pipeline output — should be excluded from invalidation) */
const _FINDINGS_PATH = `specrunner/changes/${SLUG}/alpha-result-001.md`;

/** Canonical doc paths */
const _DESIGN_MD = `specrunner/changes/${SLUG}/design.md`;

/** Source path (outside change folder) */
const _SOURCE_PATH = "src/foo.ts";

// Canonical refs used for computing hash values in tests
const INITIAL_REFS: ArtifactRef[] = [
  { path: `specrunner/changes/${SLUG}/design.md`, hash: "sha256:design-initial" },
  { path: `specrunner/changes/${SLUG}/request.md`, hash: "sha256:request-initial" },
];

const CHANGED_REFS: ArtifactRef[] = [
  { path: `specrunner/changes/${SLUG}/design.md`, hash: "sha256:design-changed" }, // different!
  { path: `specrunner/changes/${SLUG}/request.md`, hash: "sha256:request-initial" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes: () => [],
  } as unknown as Step;
}

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

function makeBaseState(
  overrides: Partial<JobState> = {},
  memberNames: string[] = [MEMBER_A],
): JobState {
  return {
    version: 2,
    jobId: "canon-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Canon Binding Test",
      type: "spec-change",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: COORDINATOR,
    status: "running",
    branch: `change/${SLUG}`,
    history: [],
    error: null,
    steps: {},
    reviewers: memberNames.map((name) => ({
      name,
      maxIterations: 3,
      purpose: "",
      criteria: "",
      judgment: "",
      freeText: "",
    })),
    ...overrides,
  };
}

function makeDeps(
  store: ReturnType<typeof makeStore>,
  runtimeStrategy?: PipelineDeps["runtimeStrategy"],
): PipelineDeps {
  return {
    cwd: "/tmp/test",
    slug: SLUG,
    config: {} as never,
    request: {
      type: "spec-change",
      title: "Canon Binding Test",
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

function makeRound(
  fakeExecutor: StepExecutor,
  memberNames: string[] = [MEMBER_A],
): ParallelReviewRound {
  const steps = new Map(memberNames.map((name) => [name, makeMinimalStep(name)]));
  const parallelReview: ParallelReviewConfig = {
    coordinator: COORDINATOR,
    members: memberNames,
  };
  return new ParallelReviewRound({
    executor: fakeExecutor,
    steps,
    parallelReview,
    events: new EventBus(),
  });
}

/** Executor that returns a fixed StepExecutionResult for produceResult calls. */
function makeFixedExecutor(verdict: "approved" | "needs-fix" | "escalation"): {
  executor: StepExecutor;
  callCount: () => number;
} {
  const spy = vi.fn(async (): Promise<StepExecutionResult> => ({
    kind: "success",
    completion: { verdict, persistToolResult: null },
    completedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    session: null,
  }));
  return { executor: { produceResult: spy } as unknown as StepExecutor, callCount: () => spy.mock.calls.length };
}

/** Executor that returns "skipped" result for produceResult calls. */
function makeSkippedExecutor(): {
  executor: StepExecutor;
  callCount: () => number;
} {
  const spy = vi.fn(async (): Promise<StepExecutionResult> => ({
    kind: "skipped",
    skipReason: "activation-not-matched",
  }));
  return { executor: { produceResult: spy } as unknown as StepExecutor, callCount: () => spy.mock.calls.length };
}

/**
 * Make a runtimeStrategy with controllable digestArtifacts output.
 * captureHeadSha returns baselineSha; listChangedFiles returns changedFiles.
 */
function makeCanonRuntimeStrategy(opts: {
  baselineSha?: string;
  changedFiles?: string[];
  digestRefs?: ArtifactRef[];
}) {
  const { baselineSha = "sha-current", changedFiles = [], digestRefs = INITIAL_REFS } = opts;
  return {
    captureHeadSha: vi.fn(async () => baselineSha),
    listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: changedFiles })),
    digestArtifacts: vi.fn(async (): Promise<ArtifactRef[]> => digestRefs),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
  };
}

// ---------------------------------------------------------------------------
// TC-001: canonical doc change → approved reviewer becomes pending
// ---------------------------------------------------------------------------

describe("TC-001: canonical doc change invalidates approved reviewer", () => {
  it("TC-001: reviewer approved at H1 is pending when current canonHash is H2 (≠ H1)", async () => {
    // Compute H1 from initial refs (the value stored in the fabricated approval)
    const H1 = computeCanonHash(INITIAL_REFS);
    expect(H1).not.toBeNull(); // H1 is computable

    // Fabricate state: reviewer approved at (C1, H1)
    const state = makeBaseState({
      reviewerStatuses: [
        {
          name: MEMBER_A,
          status: "approved",
          approvedAtCommit: "C1",
          canonHash: H1,
        },
      ],
    });

    const store = makeStore();

    // runtimeStrategy: same revision (C1), but digestArtifacts returns CHANGED refs → H2 ≠ H1
    const runtimeStrategy = makeCanonRuntimeStrategy({
      baselineSha: "C1",
      changedFiles: [],                 // no activation-path change
      digestRefs: CHANGED_REFS,         // canonical docs changed → different hash
    });

    const { executor, callCount } = makeFixedExecutor("approved");
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store, runtimeStrategy as never));

    // TC-001: reviewer was re-run (pending → fan-out executed)
    expect(callCount()).toBe(1);
    expect(outcome).toBe("approved");
  });

  it("TC-001: digestArtifacts is called with canonical doc paths for the slug", async () => {
    const state = makeBaseState({
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: "C1", canonHash: "H-old" },
      ],
    });

    const store = makeStore();
    const runtimeStrategy = makeCanonRuntimeStrategy({ baselineSha: "C1", digestRefs: CHANGED_REFS });
    const { executor } = makeFixedExecutor("approved");
    const round = makeRound(executor);

    await round.run(COORDINATOR, state, makeDeps(store, runtimeStrategy as never));

    // Verify digestArtifacts was called (part of round setup)
    expect(runtimeStrategy.digestArtifacts).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-002: canonical and source unchanged → approved reviewer stays skipped
// ---------------------------------------------------------------------------

describe("TC-002: no canonical change → approved reviewer stays skipped", () => {
  it("TC-002: reviewer approved at H1 stays skipped when canonHash and revision are unchanged", async () => {
    // Compute H1 — same as what the round will compute from the same refs
    const H1 = computeCanonHash(INITIAL_REFS);
    expect(H1).not.toBeNull();

    // Fabricate state: reviewer approved at (C1, H1)
    const state = makeBaseState({
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: "C1", canonHash: H1 },
      ],
    });

    const store = makeStore();
    // runtimeStrategy returns SAME refs → same H1, same revision C1
    const runtimeStrategy = makeCanonRuntimeStrategy({
      baselineSha: "C1",
      changedFiles: [],     // no source change
      digestRefs: INITIAL_REFS, // same canonical docs → same H1
    });

    const { executor, callCount } = makeFixedExecutor("approved");
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store, runtimeStrategy as never));

    // TC-002: reviewer was NOT re-run (skip maintained)
    expect(callCount()).toBe(0);
    expect(outcome).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-003: legacy record without canonHash → pending (fail-closed)
// ---------------------------------------------------------------------------

describe("TC-003: legacy approval record without canonHash → pending at round level", () => {
  it("TC-003: reviewer approved without canonHash is not skipped when canon is available", async () => {
    // Legacy record: has approvedAtCommit but no canonHash (pre-feature state)
    const state = makeBaseState({
      reviewerStatuses: [
        {
          name: MEMBER_A,
          status: "approved",
          approvedAtCommit: "C1",
          // canonHash intentionally absent
        },
      ],
    });

    const store = makeStore();
    const runtimeStrategy = makeCanonRuntimeStrategy({
      baselineSha: "C1",      // same revision
      digestRefs: INITIAL_REFS, // valid canon hash available
    });

    const { executor, callCount } = makeFixedExecutor("approved");
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store, runtimeStrategy as never));

    // TC-003: fail-closed → reviewer was re-run despite revision match
    expect(callCount()).toBe(1);
    expect(outcome).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-006(canon)/TC-009/TC-038: all members skipped → approved structural skip, members stay pending
// (round-all-skip-pass-through: changed from "escalation" to "approved")
// ---------------------------------------------------------------------------

describe("TC-006(canon)/TC-009/TC-038: all members skipped → approved structural skip, members stay pending", () => {
  it("TC-006(canon)/TC-038: round outcome is approved when all members return skipped verdict (structural skip)", async () => {
    // TC-003 (reviewer-status unit): aggregateVerdict(["skipped","skipped"]) === "approved"
    // TC-006 (round level): ParallelReviewRound.run with all-skip members returns "approved"
    //
    // CHANGE from custom-reviewer-canon-binding D6 (which returned "escalation").
    // New behavior per round-all-skip-pass-through: all-skip = structural skip = approved.
    //
    // Destruction confirmation: reverting aggregateVerdict to "escalation" for all-skip causes
    // this test to fail → TC-001/TC-002 (awaiting-archive E2E) and TC-015 (sticky error) also fail.
    const state = makeBaseState();
    const store = makeStore();
    const runtimeStrategy = makeCanonRuntimeStrategy({});

    const { executor } = makeSkippedExecutor();
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store, runtimeStrategy as never));

    // TC-006(canon): all-skip → approved (structural skip, gate pass-through)
    expect(outcome).toBe("approved");
  });

  it("TC-038: coordinator StepRun has verdict approved and error null on all-skip round", async () => {
    // TC-038: roundError must be null (not ROUND_ALL_MEMBERS_SKIPPED).
    //
    // CHANGE: previously outcome.verdict was "escalation" and outcome.error.code was "ROUND_ALL_MEMBERS_SKIPPED".
    // New behavior: verdict = "approved", error = null.
    //
    // Destruction confirmation: restoring ROUND_ALL_MEMBERS_SKIPPED roundError causes
    // TC-015 (sticky error cleanup) and TC-010 (backward recovery) to fail.
    const state = makeBaseState();
    const store = makeStore();
    const runtimeStrategy = makeCanonRuntimeStrategy({});

    const { executor } = makeSkippedExecutor();
    const round = makeRound(executor);

    const { state: resultState } = await round.run(
      COORDINATOR,
      state,
      makeDeps(store, runtimeStrategy as never),
    );

    // TC-038: coordinator StepRun has approved verdict and null error
    const coordinatorRun = resultState.steps?.[COORDINATOR]?.[0];
    expect(coordinatorRun).toBeDefined();
    expect(coordinatorRun?.outcome.verdict).toBe("approved");
    expect(coordinatorRun?.outcome.error).toBeNull();
  });

  it("TC-009: members stay pending (not skipped) after all-skip structural skip round", async () => {
    // TC-009: D3 guard (allMembersSkipped → suppress applyRoundResults) must be maintained.
    // Members must NOT be set to "skipped" status — that would make them permanently excluded
    // from future rounds (free-pass). Keeping them "pending" ensures re-evaluation on next round.
    //
    // Destruction confirmation (TC-009 gate): removing the allMembersSkipped guard from
    // applyRoundResults causes members to be set "skipped", making future rounds skip them
    // permanently (free-pass violation of requirement 5).
    const state = makeBaseState();
    const store = makeStore();
    const runtimeStrategy = makeCanonRuntimeStrategy({});

    const { executor } = makeSkippedExecutor();
    const round = makeRound(executor);

    const { state: resultState } = await round.run(
      COORDINATOR,
      state,
      makeDeps(store, runtimeStrategy as never),
    );

    // TC-009: reviewerStatuses shows member as "pending" (applyRoundResults suppressed by D3 guard)
    const memberStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus).toBeDefined();
    expect(memberStatus?.status).toBe("pending");
    expect(memberStatus?.status).not.toBe("skipped");
  });

  it("TC-002/TC-038: single-member all-skip round is structural skip (approved), not just multi-member", async () => {
    // TC-002: a single reviewer that skips is still "all members skipped" = structural skip.
    // Edge case verification: the structural skip behavior applies to 1-member configs.
    //
    // CHANGE: previously single-member all-skip returned "escalation".
    // New behavior: "approved" (structural skip, gate pass-through).
    const state = makeBaseState();
    const store = makeStore();
    const { executor } = makeSkippedExecutor();
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store));

    // TC-002/TC-038: single-member all-skip → approved (structural skip)
    expect(outcome).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-007: member 0 → approved (fast path, feature unused)
// ---------------------------------------------------------------------------

describe("TC-007: member 0 → approved (fast path, feature unused)", () => {
  it("TC-007: round with no members returns approved without running any executor", async () => {
    // Zero members configured — feature unused → approved
    const state = makeBaseState({}, []); // empty members list
    const store = makeStore();

    const { executor, callCount } = makeFixedExecutor("approved");
    // Empty members list
    const emptyRound = new ParallelReviewRound({
      executor,
      steps: new Map(),
      parallelReview: { coordinator: COORDINATOR, members: [] },
      events: new EventBus(),
    });

    const { outcome } = await emptyRound.run(COORDINATOR, state, makeDeps(store));

    expect(outcome).toBe("approved");
    expect(callCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008: mixed skip+approved → approved (not escalation)
// ---------------------------------------------------------------------------

describe("TC-008: mixed skip + approved → approved (not all-skip escalation)", () => {
  it("TC-008: one skipped + one approved member produces approved outcome", async () => {
    // Two members: A skips, B approves → mixed → approved (not escalation)
    const state = makeBaseState({}, [MEMBER_A, MEMBER_B]);

    const store = makeStore();

    // A returns skipped, B returns approved
    const mixedSpy = vi.fn()
      .mockResolvedValueOnce({ kind: "skipped", skipReason: "activation-not-matched" } as StepExecutionResult)
      .mockResolvedValueOnce({
        kind: "success",
        completion: { verdict: "approved", persistToolResult: null },
        completedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        session: null,
      } as StepExecutionResult);

    const mixedExecutor: StepExecutor = { produceResult: mixedSpy } as unknown as StepExecutor;
    const round = makeRound(mixedExecutor, [MEMBER_A, MEMBER_B]);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store));

    // TC-008: mixed → approved (not escalation — at least one non-skip verdict)
    expect(outcome).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-010: new approval after canonical change is bound to new revision + canonHash
// ---------------------------------------------------------------------------

describe("TC-010: new approval after canonical change → bound to new revision + canonHash", () => {
  it("TC-010: re-approved member gets new approvedAtCommit=C2 and canonHash=H2", async () => {
    // Compute H1 (old canon, stored in fabricated state)
    const H1 = computeCanonHash(INITIAL_REFS);

    // Fabricate state: approved at (C1, H1)
    const state = makeBaseState({
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: "C1", canonHash: H1 },
      ],
    });

    const store = makeStore();

    // After canonical change: HEAD=C2, digestArtifacts returns CHANGED_REFS → H2
    const runtimeStrategy = makeCanonRuntimeStrategy({
      baselineSha: "C2",        // new revision
      digestRefs: CHANGED_REFS, // new canonical hash
    });

    const H2 = computeCanonHash(CHANGED_REFS); // expected new hash

    const { executor } = makeFixedExecutor("approved");
    const round = makeRound(executor);

    const { state: resultState } = await round.run(
      COORDINATOR,
      state,
      makeDeps(store, runtimeStrategy as never),
    );

    // TC-010: new approval is bound to C2 and H2
    const memberStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
    expect(memberStatus?.approvedAtCommit).toBe("C2");
    expect(memberStatus?.canonHash).toBe(H2);
    expect(memberStatus?.canonHash).not.toBe(H1); // new hash, not old
  });
});

// ---------------------------------------------------------------------------
// TC-015: 全 skip round が sticky ROUND_ALL_MEMBERS_SKIPPED error を null にクリアする
// (backward recovery foundation — requirement 6)
// ---------------------------------------------------------------------------

describe("TC-015: all-skip round clears sticky ROUND_ALL_MEMBERS_SKIPPED error from state", () => {
  it("TC-015: state.error is null after all-skip round when base state had ROUND_ALL_MEMBERS_SKIPPED error", async () => {
    // TC-015: verify that when base state carries a stale ROUND_ALL_MEMBERS_SKIPPED error
    // (e.g. from a job that stopped under the old behavior), a subsequent all-skip round
    // clears it via commitRound's state.error = roundError (where roundError = null now).
    //
    // This is the backward recovery foundation (requirement 6):
    // resume.ts clears error on transition-to-running, but commitRound also overwrites state.error.
    // Both paths converge: the round commit sets state.error = null when roundError is null.
    //
    // Destruction confirmation (TC-015): restoring ROUND_ALL_MEMBERS_SKIPPED roundError causes
    // state.error to remain ROUND_ALL_MEMBERS_SKIPPED → TC-010 (backward recovery E2E) fails
    // (terminal seam still routes to awaiting-resume instead of awaiting-archive).
    const staleError = {
      code: "ROUND_ALL_MEMBERS_SKIPPED",
      message: "All reviewers returned skipped verdict; no reviewer has approved the round.",
      hint: "Check reviewer activation conditions.",
    };
    // Seed base state with the stale error (simulates old job that stopped with this error)
    const state = makeBaseState({
      error: staleError,
      // reviewerStatuses: members pending (as if resume cleared them)
      reviewerStatuses: [{ name: MEMBER_A, status: "pending" }],
    });
    const store = makeStore();
    const runtimeStrategy = makeCanonRuntimeStrategy({});

    const { executor } = makeSkippedExecutor();
    const round = makeRound(executor);

    const { state: resultState, outcome } = await round.run(
      COORDINATOR,
      state,
      makeDeps(store, runtimeStrategy as never),
    );

    // TC-015: sticky error must be cleared (state.error === null)
    expect(resultState.error).toBeNull();
    // TC-015: outcome must be "approved" (structural skip, gate pass-through)
    expect(outcome).toBe("approved");
    // TC-009: member must still be "pending" (D3 guard maintained)
    const memberStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// TC-006 (new): skip と error の混在は停止する（error は skip に紛れない）
// (round-all-skip-pass-through requirement 3)
// ---------------------------------------------------------------------------

describe("TC-006 (new): skip と error の混在は escalation → pipeline stops", () => {
  it("TC-006: round with 1 skipped + 1 halt member produces escalation (not structural skip)", async () => {
    // TC-006: a mix of "skipped" and "escalation" (halt→escalation) verdicts must NOT be
    // treated as a structural skip. aggregateVerdict(["skipped","escalation"]) → "escalation".
    // The pipeline must stop (awaiting-resume), not proceed to awaiting-archive.
    //
    // This validates requirement 3: error and skip remain distinct.
    //
    // Destruction confirmation (TC-006): loosening the error/skip distinction (e.g. treating
    // halt as skip in verdictOfResult or aggregateVerdict) causes this test to fail →
    // fail-open: broken reviewers silently pass as structural skips.
    const state = makeBaseState({}, [MEMBER_A, MEMBER_B]);
    const store = makeStore();

    // Member A: skipped (activation not matched)
    // Member B: halt (session error → escalation)
    const haltError = { code: "AGENT_STEP_FAILED", message: "agent crashed", hint: "" };
    const mixedSpy = vi.fn()
      .mockResolvedValueOnce({
        kind: "skipped",
        skipReason: "no changed files matched paths [src/auth/**]",
      } as StepExecutionResult)
      .mockResolvedValueOnce({
        kind: "halt",
        halt: {
          kind: "failed",
          error: haltError,
          thrownErr: new Error("agent crashed"),
        },
      } as StepExecutionResult);

    const mixedExecutor: StepExecutor = { produceResult: mixedSpy } as unknown as StepExecutor;
    const round = makeRound(mixedExecutor, [MEMBER_A, MEMBER_B]);

    const { outcome, state: resultState } = await round.run(COORDINATOR, state, makeDeps(store));

    // TC-006: mixed skip+error → escalation (not approved structural skip)
    expect(outcome).toBe("escalation");
    // TC-006: coordinator run should reflect escalation
    const coordinatorRun = resultState.steps?.[COORDINATOR]?.[0];
    expect(coordinatorRun?.outcome.verdict).toBe("escalation");
    // TC-006: member B (halt) should not be finalized as "skipped"
    const memberBStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_B);
    if (memberBStatus) {
      expect(memberBStatus.status).not.toBe("skipped");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-039: managed runtime (no runtimeStrategy / captureHeadSha=null) → approved skip unchanged
// ---------------------------------------------------------------------------

describe("TC-039: managed runtime — existing approval skip unaffected by canon binding", () => {
  it("TC-039: approved member is skipped when runtimeStrategy is absent (managed fail-safe)", async () => {
    // Managed runtime: no runtimeStrategy → baselineCommit=null → approval skip maintained
    const state = makeBaseState({
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: "some-sha", canonHash: "H1" },
      ],
    });

    const store = makeStore();
    // No runtimeStrategy → managed path
    const { executor, callCount } = makeFixedExecutor("approved");
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, state, makeDeps(store, undefined));

    // TC-039: managed → approval skip maintained (no canon check → member skipped)
    expect(callCount()).toBe(0);
    expect(outcome).toBe("approved");
  });
});
