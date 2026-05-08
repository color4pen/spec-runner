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
import { createJobState, updateJobState } from "../../../src/state/store.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";

// Top-level vi.mock() — hoisted before all imports by Vitest.
// Tests that exit before reaching these codepaths are unaffected.
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    runtime: "local",
    anthropic: { apiKey: "test-key" },
    github: { accessToken: "gh-token" },
    pipeline: { maxRetries: 2 },
    agents: {},
  }),
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
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
}));

vi.mock("../../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockResolvedValue({
    title: "Test Request",
    type: "new-feature",
    slug: "test-slug",
    baseBranch: "main",
    content: "# Test Request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n",
    enabled: [],
    sections: {},
  }),
}));

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-resume-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function makeAwaitingResumeJob(slug: string, overrides: Partial<JobState> = {}): Promise<JobState> {
  const state = await createJobState({
    request: {
      path: `/specrunner/requests/active/${slug}/request.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "user", name: "repo" },
  });

  return await updateJobState(state.jobId, (s) => ({
    ...s,
    status: "awaiting-resume",
    step: "code-review",
    resumePoint: {
      step: "code-review",
      reason: "escalation",
      iterationsExhausted: 2,
    },
    ...overrides,
  }));
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
    const exitCode = await runResumeCore("happy-slug", {});
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-002: status gate — non-awaiting-resume rejected without --force
describe("TC-RESUME-002: status gate rejection", () => {
  it("returns exit code 1 for 'failed' status without --force", async () => {
    await makeAwaitingResumeJob("my-slug", { status: "failed", resumePoint: null });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("my-slug", {});
    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("awaiting-resume"))).toBe(true);
  });
});

// TC-RESUME-003: running always rejected even with --force
describe("TC-RESUME-003: running status always rejected", () => {
  it("returns exit code 1 for 'running' status even with --force", async () => {
    await makeAwaitingResumeJob("running-slug", { status: "running", resumePoint: null });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("running-slug", { force: true });
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
    const exitCode = await runResumeCore("force-slug", { force: true });
    expect(exitCode).toBe(0);
  });
});

// TC-RESUME-005: no resumePoint + no --from → exit 1 with message
describe("TC-RESUME-005: no resumePoint and no --from", () => {
  it("returns exit code 1 and outputs Japanese error message", async () => {
    await makeAwaitingResumeJob("no-resume-slug", { resumePoint: null });

    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("no-resume-slug", {});
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
    const exitCode = await runResumeCore("fallback-slug", { from: "fixer" });
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
    const exitCode = await runResumeCore("escalation-slug", {});
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
    const exitCode = await runResumeCore("escalation-force-slug", { force: true });
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
    await runResumeCore("stale-slug", {});

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("24 hours"))).toBe(true);
  });
});

// TC-RESUME-010: slug not found → exit 2
describe("TC-RESUME-010: slug not found", () => {
  it("returns exit code 2 when no job found with given slug", async () => {
    const { runResumeCore } = await import("../../../src/cli/resume.js");
    const exitCode = await runResumeCore("nonexistent-slug", {});
    expect(exitCode).toBe(2);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("No job found"))).toBe(true);
  });
});
