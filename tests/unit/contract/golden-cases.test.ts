/**
 * Golden Cases — step-outcome の grounded 検査の回帰ネット（旧 contract/golden-cases.md は retire）
 *
 * このファイルの目的:
 *   grounded な検査（executor typed verdict / VerificationStep.parseResult）が
 *   将来こっそり甘くされても「落ちるべきものが通った」で検出できるよう、
 *   「絶対に通してはいけない入力」「絶対に弾いてはいけない入力」を固定する。
 *
 * R4 で削除した prose-parse floor（parseReviewVerdict TC-018/021）に代わり、
 * R3 で確定した typed 挙動を floor として追加（GC-TYPED-01/02/03）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { VerificationStep } from "../../../src/core/step/verification.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { JUDGE_REPORT_TOOL } from "../../../src/core/step/report-tool.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { JudgeReportResult } from "../../../src/core/port/report-result.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

// ---------------------------------------------------------------------------
// T-03: VerificationStep.parseResult — golden cases
// ---------------------------------------------------------------------------

describe("golden: VerificationStep.parseResult", () => {
  // 最小スタブ: parseResult が使うのは deps.slug のみ
  const minDeps = {
    slug: "test-slug",
    config: { version: 1, agents: {} },
    request: { type: "chore", title: "test", slug: "test-slug", baseBranch: "main", content: "", adr: false },
  } as unknown as StepDeps;

  // must-fail-safe: "## Verdict: failed" → verdict ≠ "passed"（= "failed"）
  it("must-fail-safe: '## Verdict: failed' を入力すると verdict が 'passed' にならない", () => {
    const result = VerificationStep.parseResult("## Verdict: failed\n", minDeps);
    expect(result.verdict).not.toBe("passed");
    expect(result.verdict).toBe("failed");
  });

  // 補強: "## Verdict: passed" → verdict = "passed"（正常パスの floor）
  it("floor: '## Verdict: passed' を入力すると verdict が 'passed' になる", () => {
    const result = VerificationStep.parseResult("## Verdict: passed\n", minDeps);
    expect(result.verdict).toBe("passed");
  });

  // 補強: verdict 行なし → verdict = null（parse 失敗時の safe default）
  it("floor: verdict 行がない場合 verdict が null になる", () => {
    const result = VerificationStep.parseResult("## Summary\n\nNo verdict here.\n", minDeps);
    expect(result.verdict).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GC-TYPED-01/02/03: executor typed verdict derivation — golden cases
//
// executor.finalizeStep の typed path（reportTool を持つ judge step）を直接検証する。
// R3 で確定した typed 挙動を floor として固定。
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "golden-typed-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalJudgeStep(): AgentStep {
  return {
    kind: "agent",
    name: "spec-review",
    agent: {
      name: "specrunner-spec-review",
      role: "spec-review",
      model: "claude-sonnet-4-5",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    reportTool: JUDGE_REPORT_TOOL,
    buildMessage: () => "review message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeMinimalState(jobId: string): JobState {
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

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    agents: {
      "spec-review": { agentId: "agent_02y", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
  };
}

function makeDeps(): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
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
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    },
    owner: "user",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: makeStoreFactory(tempDir),
  };
}

function makeRunnerWithToolResult(toolResult: JudgeReportResult | null): AgentRunner {
  return {
    async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
      return {
        completionReason: "success",
        resultContent: null,
        toolResult,
        followUpAttempts: 0,
      };
    },
  };
}

describe("GC-TYPED-01: judge approved=true → verdict 'approved'", () => {
  it("floor: toolResult.approved=true → executor.finalizeStep が verdict='approved' を記録する", async () => {
    const runner = makeRunnerWithToolResult({ ok: true, approved: true });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));
    const state = makeMinimalState("gc-typed-01");
    const resultState = await executor.execute(makeMinimalJudgeStep(), state, makeDeps());

    const stepRuns = resultState.steps?.["spec-review"];
    expect(stepRuns).toBeDefined();
    expect(stepRuns![stepRuns!.length - 1]!.outcome.verdict).toBe("approved");
  });
});

describe("GC-TYPED-02: judge approved=false ∧ fixableCount=0 → verdict 'needs-fix'", () => {
  it("floor: toolResult.approved=false, fixableCount=0 → 矛盾を弾き verdict='needs-fix' になる", async () => {
    // approved=false なら fixableCount=0 でも verdict は needs-fix（approved になってはいけない）
    const runner = makeRunnerWithToolResult({ ok: false, approved: false, fixableCount: 0 } as JudgeReportResult & { fixableCount: number });
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));
    const state = makeMinimalState("gc-typed-02");
    const resultState = await executor.execute(makeMinimalJudgeStep(), state, makeDeps());

    const stepRuns = resultState.steps?.["spec-review"];
    expect(stepRuns).toBeDefined();
    const verdict = stepRuns![stepRuns!.length - 1]!.outcome.verdict;
    expect(verdict).toBe("needs-fix");
    expect(verdict).not.toBe("approved");
  });
});

describe("GC-TYPED-03: null toolResult (judge step) → verdict 'needs-fix'", () => {
  it("floor: toolResult=null の judge step → executor.finalizeStep が verdict='needs-fix' を記録する", async () => {
    const runner = makeRunnerWithToolResult(null);
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));
    const state = makeMinimalState("gc-typed-03");
    const resultState = await executor.execute(makeMinimalJudgeStep(), state, makeDeps());

    const stepRuns = resultState.steps?.["spec-review"];
    expect(stepRuns).toBeDefined();
    expect(stepRuns![stepRuns!.length - 1]!.outcome.verdict).toBe("needs-fix");
  });
});
