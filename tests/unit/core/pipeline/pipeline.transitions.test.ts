/**
 * Unit tests for Pipeline transition table and loop guard
 *
 * TC-012: 7 新エッジが STANDARD_TRANSITIONS に存在する
 * TC-013: LOOP_ERROR_CODES — spec-review cycle
 * TC-014: LOOP_ERROR_CODES — verification cycle
 * TC-015: loop guard → VERIFICATION_RETRIES_EXHAUSTED で escalation (integration)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STANDARD_TRANSITIONS, LOOP_ERROR_CODES } from "../../../../src/core/pipeline/types.js";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-transitions-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(jobId: string = "test-job"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
    },
  };
}

function makeStepObject(name: string, kind: "agent" | "cli" = "agent"): Step {
  if (kind === "cli") {
    return {
      kind: "cli",
      name,
      run: vi.fn().mockResolvedValue(undefined),
      resultFilePath: () => `openspec/changes/test-slug/${name}-result.md`,
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };
  }
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../../src/state/schema.js").StepName,
      model: "claude-sonnet-4-5",
      system: `system for ${name}`,
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    completionVerdict: "success" as const,
  };
}

// TC-012: STANDARD_TRANSITIONS に 7 新エッジが含まれる
describe("TC-012: STANDARD_TRANSITIONS に 7 新エッジが存在する", () => {
  const requiredEdges = [
    { step: "spec-review",  on: "approved",   to: "implementer" },
    { step: "implementer",  on: "success",     to: "verification" },
    { step: "implementer",  on: "error",       to: "escalate" },
    { step: "verification", on: "passed",      to: "end" },
    { step: "verification", on: "failed",      to: "build-fixer" },
    { step: "verification", on: "escalation",  to: "escalate" },
    { step: "build-fixer",  on: "success",     to: "verification" },
    { step: "build-fixer",  on: "error",       to: "escalate" },
  ];

  for (const edge of requiredEdges) {
    it(`transition: ${edge.step} --${edge.on}→ ${edge.to}`, () => {
      const found = STANDARD_TRANSITIONS.find(
        (t) => t.step === edge.step && t.on === edge.on && t.to === edge.to,
      );
      expect(found).toBeDefined();
    });
  }
});

// TC-013: LOOP_ERROR_CODES — spec-review cycle
describe("TC-013: LOOP_ERROR_CODES — spec-review cycle", () => {
  it("LOOP_ERROR_CODES['spec-review'].code === 'SPEC_REVIEW_RETRIES_EXHAUSTED'", () => {
    const entry = LOOP_ERROR_CODES["spec-review"];
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });

  it("LOOP_ERROR_CODES['spec-review'].message references maxIterations", () => {
    const entry = LOOP_ERROR_CODES["spec-review"];
    const msg = entry!.message(3);
    expect(msg).toContain("3");
    expect(msg.toLowerCase()).toContain("spec-review");
  });
});

// TC-014: LOOP_ERROR_CODES — verification cycle
describe("TC-014: LOOP_ERROR_CODES — verification cycle", () => {
  it("LOOP_ERROR_CODES['verification'].code === 'VERIFICATION_RETRIES_EXHAUSTED'", () => {
    const entry = LOOP_ERROR_CODES["verification"];
    expect(entry).toBeDefined();
    expect(entry!.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");
  });

  it("message matches 'verification did not pass after N iterations'", () => {
    const entry = LOOP_ERROR_CODES["verification"];
    const msg = entry!.message(3);
    expect(msg).toMatch(/verification did not pass after 3 iterations/);
  });

  it("hint starts with 'Review verification-result-'", () => {
    const entry = LOOP_ERROR_CODES["verification"];
    const hint = entry!.hint("001");
    expect(hint).toMatch(/^Review verification-result-001\.md/);
  });
});

// TC-015: loop guard → VERIFICATION_RETRIES_EXHAUSTED
describe("TC-015: verification ↔ build-fixer loop guard → VERIFICATION_RETRIES_EXHAUSTED", () => {
  it("verification が 3 回 failed → VERIFICATION_RETRIES_EXHAUSTED で escalation", async () => {
    const maxIterations = 3;

    const jobState = makeMinimalState("test-loop-guard");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();
    let verificationCallCount = 0;

    // Mock executor: verification always returns failed, build-fixer always returns success
    const executeSpy = vi.fn().mockImplementation(async (step: Step, state: JobState): Promise<JobState> => {
      if (step.name === "verification") {
        verificationCallCount++;
        return {
          ...state,
          status: "success",
          step: "verification",
          steps: {
            ...state.steps,
            verification: [
              ...(state.steps?.["verification"] ?? []),
              {
                attempt: verificationCallCount,
                sessionId: null,
                outcome: { verdict: "failed" as const, findingsPath: `openspec/changes/test-slug/verification-result.md`, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      if (step.name === "build-fixer") {
        return {
          ...state,
          status: "success",
          step: "build-fixer",
          steps: {
            ...state.steps,
            "build-fixer": [
              ...(state.steps?.["build-fixer"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "success" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["verification", makeStepObject("verification")],
        ["build-fixer",  makeStepObject("build-fixer")],
      ]),
      transitions: [
        { step: "verification", on: "passed",    to: "end" },
        { step: "verification", on: "failed",    to: "build-fixer" },
        { step: "verification", on: "escalation", to: "escalate" },
        { step: "build-fixer",  on: "success",   to: "verification" },
        { step: "build-fixer",  on: "error",     to: "escalate" },
      ],
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: "verification",
      loopNames: ["verification"],
    });

    const result = await pipeline.run("verification", jobState, makeMinimalDeps());

    expect(result.error?.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");
    expect(result.error?.message).toContain("3");
  });
});
