/**
 * Tests for src/cli/resume.ts — runResumeCore()
 *
 * TC-RESUME-001: status gate — awaiting-resume passes (happy path)
 * TC-RESUME-002: status gate — non-awaiting-resume rejected (exit 1) without --force
 * TC-RESUME-003: status gate — running always rejected even with --force
 * TC-RESUME-004: --force allows non-awaiting-resume (e.g. failed) to resume
 * TC-RESUME-005: no resumePoint + no --from → exit 1 with message
 * TC-RESUME-006: no resumePoint + --from → uses fallback step for phase
 * TC-RESUME-007: consecutive escalations → exit 1 without --force
 * TC-RESUME-008: consecutive escalations → allowed with --force
 * TC-RESUME-009: stale state → warning but continues
 * TC-RESUME-010: slug not found → exit 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../../../src/store/job-state-store.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";

// Top-level vi.mock() — hoisted before all imports by Vitest.
// Tests that exit before reaching these codepaths are unaffected.
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    runtime: "local",
    pipeline: { maxRetries: 2 },
    agents: {},
    jobs: { location: "xdg" },
  }),
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue({ token: "ghp_test", source: "credentials" }),
}));

vi.mock("../../../src/core/worktree/manager.js", () => ({
  createWorktreeManager: vi.fn().mockReturnValue({
    create: vi.fn().mockResolvedValue("/fake/worktree"),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../src/core/pipeline/index.js", () => ({
  createStandardPipeline: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue({
      version: 1,
      jobId: "test-job",
      status: "awaiting-merge",
      step: "pr-create",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test" },
      repository: { owner: "user", name: "repo" },
      session: null,
    }),
  }),
}));

vi.mock("../../../src/cli/progress.js", () => ({
  ProgressDisplay: vi.fn(),
  wireProgressDisplay: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

vi.mock("../../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockResolvedValue({
    title: "Test Request",
    type: "new-feature",
    slug: "test-slug",
    baseBranch: "main",
    content: "# Test Request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n",
    adr: false,
    sections: {},
  }),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-resume-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function makeAwaitingResumeJob(slug: string, overrides: Partial<JobState> = {}): Promise<JobState> {
  const state = await JobStateStore.create(tempDir, {
    request: {
      path: `/specrunner/drafts/${slug}.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "user", name: "repo" },
  });

  const store = new JobStateStore(state.jobId, tempDir);
  const current = await store.load();
  const updated: JobState = {
    ...current,
    status: "awaiting-resume",
    step: "code-review",
    resumePoint: {
      step: "code-review",
      reason: "escalation",
      iterationsExhausted: 2,
    },
    ...overrides,
  } as JobState;
  await store.persist(updated);
  return updated;
}

function makeStepRun(verdict: "escalation" | "error" | "approved", attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.000Z",
  };
}

// TC-RESUME-001: status gate — awaiting-resume passes (happy path)
describe("TC-RESUME-001: happy path awaiting-resume", () => {
  it("runs pipeline and returns exit code 0 when job is awaiting-resume", async () => {
    await makeAwaitingResumeJob("happy-slug");

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("happy-slug", { cwd: tempDir });
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-002: status gate — terminal statuses rejected; failed/terminated now allowed
describe("TC-RESUME-002: status gate rejection for terminal statuses", () => {
  it("returns exit code 1 for 'archived' status (no valid transition to running)", async () => {
    await makeAwaitingResumeJob("my-slug", { status: "archived", resumePoint: null });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("my-slug", { cwd: tempDir });
    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("cannot transition to"))).toBe(true);
  });

  it("returns exit code 0 for 'failed' status (allowed by VALID_TRANSITIONS)", async () => {
    await makeAwaitingResumeJob("failed-slug", {
      status: "failed",
      resumePoint: { step: "code-review", reason: "test failure", iterationsExhausted: 1 },
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("failed-slug", { cwd: tempDir });
    expect(exitCode).toBe(0);
  });

  it("returns exit code 0 for 'terminated' status (allowed by VALID_TRANSITIONS)", async () => {
    await makeAwaitingResumeJob("terminated-slug", {
      status: "terminated",
      resumePoint: { step: "code-review", reason: "terminated", iterationsExhausted: 0 },
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("terminated-slug", { cwd: tempDir });
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-003: running always rejected even with --force
describe("TC-RESUME-003: running status always rejected", () => {
  it("returns exit code 1 for 'running' status even with --force", async () => {
    await makeAwaitingResumeJob("running-slug", { status: "running", resumePoint: null });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("running-slug", { force: true, cwd: tempDir });
    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("currently running"))).toBe(true);
  });
});

// TC-RESUME-004: --force allows non-awaiting-resume (e.g. failed) to resume
describe("TC-RESUME-004: --force allows non-awaiting-resume", () => {
  it("runs pipeline and returns exit code 0 when status is 'failed' and --force is used", async () => {
    await makeAwaitingResumeJob("force-slug", {
      status: "failed",
      resumePoint: {
        step: "code-review",
        reason: "test failure",
        iterationsExhausted: 1,
      },
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("force-slug", { force: true, cwd: tempDir });
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-005: no resumePoint + no --from → exit 1 with message
describe("TC-RESUME-005: no resumePoint and no --from", () => {
  it("returns exit code 1 and outputs Japanese error message", async () => {
    await makeAwaitingResumeJob("no-resume-slug", { resumePoint: null });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("no-resume-slug", { cwd: tempDir });
    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("再開位置が不明"))).toBe(true);
  });
});

// TC-RESUME-006: no resumePoint + --from → uses fallback step for phase
describe("TC-RESUME-006: fallback step via --from", () => {
  it("resolves step using state.step as phase fallback when resumePoint is null and --from is provided", async () => {
    await makeAwaitingResumeJob("fallback-slug", {
      step: "spec-review",
      resumePoint: null,
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("fallback-slug", { from: "fixer", cwd: tempDir });
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-007: consecutive escalations → exit 1 without --force
describe("TC-RESUME-007: consecutive escalations without --force", () => {
  it("returns exit code 1 when step has 3 consecutive escalations", async () => {
    await makeAwaitingResumeJob("escalation-slug", {
      steps: {
        "code-review": [
          makeStepRun("escalation", 1),
          makeStepRun("escalation", 2),
          makeStepRun("escalation", 3),
        ],
      },
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("escalation-slug", { cwd: tempDir });
    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("escalated 3 consecutive times"))).toBe(true);
  });
});

// TC-RESUME-008: consecutive escalations → allowed with --force
describe("TC-RESUME-008: consecutive escalations with --force", () => {
  it("runs pipeline and returns exit code 0 when 3 consecutive escalations but --force is used", async () => {
    await makeAwaitingResumeJob("escalation-force-slug", {
      steps: {
        "code-review": [
          makeStepRun("escalation", 1),
          makeStepRun("escalation", 2),
          makeStepRun("escalation", 3),
        ],
      },
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("escalation-force-slug", { force: true, cwd: tempDir });
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-009: stale state → warning but continues
describe("TC-RESUME-009: stale state warning", () => {
  it("outputs warning when updatedAt is old but does not block execution", async () => {
    const staleDate = new Date(Date.now() - 86400001).toISOString(); // 1ms past threshold
    await makeAwaitingResumeJob("stale-slug", {
      updatedAt: staleDate,
      steps: {},
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    await runResumeCore("stale-slug", { cwd: tempDir });

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("24 hours"))).toBe(true);
  });
});

// TC-RESUME-010: slug not found → falls back to resolveJobId → exit 1 (JOB_NOT_FOUND)
// Updated: now falls back to short Job ID resolution when slug not found.
// When both slug and Job ID prefix fail, exit code is 1 (not 2).
describe("TC-RESUME-010: slug not found", () => {
  it("returns exit code 1 when no job found with given slug or job ID prefix", async () => {
    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("nonexistent-slug", { cwd: tempDir });
    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("Job not found"))).toBe(true);
  });
});

// TC-RESUME-013: exact #236 reproduction — fixer-empty mismatch through ResumeCommand.prepare()
// Verifies that the fixer-empty detection in resolveResumeStep works end-to-end at the command layer
// where state.steps is sourced from the loaded job state.
describe("TC-RESUME-013: exact #236 — fixer-empty mismatch detected at command layer", () => {
  it("resumePoint=code-fixer + steps[code-fixer] absent + steps[code-review] needs-fix → pipeline starts at code-review", async () => {
    // Construct the exact #236 job state:
    //   - resumePoint.step = "code-fixer" (pipeline.ts:100 recorded the transition)
    //   - state.steps["code-fixer"] is absent (fixer never executed — kill happened after transition)
    //   - state.steps["code-review"][-1].outcome.verdict = "needs-fix"
    await makeAwaitingResumeJob("bug-236-slug", {
      step: "code-fixer",
      resumePoint: {
        step: "code-fixer",
        reason: "loop-iteration",
        iterationsExhausted: 0,
      },
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          } satisfies StepRun,
        ],
        // "code-fixer" intentionally absent — fixer never ran (the #236 scenario)
      },
    });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("bug-236-slug", { cwd: tempDir });
    expect(exitCode).toBe(0);

    // Verify the pipeline was invoked with startStep = "code-review", not "code-fixer"
    const { createStandardPipeline } = await import("../../../src/core/pipeline/index.js");
    const pipelineMock = vi.mocked(createStandardPipeline);
    // pipeline.run(startStep, jobState, deps) — first arg is startStep
    const runFn = pipelineMock.mock.results[0]?.value.run as ReturnType<typeof vi.fn>;
    expect(runFn.mock.calls[0]?.[0]).toBe("code-review");
  });
});
