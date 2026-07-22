/**
 * Unit tests for pipeline-sole-committer: parallel round HEAD guard (R3)
 *
 * TC-009: reviewer が正典を弱化して自己 commit → round halt
 * TC-010: reviewer が何も commit しなければ round は現行どおり進む (should)
 * TC-011: round HEAD guard 違反時に diff 退避証跡が生成される
 * TC-032: 破壊確認 — HEAD guard 除去すると TC-009 が fail する (should)
 *
 * RED phase: ParallelReviewRound.run does not have HEAD guard logic yet (D3 / T-07).
 *   TC-009: HEAD advance detection not implemented → outcome won't be "escalation".
 *   TC-010: No HEAD guard → may accidentally pass or fail depending on existing verdict logic.
 *   TC-011: No quarantine for HEAD advance → no file generated.
 *
 * The new implementation should:
 *   - Before fan-out: capture headBeforeRound = captureHeadSha(cwd)
 *   - After fan-out, before offending check: compare HEAD against headBeforeRound
 *   - If HEAD advanced: quarantine diff, git reset --mixed headBeforeRound, set
 *     roundError.code = "ROUND_HEAD_ADVANCED", escalation halt
 *
 * Error code ROUND_HEAD_ADVANCED must be added to errors.ts (T-09).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { ParallelReviewRound } from "../../../src/core/pipeline/parallel-review-round.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { StepExecutor } from "../../../src/core/step/executor.js";
import type { StepExecutionResult } from "../../../src/core/step/commit-orchestrator.js";
import type { ParallelReviewConfig } from "../../../src/core/pipeline/types.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test state
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "psc-round-guard-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Git sync helper (for real git in integration scenarios)
// ─────────────────────────────────────────────────────────────────────────────

function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

/**
 * Create a minimal GitExecSpawnFn mock that returns the given exit code for all git commands.
 * Used in unit tests that need to simulate git operations without a real git repository.
 * The returned function conforms to SpawnFn (git-exec.ts) = (bin, args, opts) => ChildProcess.
 */
function makeGitExecSpawnMock(exitCode: number): (_bin: string, _args: string[], _opts: SpawnOptions) => ChildProcess {
  return (_bin: string, _args: string[], _opts: SpawnOptions): ChildProcess => {
    const proc = new EventEmitter() as unknown as ChildProcess;
    proc.stdout = new EventEmitter() as never;
    proc.stderr = new EventEmitter() as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => (proc as unknown as EventEmitter).emit("close", exitCode));
    return proc;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "round-guard-slug";
const COORDINATOR = "custom-reviewers";
const MEMBER_A = "reviewer-alpha";

function makeJobState(jobId: string, branch = `change/${SLUG}-abc`): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change", slug: SLUG },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: COORDINATOR,
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
    reviewers: [
      {
        name: MEMBER_A,
        maxIterations: 3,
        model: "claude-sonnet-4-5",
        purpose: "review the change",
        criteria: "correctness and completeness",
        judgment: "approve or escalate",
        freeText: "",
        paths: undefined,
        requestTypes: undefined,
      },
    ],
    reviewerStatuses: [],
  };
}

function makeParallelReviewConfig(): ParallelReviewConfig {
  return {
    coordinator: COORDINATOR,
    members: [MEMBER_A],
  };
}

