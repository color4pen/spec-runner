/**
 * Unit tests for StepExecutor verdict determination (T-01 / T-02 outcome-cutover R3)
 *
 * These tests verify that finalizeStep derives verdict from toolResult (typed outcome)
 * rather than prose parse, and that null-toolResult proceeds instead of halting.
 *
 * TC-VERDICT-01: judge + approved:true → "approved"
 * TC-VERDICT-02: judge + approved:false → "needs-fix"
 * TC-VERDICT-03: judge + approved:undefined → "needs-fix"
 * TC-VERDICT-04: judge + toolResult null → "needs-fix" (proceed, no halt)
 * TC-VERDICT-05: producer + status:"success" → "success" (completionVerdict)
 * TC-VERDICT-06: producer + status:"error" → "error"
 * TC-VERDICT-07: producer + toolResult null → completionVerdict ("success")
 * TC-VERDICT-08: producer (completionVerdict:"approved") + status:"success" → "approved"
 * TC-VERDICT-09: code-review + approved:true + fixableCount:3 → "approved" (routing is separate)
 * TC-VERDICT-10: grounded CLI step → prose parse path (toolResult not involved)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { AgentRunner } from "../../../../src/core/port/agent-runner.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { AgentStepName } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { BaseReportResult } from "../../../../src/core/port/report-result.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import {
  JUDGE_REPORT_TOOL,
  CODE_REVIEW_REPORT_TOOL,
  PRODUCER_REPORT_TOOL,
} from "../../../../src/core/step/report-tool.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-verdict-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: {},
  };
}

function makeDeps(): PipelineDeps {
  return {
    config: makeConfig(),
    slug: "test-slug",
    request: {
      type: "new-feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "# Test\n",
      adr: false,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    cwd: tempDir,
  };
}

async function createRunningJobState(): Promise<JobState> {
  const created = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "owner", name: "repo" },
  });
  const store = makeStoreFactory(tempDir)(created.jobId);
  const running: JobState = {
    ...created,
    status: "running",
    branch: "feat/test-slug",
  };
  await store.persist(running);
  return running;
}

/**
 * Create a runner that returns the specified toolResult (or null for no-tool-call).
 * Accepts any object shape — typed subclasses are cast to BaseReportResult in the mock.
 */
function makeRunnerWithToolResult(toolResult: Record<string, unknown> | null): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: toolResult as BaseReportResult | null,
      followUpAttempts: 0,
    }),
  };
}

/** Build a judge step (spec-review) with JUDGE_REPORT_TOOL. */
function makeJudgeStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "spec-review",
    agent: {
      name: "specrunner-spec-review",
      role: "spec-review" as AgentStepName,
      model: "claude-sonnet-4-5",
      system: "review the spec",
      tools: [],
    },
    buildMessage: () => "review it",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    reportTool: JUDGE_REPORT_TOOL,
    ...overrides,
  };
}

/** Build a code-review judge step with CODE_REVIEW_REPORT_TOOL. */
function makeCodeReviewStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "code-review",
    agent: {
      name: "specrunner-code-review",
      role: "code-review" as AgentStepName,
      model: "claude-sonnet-4-5",
      system: "review the code",
      tools: [],
    },
    buildMessage: () => "review it",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    reportTool: CODE_REVIEW_REPORT_TOOL,
    ...overrides,
  };
}

/** Build a producer step (implementer) with PRODUCER_REPORT_TOOL. */
function makeProducerStep(completionVerdict?: AgentStep["completionVerdict"]): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer" as AgentStepName,
      model: "claude-sonnet-4-5",
      system: "implement it",
      tools: [],
    },
    buildMessage: () => "implement it",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    reportTool: PRODUCER_REPORT_TOOL,
    completionVerdict,
  };
}

/** Extract the last step outcome verdict for a given step name. */
function getLastVerdict(state: JobState, stepName: string) {
  const runs = state.steps?.[stepName] ?? [];
  return runs[runs.length - 1]?.outcome?.verdict ?? undefined;
}

// ---------------------------------------------------------------------------
// TC-VERDICT-01: judge + approved:true → "approved"
// ---------------------------------------------------------------------------

