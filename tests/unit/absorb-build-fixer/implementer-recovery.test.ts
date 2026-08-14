/**
 * Tests: build-fixer の廃止 — implementer 回復 message・session 継続・enrichContext
 *
 * TC-003: 前回 session を継続して失敗内容を渡す
 * TC-004: 前回 sessionId が無ければ fresh で継続失敗を吸収する
 * TC-005: 回復 message に制約文言が含まれない
 * TC-017: verification-result.md 不在でも enrichContext が例外を投げない
 * TC-018: conformance 再入(verificationFailedLast=false)時に implementer が resumeSessionId を持たない
 *
 * Source: specrunner/changes/absorb-build-fixer/test-cases.md
 */
import { describe, it, expect, vi } from "vitest";
import { buildStepContext, type BuildStepContextFs } from "../../../src/core/step/step-context-builder.js";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";

// ---------------------------------------------------------------------------
// State / deps factories
// ---------------------------------------------------------------------------

function makeStepRun(
  verdict: string,
  ts: string,
  sessionId: string | null = null,
): StepRun {
  return {
    attempt: 1,
    sessionId,
    outcome: {
      verdict: verdict as import("../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: ts,
    endedAt: ts,
  };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-recovery-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "fix/test-branch",
    history: [],
    error: null,
    steps: {},
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
    cwd: "/tmp/test-worktree",
    slug: "test-slug",
    config: { version: 1, runtime: "local", agents: {} } as never,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Fix the thing",
      adr: false,
      path: "specrunner/changes/test-slug/request.md",
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "testowner",
    repo: "testrepo",
    spawn: vi.fn() as never,
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    repoRoot: undefined,
    runtimeStrategy: undefined,
    ...overrides,
  } as PipelineDeps;
}

/** Stub fs adapter that always throws ENOENT (simulates missing files). */
const stubFsEnoent: BuildStepContextFs = {
  readFile: async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  },
  readdir: async () => [],
};

const stubEmit = vi.fn();

// ---------------------------------------------------------------------------
// TC-003: 前回 session を継続して失敗内容を渡す
// ---------------------------------------------------------------------------

describe("TC-003: implementer 再入 — 前回 sessionId ありで resumeSessionId に前回 ID が入る", () => {
  it("TC-003: verificationFailedLast=true + 前回 implementer sessionId あり → resumeSessionId === 前回 ID", async () => {
    const prevSessionId = "prev-impl-session-abc";
    const state = makeJobState({
      steps: {
        // Latest verification run = failed
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("failed", "2026-01-01T00:02:00.000Z"),
        ],
        // Previous implementer run with session ID
        [STEP_NAMES.IMPLEMENTER]: [
          makeStepRun("success", "2026-01-01T00:01:00.000Z", prevSessionId),
        ],
      },
    });
    const deps = makeDeps();

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/tmp/test-worktree",
      stubEmit,
      stubFsEnoent,
    );

    // TC-003: implementation に session 継続が配線されたとき前回 ID が引き渡される
    expect(ctx.session.resumeSessionId).toBe(prevSessionId);
  });
});

// ---------------------------------------------------------------------------
// TC-004: 前回 sessionId が無ければ fresh で継続失敗を吸収する
// ---------------------------------------------------------------------------

