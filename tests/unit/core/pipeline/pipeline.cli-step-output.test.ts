/**
 * Tests for [step] stdout output for non-loop CliSteps (cli-step-observable-progress)
 *
 * TC-S01: dsv entry emits [step] delta-spec-validation
 * TC-S02: dsv completion emits [step] delta-spec-validation: approved
 * TC-S03: pr-create entry emits [step] pr-create
 * TC-S04: pr-create success emits [step] pr-create: success
 * TC-S05: CliStep with verdict null emits no completion line
 * TC-S06: verification (loopNames CliStep) does NOT emit [step] line (iter display only)
 * TC-S07: design (AgentStep non-loopNames) does NOT emit [step] line (AgentStep out of scope)
 *
 * Non-loop CliSteps = step.kind === "cli" AND step name NOT in loopNames.
 * Verification is kind:"cli" but IS in loopNames → uses [iter N/M] format, not [step].
 * Design is kind:"agent" and NOT in loopNames → AgentStep, out of scope for [step] display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-cli-step-output-test-"));
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

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-cli-step-output-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
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
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    },
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

function getCapturedStdout(): string {
  return (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
    .map((args: unknown[]) => String(args[0]))
    .join("");
}

/** Build a CliStep that writes the given verdict to state when executed. */
function makeCliStepWithVerdict(name: string, verdict: string | null): Step {
  return {
    kind: "cli",
    name,
    run: async () => {},
    resultFilePath: () => `/tmp/${name}-result.md`,
    parseResult: () => ({
      verdict: verdict as import("../../../../src/state/schema.js").Verdict | null,
      findingsPath: null,
    }),
  };
}

/** Build an AgentStep (kind: "agent") for testing exclusion. */
function makeAgentStep(name: string, completionVerdict?: string): Step {
  return {
    kind: "agent",
    name,
    agent: { name: `specrunner-${name}`, role: name as import("../../../../src/state/schema.js").AgentStepName, model: "claude-sonnet-4-5", system: "", tools: [] },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...(completionVerdict !== undefined ? { completionVerdict: completionVerdict as import("../../../../src/state/schema.js").Verdict } : {}),
  };
}

/** Make a state where the given step has the given verdict recorded. */
function stateWithVerdict(base: JobState, stepName: string, verdict: string): JobState {
  return {
    ...base,
    status: "running",
    steps: {
      ...base.steps,
      [stepName]: [
        ...(base.steps?.[stepName] ?? []),
        { attempt: 1, sessionId: null, outcome: { verdict: verdict as import("../../../../src/state/schema.js").Verdict, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" },
      ],
    },
  };
}

// Standard loopNames used across tests
const LOOP_NAMES = ["spec-review", "verification", "code-review"];

// TC-S01: dsv entry emits [step] delta-spec-validation
describe("TC-S01: dsv entry emits [step] delta-spec-validation", () => {
  it("outputs [step] delta-spec-validation before step runs", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const dsvResult = stateWithVerdict(state, "delta-spec-validation", "approved");

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "delta-spec-validation") return dsvResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["delta-spec-validation", makeCliStepWithVerdict("delta-spec-validation", "approved")],
      ]),
      transitions: [
        { step: "delta-spec-validation", on: "approved",   to: "end" },
        { step: "delta-spec-validation", on: "needs-fix",  to: "escalate" },
        { step: "delta-spec-validation", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,  // delta-spec-validation NOT in loopNames
    });

    await pipeline.run("delta-spec-validation", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("[step] delta-spec-validation");
  });
});

// TC-S02: dsv completion emits [step] delta-spec-validation: approved
describe("TC-S02: dsv completion emits [step] delta-spec-validation: approved", () => {
  it("outputs [step] delta-spec-validation: approved after step completes", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const dsvResult = stateWithVerdict(state, "delta-spec-validation", "approved");

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "delta-spec-validation") return dsvResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["delta-spec-validation", makeCliStepWithVerdict("delta-spec-validation", "approved")],
      ]),
      transitions: [
        { step: "delta-spec-validation", on: "approved",   to: "end" },
        { step: "delta-spec-validation", on: "needs-fix",  to: "escalate" },
        { step: "delta-spec-validation", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,
    });

    await pipeline.run("delta-spec-validation", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("[step] delta-spec-validation: approved");
  });
});

// TC-S03: pr-create entry emits [step] pr-create
describe("TC-S03: pr-create entry emits [step] pr-create", () => {
  it("outputs [step] pr-create before step runs", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const prResult = stateWithVerdict(state, "pr-create", "success");

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "pr-create") return prResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["pr-create", makeCliStepWithVerdict("pr-create", "success")],
      ]),
      transitions: [
        { step: "pr-create", on: "success", to: "end" },
        { step: "pr-create", on: "error",   to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,  // pr-create NOT in loopNames
    });

    await pipeline.run("pr-create", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("[step] pr-create");
  });
});

// TC-S04: pr-create success emits [step] pr-create: success
describe("TC-S04: pr-create success emits [step] pr-create: success", () => {
  it("outputs [step] pr-create: success after step completes with success verdict", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const prResult = stateWithVerdict(state, "pr-create", "success");

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "pr-create") return prResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["pr-create", makeCliStepWithVerdict("pr-create", "success")],
      ]),
      transitions: [
        { step: "pr-create", on: "success", to: "end" },
        { step: "pr-create", on: "error",   to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,
    });

    await pipeline.run("pr-create", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("[step] pr-create: success");
  });
});

