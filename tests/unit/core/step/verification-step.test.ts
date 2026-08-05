/**
 * Unit tests for VerificationStep wiring.
 *
 * TC-11: VerificationStep.run が deps.request.baseBranch を runVerification の第4引数に渡すこと
 */
import { describe, it, expect, vi } from "vitest";
import type { CliStepDeps } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";

// Mock runVerification and propagateVerificationResult before importing the step
vi.mock("../../../../src/core/verification/runner.js", () => ({
  runVerification: vi.fn().mockResolvedValue({
    verdict: "passed",
    errorCode: undefined,
    phases: [],
  }),
}));

vi.mock("../../../../src/core/verification/propagate.js", () => ({
  propagateVerificationResult: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock reloadCoverageConfig to return applied: false by default so existing tests
// are hermetic (no real git/fs I/O) and effective config === deps.config.verification.
vi.mock("../../../../src/core/verification/reload-coverage-config.js", () => ({
  reloadCoverageConfig: vi.fn().mockResolvedValue({ applied: false }),
}));

import { runVerification } from "../../../../src/core/verification/runner.js";
import { reloadCoverageConfig } from "../../../../src/core/verification/reload-coverage-config.js";
import { VerificationStep } from "../../../../src/core/step/verification.js";

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "verification",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(baseBranch: string, cwd: string): CliStepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "spec-change",
      title: "Test",
      slug: "test-slug",
      baseBranch,
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    cwd,
    spawn: vi.fn(),
  };
}

describe("TC-003: commands は job 開始時の値を保持する", () => {
  it("reload.applied === true でも verification.commands は deps (job 開始時) の値を維持し disk reload に上書きされない", async () => {
    // Simulate build-fixer having edited disk config: reloadCoverageConfig returns
    // applied: true with updated coverage. The disk config file may also declare
    // verification.commands, but reloadCoverageConfig only surfaces coverage —
    // so the spread { ...deps.config.verification, coverage: reload.coverage }
    // must keep the job-start commands intact.
    vi.mocked(reloadCoverageConfig).mockResolvedValueOnce({
      applied: true,
      coverage: {
        command: "npm test -- --coverage",
        lcovPath: "coverage/lcov.info",
        include: [],
      },
    });
    vi.mocked(runVerification).mockClear();

    const state = makeMinimalState();
    const deps = makeMinimalDeps("main", "/fake/cwd");
    // Set a distinct job-start commands value to prove it is NOT replaced by disk reload.
    deps.config.verification = { commands: ["echo job-start-cmd"] };

    await VerificationStep.run(state, deps);

    const spy = vi.mocked(runVerification);
    expect(spy).toHaveBeenCalledOnce();

    const effectiveVerification = spy.mock.calls[0]?.[2];
    // commands must be the job-start value — disk reload only changes coverage.
    expect(effectiveVerification?.commands).toEqual(["echo job-start-cmd"]);
    // coverage must be the reloaded value from disk (not the job-start undefined).
    expect(effectiveVerification?.coverage?.command).toBe("npm test -- --coverage");
  });
});

describe("TC-11: VerificationStep.run passes deps.request.baseBranch to runVerification", () => {
  it("runVerification が第4引数に baseBranch='feature-base' を受け取る", async () => {
    vi.mocked(runVerification).mockClear();

    const state = makeMinimalState();
    const deps = makeMinimalDeps("feature-base", "/fake/cwd");

    await VerificationStep.run(state, deps);

    const spy = vi.mocked(runVerification);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[3]).toBe("feature-base");
  });

  it("baseBranch が 'main' のとき第4引数が 'main' になる", async () => {
    vi.mocked(runVerification).mockClear();

    const state = makeMinimalState();
    const deps = makeMinimalDeps("main", "/fake/cwd");

    await VerificationStep.run(state, deps);

    const spy = vi.mocked(runVerification);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[3]).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// TC-014: VerificationStep.run が phases を phase/status/exitCode のみに投影して返す (must)
// Source: tasks.md > T-05 / T-08 TC-04
//
// RED: VerificationStep.run currently returns void (undefined).
//      After T-05: run() returns { verificationPhases: [...] } with stdout/stderr/durationMs dropped.
// ---------------------------------------------------------------------------
describe("TC-014: VerificationStep.run projects PhaseResult to phase/status/exitCode only (must)", () => {
  it("run() returns {verificationPhases:[{phase,status,exitCode}]} — stdout/stderr/durationMs dropped", async () => {
    vi.mocked(runVerification).mockClear();
    vi.mocked(runVerification).mockResolvedValueOnce({
      slug: "test-slug",
      verdict: "failed",
      phases: [
        {
          phase: "build",
          status: "failed",
          exitCode: 1,
          stdout: "err output",
          stderr: "trace info",
          durationMs: 5,
        },
      ],
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("main", "/fake/cwd");

    // VerificationStep.run returns void currently; returns CliStepRunOutcome after T-05
    const result = await VerificationStep.run(state, deps);

    // After T-05: run() returns { verificationPhases: [{ phase, status, exitCode }] }
    // stdout / stderr / durationMs must be dropped (D3 in tasks.md)
    expect(result).toEqual({
      verificationPhases: [
        { phase: "build", status: "failed", exitCode: 1 },
      ],
    });
  });

  it("run() does not include stdout, stderr, or durationMs in projected phases", async () => {
    vi.mocked(runVerification).mockClear();
    vi.mocked(runVerification).mockResolvedValueOnce({
      slug: "test-slug",
      verdict: "passed",
      phases: [
        {
          phase: "test",
          status: "passed",
          exitCode: 0,
          stdout: "All tests passed",
          stderr: "",
          durationMs: 1234,
          skippedCount: 2,
        },
      ],
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("main", "/fake/cwd");

    // VerificationStep.run returns void currently; returns CliStepRunOutcome after T-05
    const result = await VerificationStep.run(state, deps);

    expect(result).toBeDefined();
    const phases = (result as unknown as Record<string, unknown>)?.["verificationPhases"] as Array<Record<string, unknown>>;
    expect(phases).toHaveLength(1);
    // Only phase/status/exitCode — no stdout/stderr/durationMs/skippedCount
    expect(phases[0]).not.toHaveProperty("stdout");
    expect(phases[0]).not.toHaveProperty("stderr");
    expect(phases[0]).not.toHaveProperty("durationMs");
    expect(phases[0]).not.toHaveProperty("skippedCount");
    expect(phases[0]).toMatchObject({ phase: "test", status: "passed", exitCode: 0 });
  });
});

// ---------------------------------------------------------------------------
// TC-015: VerificationStep.run が空 phases のとき verificationPhases: [] を返す (should)
// Source: tasks.md > T-05
//
// RED: VerificationStep.run currently returns void.
//      After T-05: run() returns { verificationPhases: [] } for empty phases.
// ---------------------------------------------------------------------------
describe("TC-015: VerificationStep.run returns verificationPhases:[] for empty phases (should)", () => {
  it("run() returns { verificationPhases: [] } when runVerification returns phases: []", async () => {
    vi.mocked(runVerification).mockClear();
    vi.mocked(runVerification).mockResolvedValueOnce({
      slug: "test-slug",
      verdict: "passed",
      phases: [],
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("main", "/fake/cwd");

    // VerificationStep.run returns void currently; returns CliStepRunOutcome after T-05
    const result = await VerificationStep.run(state, deps);

    expect(result).toEqual({ verificationPhases: [] });
  });
});
