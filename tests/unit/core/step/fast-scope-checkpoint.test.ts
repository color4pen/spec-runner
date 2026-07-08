/**
 * T-05: conformance checkpoint での 4 surfaces 評価（導出可能 runtime、executor 駆動）
 *
 * - breach: listChangedFiles が 4 surfaces のいずれかを返すとき、verdict = escalation かつ
 *   scope finding (origin:"scope", resolution:"decision-needed") が 1 件合成される
 * - no breach: 4 surfaces にマッチしないパスのみのとき、scope finding が合成されず verdict 不変
 * - checkpoint 単一性: 非 checkpoint step (code-review) を同 permissionScope で実行しても
 *   scope 合成が走らない (listChangedFiles 未呼び出し)
 *
 * executor 駆動パターン: StepExecutor に applyScopeConfig で得た permissionScope を渡し、
 * ConformanceStep (checkpoint=conformance) を canDeriveChangedFiles()===true の runtime fake で実行する。
 * breach テストは config fixture で forbidden surfaces を宣言し applyScopeConfig でスコープを組み立てる。
 * no-breach テスト（空 forbidden）は registry 定数のまま動作することを確認する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { FAST_DESCRIPTOR } from "../../../../src/core/pipeline/registry.js";
import { applyScopeConfig } from "../../../../src/core/pipeline/resolve-scope.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { AgentRunner } from "../../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../../src/core/port/runtime-strategy.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { BaseReportResult } from "../../../../src/core/port/report-result.js";
import type { Finding } from "../../../../src/kernel/report-result.js";
import {
  CONFORMANCE_REPORT_TOOL,
  CODE_REVIEW_REPORT_TOOL,
} from "../../../../src/core/step/report-tool.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-scope-checkpoint-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "managed", agents: {} };
}

function makeDeps(runtimeStrategy?: RuntimeStrategy): PipelineDeps {
  return {
    config: makeConfig(),
    slug: "fast-test-feature",
    request: {
      type: "bug-fix",
      title: "Fast scope test",
      slug: "fast-test-feature",
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
    runtimeStrategy,
  };
}

async function createRunningJobState(overrides: Partial<JobState> = {}): Promise<JobState> {
  const created = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Fast scope test",
      type: "bug-fix",
      slug: "fast-test-feature",
    },
    repository: { owner: "owner", name: "repo" },
  });
  const running: JobState = {
    ...created,
    status: "running",
    branch: "feat/fast-test-feature",
    ...overrides,
  };
  const store = makeStoreFactory(tempDir)(running.jobId);
  await store.persist(running);
  return running;
}

/**
 * Build a fake AgentRunner that returns the given toolResult.
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

/**
 * Build a RuntimeStrategy that can derive changed files and returns the given list.
 * canDeriveChangedFiles returns true.
 */
function makeEvaluableStrategy(changedFiles: string[]): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner() {
      return {
        async run() {
          return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as never; },
    registerCleanup() { return {} as never; },
    async teardown() {},
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async finalizeStepArtifacts() {},
    async validateStepInputs() {},
    async validateStepOutputs() { return { violations: [] }; },
    async commitFinalState() {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState() {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async listChangedFiles() { return changedFiles; },
    canDeriveChangedFiles: () => true,
  };
}

/** Build a spy-wrapped evaluable strategy so listChangedFiles calls can be counted. */
function makeEvaluableStrategyWithSpy(changedFiles: string[]): RuntimeStrategy & { listChangedFiles: ReturnType<typeof vi.fn> } {
  const base = makeEvaluableStrategy(changedFiles);
  const listFn = vi.fn().mockResolvedValue(changedFiles);
  return { ...base, listChangedFiles: listFn };
}

/** Extract the last step outcome for a given step name. */
function getLastOutcome(state: JobState, stepName: string) {
  const runs = state.steps?.[stepName] ?? [];
  return runs[runs.length - 1]?.outcome ?? undefined;
}

/**
 * Make a minimal AgentStep for the conformance step (uses CONFORMANCE_REPORT_TOOL).
 */
function makeConformanceStep(): AgentStep {
  return {
    kind: "agent",
    name: "conformance",
    agent: {
      name: "specrunner-conformance",
      role: "conformance" as never,
      model: "claude-sonnet-4-6",
      system: "conformance",
      tools: [],
    },
    buildMessage: () => "check conformance",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    reportTool: CONFORMANCE_REPORT_TOOL,
  };
}

/**
 * Make a minimal AgentStep for a non-checkpoint step (code-review uses JUDGE/CODE_REVIEW tool).
 * Using CODE_REVIEW_REPORT_TOOL to match real code-review step.
 */
function makeCodeReviewStep(): AgentStep {
  return {
    kind: "agent",
    name: "code-review",
    agent: {
      name: "specrunner-code-review",
      role: "code-review" as never,
      model: "claude-sonnet-4-6",
      system: "code review",
      tools: [],
    },
    buildMessage: () => "review code",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    reportTool: CODE_REVIEW_REPORT_TOOL,
  };
}

// ---------------------------------------------------------------------------
// Config fixture with the 4 dogfooding surfaces (mirrors .specrunner/config.json)
// ---------------------------------------------------------------------------

function makeFastConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: {},
    pipeline: {
      fast: {
        forbiddenSurfaces: [
          { id: "public-types",      paths: ["src/core/port/**"] },
          { id: "persisted-format",  paths: ["src/state/schema.ts"] },
          { id: "state-transitions", paths: ["src/state/lifecycle.ts"] },
          { id: "guard-config",      paths: [".specrunner/config.json"] },
        ],
      },
    },
  };
}

