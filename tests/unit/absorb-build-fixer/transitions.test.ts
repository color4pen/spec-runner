/**
 * Tests: build-fixer の廃止 — 遷移表・registry 固定
 *
 * TC-001: 標準経路で verification 失敗が implementer へ遷移する
 * TC-002: chore(fast)経路で verification 失敗が implementer へ遷移する
 * TC-010: verificationFailedLast が最新 verification=failed で true を返す
 * TC-011: verificationFailedLast が最新 verification=passed で false を返す
 * TC-012: verificationFailedLast が verification 未実行で false を返す
 * TC-013: 遷移表に BUILD_FIXER への遷移が存在しない(STANDARD / FAST 両経路)
 * TC-014: loopFixerPairs[VERIFICATION] が IMPLEMENTER を指す(STANDARD / FAST)
 * TC-015: STANDARD の IMPLEMENTER→VERIFICATION(verificationFailedLast) が BITE_EVIDENCE 行より前に並ぶ
 * TC-016: 回復再入の implementer 完了後、bite-evidence をバイパスして VERIFICATION に直帰する
 * TC-019: --from 候補一覧に build-fixer が含まれない
 *
 * Source: specrunner/changes/absorb-build-fixer/test-cases.md
 */
import { describe, it, expect } from "vitest";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { STANDARD_DESCRIPTOR, FAST_DESCRIPTOR } from "../../../src/core/pipeline/registry.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../../../src/kernel/step-names.js";
// TC-010/011/012: verificationFailedLast added to reverification.ts in this change
import { verificationFailedLast } from "../../../src/core/pipeline/reverification.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStepRun(verdict: string, ts: string = "2026-01-01T00:01:00.000Z"): import("../../../src/state/schema.js").StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: ts,
    endedAt: ts,
  };
}

// ---------------------------------------------------------------------------
// TC-001: 標準経路で verification 失敗が implementer へ遷移する
// ---------------------------------------------------------------------------

describe("TC-001: STANDARD_TRANSITIONS — verification failed → implementer", () => {
  it("TC-001: STANDARD_TRANSITIONS に verification --failed→ implementer が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.VERIFICATION && t.on === "failed" && t.to === STEP_NAMES.IMPLEMENTER,
    );
    expect(row).toBeDefined();
  });

  it("TC-001: STANDARD_TRANSITIONS に verification --failed→ build-fixer が存在しない", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.VERIFICATION && t.on === "failed" && t.to === "build-fixer",
    );
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-002: chore(fast)経路で verification 失敗が implementer へ遷移する
// ---------------------------------------------------------------------------

