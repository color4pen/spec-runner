/**
 * Tests for pipeline catch safety net (Bug 1: crash leaves state as "running")
 *
 * T3.1: executor.execute throws without .state → state becomes awaiting-resume (要件 7)
 * T3.2: runInternal throws beyond catch (e.g. unknown step) → state becomes awaiting-resume (要件 8)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-crash-test-"));
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
    step: "implementer",
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
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
    },
    spawn: (async () => ({ exitCode: 0, stdout: "", stderr: "" })) as SpawnFn,
  };
}

function makeAgentStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../../src/state/schema.js").AgentStepName,
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

// T3.1: executor.execute throws plain Error (no .state) → state becomes awaiting-resume
describe("T3.1: executor throws without .state → state becomes awaiting-resume (要件 7)", () => {
  it("plain Error throw results in awaiting-resume with UNEXPECTED_STEP_ERROR", async () => {
    const jobState = makeMinimalState("test-no-state-throw");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();

    // Executor throws a plain Error without attaching .state
    const executeSpy = vi.fn().mockImplementation(async () => {
      throw new Error("Unexpected executor crash");
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["implementer", makeAgentStep("implementer")],
      ]),
      transitions: [
        { step: "implementer", on: "success",   to: "end" },
        { step: "implementer", on: "error",     to: "escalate" },
      ],
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
    });

    const result = await pipeline.run("implementer", jobState, makeMinimalDeps());

    // State should be awaiting-resume (not stuck as "running")
    expect(result.status).toBe("awaiting-resume");
    // resumePoint should record the crashed step
    expect(result.resumePoint).toBeDefined();
    expect(result.resumePoint?.step).toBe("implementer");
    // error code should be UNEXPECTED_STEP_ERROR
    expect(result.error?.code).toBe("UNEXPECTED_STEP_ERROR");
  });

  it("non-Error object throw (no .state, no .message) → awaiting-resume", async () => {
    const jobState = makeMinimalState("test-non-error-throw");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();

    // Throw a non-Error object (string)
    const executeSpy = vi.fn().mockImplementation(async () => {
      throw "string-thrown-error"; // eslint-disable-line no-throw-literal
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["implementer", makeAgentStep("implementer")],
      ]),
      transitions: [
        { step: "implementer", on: "success", to: "end" },
        { step: "implementer", on: "error",   to: "escalate" },
      ],
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
    });

    const result = await pipeline.run("implementer", jobState, makeMinimalDeps());

    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("UNEXPECTED_STEP_ERROR");
  });
});

// T3.2: runInternal throws beyond catch (unknown startStep) → pipeline.run() catch → awaiting-resume
describe("T3.2: runInternal throws (unknown step) → pipeline.run() catch → awaiting-resume (要件 8)", () => {
  it("unknown startStep throws Step not found → state becomes awaiting-resume with PIPELINE_UNHANDLED_ERROR", async () => {
    const jobState = makeMinimalState("test-unknown-step");
    await fs.mkdir(path.join(tempDir, "specrunner", "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`),
      JSON.stringify(jobState),
      "utf-8",
    );

    const events = new EventBus();

    const executeSpy = vi.fn();
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["implementer", makeAgentStep("implementer")],
      ]),
      transitions: [],
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review"],
    });

    // "nonexistent-step" is not in the steps Map → runInternal throws immediately
    // This bypasses the executor catch block entirely
    let caughtErr: unknown;
    let result: JobState | undefined;
    try {
      result = await pipeline.run("nonexistent-step", jobState, makeMinimalDeps());
    } catch (err) {
      caughtErr = err;
    }

    // pipeline.run() re-throws after persisting, so we check via the persisted state
    // The state should have been persisted as awaiting-resume before re-throw
    const { default: fs2 } = await import("node:fs/promises");
    const statePath = path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`);
    const raw = await fs2.readFile(statePath, "utf-8");
    const persisted = JSON.parse(raw) as JobState;

    // pipeline.run() rethrows, so result is undefined
    expect(result).toBeUndefined();
    expect(caughtErr).toBeDefined();

    // But the state on disk should have been transitioned to awaiting-resume
    expect(persisted.status).toBe("awaiting-resume");
    expect(persisted.error?.code).toBe("PIPELINE_UNHANDLED_ERROR");
  });
});