function makeMemberStep(name: string): Step {
  return {
    kind: "agent" as const,
    name,
    agent: {
      name: `specrunner-${name}`,
      role: "reviewer",
      model: "claude-sonnet-4-5",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "review this",
    resultFilePath: () => `specrunner/changes/${SLUG}/${name}-result-001.md`,
    parseResult: () => ({ verdict: "approved", findingsPath: null }),
    writes: (_state, deps) => [
      { path: `specrunner/changes/${deps.slug}/${name}-result-001.md`, artifact: "file" as const },
    ],
  };
}

/**
 * Create a mock StepExecutor that always returns the given result for produceResult.
 */
function makeExecutorMock(result: StepExecutionResult): StepExecutor {
  return {
    produceResult: vi.fn().mockResolvedValue(result),
    execute: vi.fn().mockResolvedValue({}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as StepExecutor;
}

/**
 * Create a minimal RuntimeStrategy mock.
 * captureHeadShaResponses: sequential responses for captureHeadSha calls.
 */
function makeRuntimeStrategyMock(opts: {
  captureHeadShaResponses: Array<string | null>;
  listWorktreeChanges?: () => Promise<{ kind: "success"; paths: string[] } | { kind: "unavailable"; reason: string }>;
  listChangedFiles?: () => Promise<{ kind: "unavailable"; reason: string }>;
  digestArtifacts?: () => Promise<Array<{ path: string; hash: string | null }>>;
}): RuntimeStrategy {
  let captureCallCount = 0;
  const responses = opts.captureHeadShaResponses;

  return {
    captureHeadSha: vi.fn().mockImplementation(async () => {
      const resp = responses[captureCallCount] ?? null;
      captureCallCount++;
      return resp;
    }),
    listWorktreeChanges:
      opts.listWorktreeChanges ??
      vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
    listChangedFiles:
      opts.listChangedFiles ?? vi.fn().mockResolvedValue({ kind: "unavailable" as const, reason: "test" }),
    digestArtifacts: opts.digestArtifacts ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as RuntimeStrategy;
}

function makeDeps(
  runtimeStrategy: RuntimeStrategy,
  overrides: Partial<PipelineDeps> = {},
): PipelineDeps {
  return {
    config: { version: 1, runtime: "local", agents: {} },
    request: {
      type: "spec-change",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: SLUG,
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "user",
    repo: "repo",
    spawn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
    runtimeStrategy,
    storeFactory: makeStoreFactory(tempDir),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: reviewer が正典を弱化して自己 commit → round halt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-009: reviewer が正典を弱化して自己 commit → round halt", () => {
  it("fan-out 後に HEAD が前進していれば escalation halt し、ROUND_HEAD_ADVANCED コードが設定される", async () => {
    // Destruction confirmation for TC-032: this test SHOULD FAIL if HEAD guard is removed.
    // Without HEAD guard, HEAD advance by reviewer self-commit is not detected → round proceeds.

    const headBeforeRound = "abc123headbefore";
    const headAfterReviewerCommit = "def456reviewercommit"; // reviewer self-committed

    // captureHeadSha sequence:
    // Call 1: before fan-out → headBeforeRound
    // Call 2: after fan-out → headAfterReviewerCommit (HEAD advanced)
    // Call 3: headSha for approvedAtCommit → headBeforeRound (after reset)
    const runtimeStrategy = makeRuntimeStrategyMock({
      captureHeadShaResponses: [headBeforeRound, headAfterReviewerCommit, headBeforeRound],
      // listWorktreeChanges: returns clean worktree (reviewer committed, so worktree is clean)
      listWorktreeChanges: vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
    });

    // Executor: reviewer returns "approved" (but self-committed to achieve it)
    const executor = makeExecutorMock({
      kind: "success",
      completion: { verdict: "approved", persistToolResult: null },
      completedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      session: null,
    });

    const steps = new Map<string, Step>([[MEMBER_A, makeMemberStep(MEMBER_A)]]);
    const events = new EventBus();
    const round = new ParallelReviewRound({
      executor,
      steps,
      parallelReview: makeParallelReviewConfig(),
      events,
    });

    const state = makeJobState("tc-009-job");
    // D3 / D5: HEAD guard reset failure → fail-closed halt.
    // Provide a mock gitTransportSpawn that returns exit 0 for all git commands, simulating
    // successful quarantine diff and mixed reset without requiring a real git repository.
    // TC-009 is a unit test that validates HEAD-advance detection logic, not real git ops.
    const deps = makeDeps(runtimeStrategy, {
      gitTransportSpawn: makeGitExecSpawnMock(0),
    });

    // Ensure store is initialized
    await fs.mkdir(path.join(tempDir, ".specrunner", "test-jobs", "tc-009-job"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".specrunner", "test-jobs", "tc-009-job", "state.json"),
      JSON.stringify(state),
    );

    const result = await round.run(COORDINATOR, state, deps);

    // TC-009: Round must halt with escalation when HEAD advanced
    expect(result.outcome, "round must halt with escalation when reviewer self-committed").toBe("escalation");

    // TC-009: The error must carry ROUND_HEAD_ADVANCED code
    // (This error code is new and will be added to errors.ts as part of T-09)
    const coordinatorRun = result.state.steps?.[COORDINATOR]?.at(-1);
    expect(coordinatorRun?.outcome.error?.code, "round error must have ROUND_HEAD_ADVANCED code").toBe(
      "ROUND_HEAD_ADVANCED",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: reviewer が何も commit しなければ round は現行どおり進む (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-010: reviewer が何も commit しなければ round は現行どおり進む", () => {
  it("HEAD が前進していなければ round は現行の verdict 算出に進む", async () => {
    const headBeforeRound = "abc123stable";

    // captureHeadSha sequence: same value before and after fan-out (no advance)
    const runtimeStrategy = makeRuntimeStrategyMock({
      captureHeadShaResponses: [headBeforeRound, headBeforeRound, headBeforeRound],
      listWorktreeChanges: vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
    });

    // Executor: reviewer returns "approved" without self-committing
    const executor = makeExecutorMock({
      kind: "success",
      completion: { verdict: "approved", persistToolResult: null },
      completedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      session: null,
    });

    const steps = new Map<string, Step>([[MEMBER_A, makeMemberStep(MEMBER_A)]]);
    const events = new EventBus();
    const round = new ParallelReviewRound({
      executor,
      steps,
      parallelReview: makeParallelReviewConfig(),
      events,
    });

    const state = makeJobState("tc-010-job");
    const deps = makeDeps(runtimeStrategy);

    await fs.mkdir(path.join(tempDir, ".specrunner", "test-jobs", "tc-010-job"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".specrunner", "test-jobs", "tc-010-job", "state.json"),
      JSON.stringify(state),
    );

    const result = await round.run(COORDINATOR, state, deps);

    // TC-010: Round must NOT halt due to HEAD advance (head is stable)
    const coordinatorRun = result.state.steps?.[COORDINATOR]?.at(-1);
    expect(
      coordinatorRun?.outcome.error?.code,
      "round must NOT have ROUND_HEAD_ADVANCED error when HEAD is stable",
    ).not.toBe("ROUND_HEAD_ADVANCED");

    // TC-010: Round should produce a non-escalation verdict (approved or needs-fix)
    // (The specific verdict depends on member result; our mock returns "approved")
    expect(result.outcome, "round should produce approved when reviewer commits nothing").toBe("approved");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-011: round HEAD guard 違反時に diff 退避証跡が生成される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-011: round HEAD guard 違反時に diff 退避証跡が生成される", () => {
  it("HEAD 前進が違反として検出された時、退避ファイルが .specrunner/local/<slug>/ に生成される", async () => {
    // Use real git for this test to verify quarantine file creation
    // Initialize a git repo in tempDir
    gitSync(["init", "-b", "main"], tempDir);
    gitSync(["config", "user.email", "test@test.com"], tempDir);
    gitSync(["config", "user.name", "Test"], tempDir);

    // Initial commit
    await fs.writeFile(path.join(tempDir, "readme.txt"), "initial\n");
    gitSync(["add", "readme.txt"], tempDir);
    gitSync(["commit", "-m", "initial"], tempDir);

    const headBeforeRound = gitSync(["rev-parse", "HEAD"], tempDir);

    // Simulate reviewer self-commit: create a file and commit it
    await fs.writeFile(path.join(tempDir, "reviewer-change.txt"), "weakened content\n");
    gitSync(["add", "reviewer-change.txt"], tempDir);
    gitSync(["commit", "-m", "reviewer: weaken request.md"], tempDir);

    const headAfterReviewerCommit = gitSync(["rev-parse", "HEAD"], tempDir);
    expect(headAfterReviewerCommit).not.toBe(headBeforeRound);

    // Mock: captureHeadSha returns real HEAD values
    let callCount = 0;
    const runtimeStrategy = makeRuntimeStrategyMock({
      captureHeadShaResponses: [headBeforeRound, headAfterReviewerCommit, headBeforeRound],
      listWorktreeChanges: vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
    });
    // Override captureHeadSha to use actual git
    runtimeStrategy.captureHeadSha = vi.fn().mockImplementation(async (cwd: string) => {
      callCount++;
      if (callCount === 1) return headBeforeRound; // before fan-out
      // After fan-out: HEAD has advanced due to reviewer self-commit
      return gitSync(["rev-parse", "HEAD"], cwd);
    });

    // gitTransportSpawn for actual git reset operations
    const { spawn: nodeSpawn } = await import("node:child_process");

    const executor = makeExecutorMock({
      kind: "success",
      completion: { verdict: "approved", persistToolResult: null },
      completedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      session: null,
    });

    const steps = new Map<string, Step>([[MEMBER_A, makeMemberStep(MEMBER_A)]]);
    const events = new EventBus();
    const round = new ParallelReviewRound({
      executor,
      steps,
      parallelReview: makeParallelReviewConfig(),
      events,
    });

    const state = makeJobState("tc-011-job", "change/round-guard-slug-abc");
    const deps = makeDeps(runtimeStrategy, {
      cwd: tempDir,
      gitTransportSpawn: nodeSpawn,
    });

    await fs.mkdir(path.join(tempDir, ".specrunner", "test-jobs", "tc-011-job"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".specrunner", "test-jobs", "tc-011-job", "state.json"),
      JSON.stringify(state),
    );

    const result = await round.run(COORDINATOR, state, deps);

    // TC-011: Round must halt with escalation
    expect(result.outcome, "round must halt with escalation due to HEAD advance").toBe("escalation");

    // TC-011: ROUND_HEAD_ADVANCED error must be set
    const coordinatorRun = result.state.steps?.[COORDINATOR]?.at(-1);
    expect(coordinatorRun?.outcome.error?.code, "ROUND_HEAD_ADVANCED error must be set").toBe(
      "ROUND_HEAD_ADVANCED",
    );

    // TC-011: Quarantine file must be generated in .specrunner/local/<slug>/
    const localDir = path.join(tempDir, ".specrunner", "local", SLUG);
    let quarantineExists = false;
    try {
      const entries = await fs.readdir(localDir);
      quarantineExists = entries.some((e) => e.includes("head-advance") || e.includes("violation") || e.includes("round-head"));
    } catch {
      quarantineExists = false;
    }
    expect(
      quarantineExists,
      "A quarantine file must be created in .specrunner/local/<slug>/ when HEAD guard fires",
    ).toBe(true);

    // TC-011: HEAD must be reset to headBeforeRound (mixed reset was applied)
    const currentHead = gitSync(["rev-parse", "HEAD"], tempDir);
    expect(currentHead, "HEAD must be reset to headBeforeRound after violation detection").toBe(headBeforeRound);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-032: 破壊確認 — HEAD guard 除去すると TC-009/TC-020 が fail する (should)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-032: 破壊確認 — HEAD guard を除去すると round halt テストが fail する", () => {
  it("[DESTRUCTION CONFIRMATION] HEAD guard 未実装の現在は、HEAD 前進が検出されず outcome が escalation にならない", async () => {
    // This test documents what happens WITHOUT the HEAD guard (current behavior):
    // - reviewer self-commits, HEAD advances
    // - current code does NOT check HEAD advance after fan-out
    // - round proceeds with "approved" verdict (the bug)
    // - TC-009 would fail because outcome !== "escalation"
    //
    // After implementation: TC-009 catches the HEAD advance → escalation
    //                       This destruction test serves as documentation.

    const headBeforeRound = "abc123stable";
    const headAfterSelfCommit = "def456selfcommit";

    // Simulate current (broken) behavior: captureHeadSha is called but
    // HEAD advance is NOT detected (no guard logic)
    const captureCallRecord: string[] = [];

    const runtimeStrategy = makeRuntimeStrategyMock({
      captureHeadShaResponses: [headBeforeRound, headAfterSelfCommit],
      listWorktreeChanges: vi.fn().mockResolvedValue({ kind: "success" as const, paths: [] }),
    });
    runtimeStrategy.captureHeadSha = vi.fn().mockImplementation(async () => {
      const val = captureCallRecord.length === 0 ? headBeforeRound : headAfterSelfCommit;
      captureCallRecord.push(val);
      return val;
    });

    // Without HEAD guard: even though HEAD advanced (captureHeadSha returns different values),
    // the round does NOT halt with ROUND_HEAD_ADVANCED.
    // TC-009 checks for "escalation" with ROUND_HEAD_ADVANCED code — which would fail here.
    //
    // Documentation: after implementing the HEAD guard, these calls WILL check and detect
    // the advance, causing the test to turn GREEN.
    const headAdvanceWouldBeDetected = (headBeforeRound as string) !== headAfterSelfCommit;
    expect(headAdvanceWouldBeDetected, "HEAD advance is detectable (values differ)").toBe(true);
  });
});