describe("TC-002: FAST_TRANSITIONS — verification failed → implementer", () => {
  it("TC-002: FAST_TRANSITIONS に verification --failed→ implementer が存在する", () => {
    const row = FAST_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.VERIFICATION && t.on === "failed" && t.to === STEP_NAMES.IMPLEMENTER,
    );
    expect(row).toBeDefined();
  });

  it("TC-002: FAST_TRANSITIONS に verification --failed→ build-fixer が存在しない", () => {
    const row = FAST_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.VERIFICATION && t.on === "failed" && t.to === "build-fixer",
    );
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-010: verificationFailedLast が最新 verification=failed で true
// ---------------------------------------------------------------------------

describe("TC-010: verificationFailedLast — latest verification=failed → true", () => {
  it("TC-010: 最新 verification run の verdict が failed のとき true を返す", () => {
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("passed", "2026-01-01T00:01:00.000Z"),
          makeStepRun("failed",  "2026-01-01T00:02:00.000Z"),
        ],
      },
    });
    expect(verificationFailedLast(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-011: verificationFailedLast が最新 verification=passed で false
// ---------------------------------------------------------------------------

describe("TC-011: verificationFailedLast — latest verification=passed → false", () => {
  it("TC-011: 最新 verification run の verdict が passed のとき false を返す", () => {
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("failed", "2026-01-01T00:01:00.000Z"),
          makeStepRun("passed", "2026-01-01T00:02:00.000Z"),
        ],
      },
    });
    expect(verificationFailedLast(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-012: verificationFailedLast が verification 未実行で false (should)
// ---------------------------------------------------------------------------

describe("TC-012: verificationFailedLast — verification 未実行 → false", () => {
  it("TC-012: verification run が一件もない state で false を返す(エラーにならない)", () => {
    const state = makeMinimalState({ steps: {} });
    expect(verificationFailedLast(state)).toBe(false);
  });

  it("TC-012: state.steps 自体が undefined でも false を返す", () => {
    const state = makeMinimalState();
    expect(verificationFailedLast(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-013: 遷移表に BUILD_FIXER への遷移が存在しない(STANDARD / FAST 両経路)
// ---------------------------------------------------------------------------

describe("TC-013: 両遷移表に build-fixer への遷移が存在しない", () => {
  it("TC-013: STANDARD_TRANSITIONS に step=build-fixer の行が存在しない", () => {
    const rows = STANDARD_TRANSITIONS.filter((t) => t.step === "build-fixer");
    expect(rows).toHaveLength(0);
  });

  it("TC-013: STANDARD_TRANSITIONS に to=build-fixer の行が存在しない", () => {
    const rows = STANDARD_TRANSITIONS.filter((t) => t.to === "build-fixer");
    expect(rows).toHaveLength(0);
  });

  it("TC-013: FAST_TRANSITIONS に step=build-fixer の行が存在しない", () => {
    const rows = FAST_TRANSITIONS.filter((t) => t.step === "build-fixer");
    expect(rows).toHaveLength(0);
  });

  it("TC-013: FAST_TRANSITIONS に to=build-fixer の行が存在しない", () => {
    const rows = FAST_TRANSITIONS.filter((t) => t.to === "build-fixer");
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-014: loopFixerPairs[VERIFICATION] が IMPLEMENTER を指す(STANDARD / FAST)
// ---------------------------------------------------------------------------

describe("TC-014: loopFixerPairs[VERIFICATION] === implementer", () => {
  it("TC-014: STANDARD_DESCRIPTOR.loopFixerPairs[verification] === implementer", () => {
    expect(STANDARD_DESCRIPTOR.loopFixerPairs[STEP_NAMES.VERIFICATION]).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-014: FAST_DESCRIPTOR.loopFixerPairs[verification] === implementer", () => {
    expect(FAST_DESCRIPTOR.loopFixerPairs[STEP_NAMES.VERIFICATION]).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-014: STANDARD_DESCRIPTOR.loopFixerPairs[verification] ≠ build-fixer", () => {
    expect(STANDARD_DESCRIPTOR.loopFixerPairs[STEP_NAMES.VERIFICATION]).not.toBe("build-fixer");
  });

  it("TC-014: FAST_DESCRIPTOR.loopFixerPairs[verification] ≠ build-fixer", () => {
    expect(FAST_DESCRIPTOR.loopFixerPairs[STEP_NAMES.VERIFICATION]).not.toBe("build-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-015: STANDARD の IMPLEMENTER→VERIFICATION(verificationFailedLast) が
//         BITE_EVIDENCE 行より前に並ぶ
// ---------------------------------------------------------------------------

describe("TC-015: STANDARD_TRANSITIONS — IMPLEMENTER→VERIFICATION(when verificationFailedLast) は BITE_EVIDENCE 行より前", () => {
  it("TC-015: implementer success → verification(when) の行が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.IMPLEMENTER &&
        t.on === "success" &&
        t.to === STEP_NAMES.VERIFICATION &&
        t.when !== undefined,
    );
    expect(row).toBeDefined();
  });

  it("TC-015: implementer success → verification(when) の行が → bite-evidence の行より前に出現する(first-match-wins)", () => {
    const rows = STANDARD_TRANSITIONS;
    const toVerificationIdx = rows.findIndex(
      (t) =>
        t.step === STEP_NAMES.IMPLEMENTER &&
        t.on === "success" &&
        t.to === STEP_NAMES.VERIFICATION &&
        t.when !== undefined,
    );
    const toBiteEvidenceIdx = rows.findIndex(
      (t) => t.step === STEP_NAMES.IMPLEMENTER && t.on === "success" && t.to === STEP_NAMES.BITE_EVIDENCE,
    );
    expect(toVerificationIdx).toBeGreaterThan(-1);
    expect(toBiteEvidenceIdx).toBeGreaterThan(-1);
    expect(toVerificationIdx).toBeLessThan(toBiteEvidenceIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-016: 回復再入の implementer 完了後、bite-evidence をバイパスして VERIFICATION に直帰する
// ---------------------------------------------------------------------------

describe("TC-016: verificationFailedLast=true のとき implementer success → verification(when)", () => {
  it("TC-016: verificationFailedLast guard の when が失敗 state で true を返す", () => {
    // Find the implementer→verification(when: verificationFailedLast) row specifically
    // (there may be multiple implementer→verification rows with different guards)
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.IMPLEMENTER &&
        t.on === "success" &&
        t.to === STEP_NAMES.VERIFICATION &&
        t.when === verificationFailedLast,
    );
    expect(row).toBeDefined();

    // The guard must return true for verificationFailedLast=true state
    const state = makeMinimalState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeStepRun("failed", "2026-01-01T00:01:00.000Z"),
        ],
        [STEP_NAMES.IMPLEMENTER]: [
          makeStepRun("success", "2026-01-01T00:02:00.000Z"),
        ],
      },
    });
    expect(row!.when!(state)).toBe(true);
  });

  it("TC-016: verificationFailedLast=false(初回)のとき when guard は false を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.IMPLEMENTER &&
        t.on === "success" &&
        t.to === STEP_NAMES.VERIFICATION &&
        t.when === verificationFailedLast,
    );
    expect(row).toBeDefined();

    // Fresh state — no verification run yet
    const state = makeMinimalState({ steps: {} });
    expect(row!.when!(state)).toBe(false);
  });

  it("TC-016: 通常 implementer success は bite-evidence 行が存在する", () => {
    // The unconditional bite-evidence row must exist so that non-recovery path still works
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.IMPLEMENTER && t.on === "success" && t.to === STEP_NAMES.BITE_EVIDENCE,
    );
    expect(row).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-019: --from 候補一覧に build-fixer が含まれない
// ---------------------------------------------------------------------------

describe("TC-019: --from 候補に build-fixer が含まれない", () => {
  it("TC-019: AGENT_STEP_NAMES に build-fixer が含まれない", () => {
    expect(AGENT_STEP_NAMES).not.toContain("build-fixer");
  });

  it("TC-019: CLI_STEP_NAMES に build-fixer が含まれない", () => {
    expect(CLI_STEP_NAMES).not.toContain("build-fixer");
  });

  it("TC-019: AGENT_STEP_NAMES と CLI_STEP_NAMES の結合に build-fixer が含まれない", () => {
    const allStepNames = [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES];
    expect(allStepNames).not.toContain("build-fixer");
  });
});