/**
 * Resolve the permissionScope for breach tests by applying the config fixture.
 * applyScopeConfig merges forbidden surfaces from config into the descriptor.
 */
function makeFastScopeFromConfig(): NonNullable<typeof FAST_DESCRIPTOR.permissionScope> {
  const descriptor = applyScopeConfig(FAST_DESCRIPTOR, makeFastConfig());
  return descriptor.permissionScope!;
}

// ---------------------------------------------------------------------------
// The FAST permissionScope with empty forbidden (registry default — no config)
// ---------------------------------------------------------------------------

const FAST_SCOPE_EMPTY = FAST_DESCRIPTOR.permissionScope!;

// ---------------------------------------------------------------------------
// T-05-1: breach — a file in src/core/port/** → scope finding + escalation
// ---------------------------------------------------------------------------

describe("T-05-1: breach at conformance checkpoint → scope finding + escalation", () => {
  it("public-types breach (src/core/port/runtime-strategy.ts) → verdict escalation", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/core/port/runtime-strategy.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("escalation");
  });

  it("persisted-format breach (src/state/schema.ts) → verdict escalation", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/state/schema.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("escalation");
  });

  it("state-transitions breach (src/state/lifecycle.ts) → verdict escalation", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/state/lifecycle.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("escalation");
  });

  it("breach → toolResult.findings contains scope finding (origin:'scope', resolution:'decision-needed')", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/core/port/runtime-strategy.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(1);
    expect(scopeFindings[0]!.resolution).toBe("decision-needed");
  });

  it("breach → scope finding has severity 'high'", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/state/schema.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFinding = (tr?.findings ?? []).find((f) => f.origin === "scope");
    expect(scopeFinding?.severity).toBe("high");
  });

  it("breach → scope finding has ≥2 options", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/state/lifecycle.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFinding = (tr?.findings ?? []).find((f) => f.origin === "scope");
    expect(scopeFinding?.options?.length).toBeGreaterThanOrEqual(2);
  });

  it("guard-config breach (.specrunner/config.json) → verdict escalation", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy([".specrunner/config.json"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("escalation");
  });

  it("guard-config breach → scope finding (origin:'scope', resolution:'decision-needed') is synthesized", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy([".specrunner/config.json"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(1);
    expect(scopeFindings[0]!.resolution).toBe("decision-needed");
  });
});

// ---------------------------------------------------------------------------
// TC-002: no breach with makeFastScopeFromConfig() and a safe changed file
// ---------------------------------------------------------------------------

describe("TC-002: guard-config surface declared — safe changed file does not cause breach", () => {
  // Verifies that makeFastScopeFromConfig() (which includes all 4 surfaces including
  // guard-config) does NOT produce a scope finding when the changed file is unrelated
  // to any forbidden surface.

  it("src/core/pipeline/types.ts with guard-config scope → no scope finding, verdict approved", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/core/pipeline/types.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });

  it("src/core/command/run.ts with guard-config scope → no scope finding, verdict approved", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/core/command/run.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      makeFastScopeFromConfig(),
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-05-2: no breach — only safe files → scope finding NOT synthesized, verdict unaffected
// ---------------------------------------------------------------------------

describe("T-05-2: no breach → scope finding NOT synthesized, verdict unaffected (approved)", () => {
  // These tests use FAST_SCOPE_EMPTY (registry constant with forbidden=[]) to verify
  // that when no surfaces are declared, no breach occurs regardless of changed files.

  it("src/core/pipeline/types.ts with empty forbidden → no scope finding", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/core/pipeline/types.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FAST_SCOPE_EMPTY,
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });

  it("src/core/port/runtime-strategy.ts with empty forbidden → no scope finding", async () => {
    // Even a file that would breach with config surfaces produces no finding when forbidden=[]
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy(["src/core/port/runtime-strategy.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FAST_SCOPE_EMPTY,
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });

  it("empty changed files → no scope finding", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategy([]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FAST_SCOPE_EMPTY,
    );

    const step = makeConformanceStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "conformance");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-05-3: checkpoint 単一性 — 非 checkpoint step では scope 合成が走らない
// ---------------------------------------------------------------------------

describe("T-05-3: non-checkpoint step (code-review) → no scope synthesis", () => {
  it("code-review step with FAST_SCOPE_EMPTY and forbidden file → listChangedFiles NOT called", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategyWithSpy(["src/core/port/runtime-strategy.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FAST_SCOPE_EMPTY,
    );

    // Running code-review — NOT the checkpoint (checkpoint is "conformance")
    const step = makeCodeReviewStep();
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    // listChangedFiles should NOT have been called (only checkpoint triggers scope check)
    expect(strategy.listChangedFiles).not.toHaveBeenCalled();

    // verdict should be unaffected (approved)
    const outcome = getLastOutcome(finalState, "code-review");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });

  it("conformance step (the checkpoint) with same scope → listChangedFiles IS called", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeEvaluableStrategyWithSpy(["src/core/pipeline/types.ts"]); // no breach

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FAST_SCOPE_EMPTY,
    );

    const step = makeConformanceStep();
    await executor.execute(step, jobState, makeDeps(strategy));

    // listChangedFiles should have been called for the checkpoint step
    expect(strategy.listChangedFiles).toHaveBeenCalled();
  });
});