describe("TC-004: implementer 再入 — 前回 sessionId 無し → resumeSessionId undefined(fresh)", () => {
  it("TC-004: verificationFailedLast=true + 前回 implementer run なし → resumeSessionId undefined", async () => {
    const state = makeJobState({
      steps: {
        // Latest verification run = failed
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("failed", "2026-01-01T00:01:00.000Z"),
        ],
        // No implementer runs
      },
    });
    const deps = makeDeps();

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/tmp/test-worktree",
      stubEmit,
      stubFsEnoent,
    );

    // TC-004: 前回 session が無いとき fresh(undefined)に fallback し、例外にならない
    expect(ctx.session.resumeSessionId).toBeUndefined();
  });

  it("TC-004: verificationFailedLast=true + 前回 implementer sessionId=null → resumeSessionId undefined", async () => {
    const state = makeJobState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("failed", "2026-01-01T00:02:00.000Z"),
        ],
        [STEP_NAMES.IMPLEMENTER]: [
          makeStepRun("success", "2026-01-01T00:01:00.000Z", null /* null sessionId */),
        ],
      },
    });
    const deps = makeDeps();

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/tmp/test-worktree",
      stubEmit,
      stubFsEnoent,
    );

    // TC-004: sessionId=null は fresh(undefined)に倒れる
    expect(ctx.session.resumeSessionId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-005: 回復 message に制約文言が含まれない
// ---------------------------------------------------------------------------

describe("TC-005: 回復 message に機械的修正制約文言が含まれない", () => {
  function makeRecoveryState(): JobState {
    return makeJobState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("failed", "2026-01-01T00:01:00.000Z"),
        ],
        [STEP_NAMES.TEST_MATERIALIZE]: [
          makeStepRun("success", "2026-01-01T00:00:30.000Z"),
        ],
      },
    });
  }

  function makeMinimalDepsForMessage() {
    return {
      config: { version: 1, agents: {}, environment: { id: "env_001", lastSyncedAt: "2026-01-01" } },
      request: {
        type: "bug-fix",
        title: "Test",
        slug: "test-slug",
        baseBranch: "main",
        content: "Fix the thing",
        adr: false,
      },
      slug: "test-slug",
      dynamicContext: undefined,
    } as import("../../../src/core/step/types.js").StepDeps;
  }

  it("TC-005: 回復 message は verification 失敗の解消を指示する", () => {
    const state = makeRecoveryState();
    const deps = makeMinimalDepsForMessage();
    const message = ImplementerStep.buildMessage(state, deps);

    // Recovery message should mention verification / failure resolution
    // (matches "verification", "失敗", or the English equivalent)
    const lowerMessage = message.toLowerCase();
    expect(
      lowerMessage.includes("verification") || lowerMessage.includes("失敗"),
    ).toBe(true);
  });

  it("TC-005: 回復 message に「機械的修正のみ」等の制約文言が含まれない", () => {
    const state = makeRecoveryState();
    const deps = makeMinimalDepsForMessage();
    const message = ImplementerStep.buildMessage(state, deps);

    // Constraint text that must NOT appear
    expect(message).not.toContain("機械的修正のみ");
    expect(message).not.toContain("設計判断禁止");
    expect(message).not.toContain("Fix the errors mechanically");
    expect(message).not.toContain("NO specification changes");
    expect(message).not.toContain("NO design decisions");
    expect(message).not.toContain("mechanically");
  });
});

// ---------------------------------------------------------------------------
// TC-017: verification-result.md 不在でも enrichContext が例外を投げない
// ---------------------------------------------------------------------------

describe("TC-017: implementer.enrichContext — verification-result.md 不在で例外を投げない", () => {
  it("TC-017: enrichContext が存在し、ファイル不在で元の dynamicContext をそのまま返す", async () => {
    // enrichContext is added to ImplementerStep by this change.
    // Until implementation it will be undefined (TC RED state).
    const enrichCtx = ImplementerStep.enrichContext;
    expect(enrichCtx).toBeDefined();

    const dynamicContext = { gitLog: "some-log", diffStat: "some-stat" };
    // File doesn't exist at /nonexistent path
    const result = await enrichCtx!(
      dynamicContext as import("../../../src/git/dynamic-context.js").DynamicContext,
      "/nonexistent-dir",
      "test-slug",
    );

    // Must not throw, must return dynamicContext unchanged
    expect(result).toBeDefined();
    expect(result).toEqual(dynamicContext);
  });

  it("TC-017: enrichContext が存在しないとき(未実装)テストは RED になる — placeholder", () => {
    // This verifies the expected interface shape.
    // If enrichContext is absent before implementation, the test above fails clearly.
    // This is just a documentation assertion.
    expect(typeof ImplementerStep.enrichContext === "function" || ImplementerStep.enrichContext === undefined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-018: conformance 再入(verificationFailedLast=false)時に implementer が resumeSessionId を持たない
// ---------------------------------------------------------------------------

describe("TC-018: conformance 再入 — verificationFailedLast=false → resumeSessionId undefined", () => {
  it("TC-018: 最新 verification が passed のとき implementer は resumeSessionId を持たない", async () => {
    const prevSessionId = "prev-impl-session-xyz";
    const state = makeJobState({
      steps: {
        // Latest verification run = passed (conformance re-entry after code review)
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("passed", "2026-01-01T00:03:00.000Z"),
        ],
        // Previous implementer run exists with sessionId
        [STEP_NAMES.IMPLEMENTER]: [
          makeStepRun("success", "2026-01-01T00:01:00.000Z", prevSessionId),
        ],
      },
    });
    const deps = makeDeps();

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/tmp/test-worktree",
      stubEmit,
      stubFsEnoent,
    );

    // TC-018: conformance 再入は verificationFailedLast=false → fresh(undefined)
    // 前回 sessionId があっても verification=passed なら継続しない
    expect(ctx.session.resumeSessionId).toBeUndefined();
  });

  it("TC-018: verification 未実行(初回)のとき implementer は resumeSessionId を持たない", async () => {
    const state = makeJobState({ steps: {} });
    const deps = makeDeps();

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/tmp/test-worktree",
      stubEmit,
      stubFsEnoent,
    );

    expect(ctx.session.resumeSessionId).toBeUndefined();
  });
});