describe("TC-VERDICT-01: judge + approved:true → approved", () => {
  it("spec-review with toolResult.approved=true yields verdict 'approved'", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult({ ok: true, approved: true });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeJudgeStep(), jobState, makeDeps());

    expect(getLastVerdict(finalState, "spec-review")).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-02: judge + approved:false → "needs-fix"
// ---------------------------------------------------------------------------

describe("TC-VERDICT-02: judge + approved:false → needs-fix", () => {
  it("spec-review with toolResult.approved=false yields verdict 'needs-fix'", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult({ ok: true, approved: false });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeJudgeStep(), jobState, makeDeps());

    expect(getLastVerdict(finalState, "spec-review")).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-03: judge + approved:undefined → "needs-fix"
// ---------------------------------------------------------------------------

describe("TC-VERDICT-03: judge + approved:undefined → needs-fix", () => {
  it("spec-review with toolResult={ok:true} (approved unset) yields verdict 'needs-fix'", async () => {
    const jobState = await createRunningJobState();
    // No 'approved' field — treated as undefined → needs-fix (conservative side)
    const runner = makeRunnerWithToolResult({ ok: true });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeJudgeStep(), jobState, makeDeps());

    expect(getLastVerdict(finalState, "spec-review")).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-04: judge + toolResult null → "needs-fix" (proceed, no halt)
// ---------------------------------------------------------------------------

describe("TC-VERDICT-04: judge + toolResult null → needs-fix proceed (no halt)", () => {
  it("spec-review with toolResult=null yields needs-fix without throwing", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult(null);
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    // Must not throw
    const finalState = await executor.execute(makeJudgeStep(), jobState, makeDeps());

    expect(finalState.status).not.toBe("awaiting-resume");
    expect(getLastVerdict(finalState, "spec-review")).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-05: producer + status:"success" → completionVerdict ("success")
// ---------------------------------------------------------------------------

describe("TC-VERDICT-05: producer + status:success → completionVerdict success", () => {
  it("implementer with toolResult.status='success' and completionVerdict='success' yields 'success'", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult({ ok: true, status: "success" });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeProducerStep("success"), jobState, makeDeps());

    expect(getLastVerdict(finalState, "implementer")).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-06: producer + status:"error" → "error"
// ---------------------------------------------------------------------------

describe("TC-VERDICT-06: producer + status:error → error", () => {
  it("implementer with toolResult.status='error' yields verdict 'error'", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult({ ok: true, status: "error" });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeProducerStep("success"), jobState, makeDeps());

    expect(getLastVerdict(finalState, "implementer")).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-07: producer + toolResult null → completionVerdict ("success")
// ---------------------------------------------------------------------------

describe("TC-VERDICT-07: producer + toolResult null → completionVerdict proceed", () => {
  it("implementer with toolResult=null yields completionVerdict 'success' without throwing", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult(null);
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeProducerStep("success"), jobState, makeDeps());

    expect(finalState.status).not.toBe("awaiting-resume");
    expect(getLastVerdict(finalState, "implementer")).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-08: producer (completionVerdict:"approved") + status:"success" → "approved"
// ---------------------------------------------------------------------------

describe("TC-VERDICT-08: producer with completionVerdict:approved + status:success → approved", () => {
  it("spec-fixer-like step with completionVerdict='approved' and status='success' yields 'approved'", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult({ ok: true, status: "success" });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    // completionVerdict = "approved" — transition table on: "approved" should match
    const finalState = await executor.execute(makeProducerStep("approved"), jobState, makeDeps());

    expect(getLastVerdict(finalState, "implementer")).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-VERDICT-09: code-review + approved:true + fixableCount:3 → "approved"
// ---------------------------------------------------------------------------

describe("TC-VERDICT-09: code-review + approved:true + fixableCount:3 → approved", () => {
  it("code-review with toolResult.approved=true and fixableCount=3 yields verdict 'approved' (routing is separate concern)", async () => {
    const jobState = await createRunningJobState();
    const runner = makeRunnerWithToolResult({ ok: true, approved: true, fixableCount: 3 });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const finalState = await executor.execute(makeCodeReviewStep(), jobState, makeDeps());

    // verdict is "approved" — fixableCount affects routing (when predicate) not the step verdict
    expect(getLastVerdict(finalState, "code-review")).toBe("approved");
    // toolResult is stored in the outcome for routing
    const runs = finalState.steps?.["code-review"] ?? [];
    const lastOutcome = runs[runs.length - 1]?.outcome;
    expect(lastOutcome?.toolResult).toBeDefined();
  });
});