// TC-B03: dsv needs-fix completion emits [step] delta-spec-validation: needs-fix
describe("TC-B03: dsv needs-fix completion emits [step] delta-spec-validation: needs-fix", () => {
  it("outputs [step] delta-spec-validation: needs-fix after step completes with needs-fix verdict", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const dsvResult = stateWithVerdict(state, "delta-spec-validation", "needs-fix");

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "delta-spec-validation") return dsvResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["delta-spec-validation", makeCliStepWithVerdict("delta-spec-validation", "needs-fix")],
      ]),
      transitions: [
        { step: "delta-spec-validation", on: "approved",   to: "end" },
        { step: "delta-spec-validation", on: "needs-fix",  to: "escalate" },
        { step: "delta-spec-validation", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,
    });

    await pipeline.run("delta-spec-validation", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("[step] delta-spec-validation: needs-fix");
  });
});

// TC-B06: pr-create error completion emits [step] pr-create: error
describe("TC-B06: pr-create error completion emits [step] pr-create: error", () => {
  it("outputs [step] pr-create: error after step completes with error verdict", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const prResult = stateWithVerdict(state, "pr-create", "error");

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "pr-create") return prResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["pr-create", makeCliStepWithVerdict("pr-create", "error")],
      ]),
      transitions: [
        { step: "pr-create", on: "success", to: "end" },
        { step: "pr-create", on: "error",   to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,
    });

    await pipeline.run("pr-create", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("[step] pr-create: error");
  });
});

// TC-S05: CliStep with verdict null emits no completion line
describe("TC-S05: CliStep with verdict null emits no completion line", () => {
  it("outputs entry [step] line but NOT a completion line when verdict is null", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    // The executor returns state unchanged — no verdict recorded in state.steps["mock-cli"]
    // getLatestStepResult will return undefined, so verdict is null/undefined → no completion line.
    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "mock-cli") return { ...state, status: "running" };
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        // parseResult returns null verdict — getStepOutcome falls through to completionVerdict
        // which is not set, so returns "approved" as default
        ["mock-cli", {
          kind: "cli" as const,
          name: "mock-cli",
          run: async () => {},
          resultFilePath: () => "/tmp/mock-cli-result.md",
          parseResult: () => ({ verdict: null, findingsPath: null }),
        }],
      ]),
      transitions: [
        { step: "mock-cli", on: "approved", to: "end" },
        { step: "mock-cli", on: "error",    to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,  // mock-cli NOT in loopNames
    });

    await pipeline.run("mock-cli", state, deps);

    const stdout = getCapturedStdout();
    // Entry line appears
    expect(stdout).toContain("[step] mock-cli");
    // But NO completion line (verdict is null in state.steps → getLatestStepResult returns undefined)
    expect(stdout).not.toContain("[step] mock-cli:");
  });
});

// TC-S06: verification (loopNames CliStep) does NOT emit [step] line
describe("TC-S06: verification (loopNames CliStep) does NOT emit [step] line", () => {
  it("verification emits [iter N/M] but NOT [step] verification", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const verificationResult = {
      ...state,
      status: "running" as const,
      steps: {
        "verification": [{ attempt: 1, sessionId: null, outcome: { verdict: "passed" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }],
      },
    };

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "verification") return verificationResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["verification", {
          kind: "cli" as const,
          name: "verification",
          run: async () => {},
          resultFilePath: () => "/tmp/verification-result.md",
          parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
        }],
      ]),
      transitions: [
        { step: "verification", on: "passed",    to: "end" },
        { step: "verification", on: "failed",    to: "escalate" },
        { step: "verification", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,  // verification IS in loopNames → uses [iter] format
    });

    await pipeline.run("verification", state, deps);

    const stdout = getCapturedStdout();
    // iter format appears (loop step)
    expect(stdout).toContain("[iter 1/3] starting verification");
    // [step] format does NOT appear (verification is a loop step, not a non-loop CliStep)
    expect(stdout).not.toContain("[step] verification");
  });
});

// TC-S07: design (AgentStep non-loopNames) does NOT emit [step] line
describe("TC-S07: design (AgentStep non-loopNames) does NOT emit [step] line", () => {
  it("design emits nothing (AgentStep, not CliStep — outside scope of [step] display)", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const designResult = { ...state, status: "running" as const, branch: "feat/test" };

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "design") return designResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["design", makeAgentStep("design", "success")],
      ]),
      transitions: [
        { step: "design", on: "success", to: "end" },
        { step: "design", on: "error",   to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: LOOP_NAMES,  // design NOT in loopNames, but it's an AgentStep
    });

    await pipeline.run("design", state, deps);

    const stdout = getCapturedStdout();
    // AgentStep non-loopNames: no [step] output (outside scope of this request)
    expect(stdout).not.toContain("[step] design");
    // Also no iter output (not a loop step)
    expect(stdout).not.toContain("[iter");
  });
});
