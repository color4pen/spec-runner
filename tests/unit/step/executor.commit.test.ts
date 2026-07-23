/**
 * Unit tests for StepExecutor HEAD comparison logic — agent self-commit tolerance.
 *
 * TC-CAP-NEW-001: staged + HEAD no advance → commit + push (existing behavior, regression check)
 * TC-CAP-NEW-002: staged 0 + HEAD no advance + requiresCommit:true → NO_COMMIT_DETECTED (existing)
 * TC-CAP-NEW-003: staged 0 + HEAD advance + requiresCommit:true → push only, no halt (NEW)
 * TC-CAP-NEW-004: staged + HEAD advance → commit staged + push (mixed scenario)
 * TC-CAP-NEW-005: staged 0 + HEAD no advance + requiresCommit:false → silent skip (existing)
 * TC-CAP-NEW-006: staged 0 + HEAD advance + requiresCommit:false → silent skip (HEAD advance ignored)
 * TC-CAP-NEW-007: agent self-commit detected → stderr log output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Stub fs.access so filterExistingFiles treats all managed paths as existing.
// Real access() rejects for tempDir paths that don't exist, causing stagePaths=[]
// → early return before git add, breaking tests that assert git add call args.
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, access: vi.fn().mockResolvedValue(undefined) };
});
import * as os from "node:os";
import { fold } from "../../../src/store/event-journal.js";
import { EventEmitter } from "node:events";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { gitExec } from "../../../src/util/git-exec.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { SpawnFn as PipelineSpawnFn } from "../../../src/util/spawn.js";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import { cleanupOutputTemplates } from "../../../src/core/artifact/copy-artifacts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-commit-new-test-"));
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
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal RuntimeStrategy mock that delegates git operations to the
 * test's spawnFn (from git-exec.ts). This mirrors what LocalRuntime does at
 * runtime, but uses the test's injectable spawnFn so the test retains control
 * over git responses.
 */
function makeTestRuntimeStrategy(spawnFn: SpawnFn): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): AgentRunner {
      return {
        async run(): Promise<AgentRunResult> {
          return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},

    // Step artifact lifecycle: use test spawnFn for git operations.
    async captureHeadSha(cwd: string): Promise<string | null> {
      return gitExec(spawnFn, cwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> {
      // no-op: tests don't exercise output template file writes
    },
    async finalizeStepArtifacts(
      step: AgentStep,
      state: JobState,
      deps: PipelineDeps,
      headBeforeStep: string | null,
      infra: CommitPushInfra,
    ): Promise<void> {
      // Mirrors LocalRuntime.finalizeStepArtifacts but without logPipelineDiag
      const cwd = deps.cwd ?? process.cwd();
      await cleanupOutputTemplates(cwd, deps.slug, step.name, state);
      await commitAndPush(step, state, deps, headBeforeStep, infra);
    },
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> { /* no-op in tests */ },
    async bootstrapJob(): Promise<import("../../../src/state/schema.js").JobState> { throw new Error("not implemented in test"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs(): Promise<import("../../../src/core/port/runtime-strategy.js").FindingRef[]> { return []; },
    async digestArtifacts(refs: { path: string }[]): Promise<import("../../../src/store/event-journal.js").ArtifactRef[]> {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
    async validateStepOutputs(): Promise<import("../../../src/core/port/output-contract.js").OutputCheckResult> {
      return { violations: [] };
    },
  };
}

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${jobId}.json`), JSON.stringify(state, null, 2));
}

function makeJobState(jobId: string, branch = "feat/test-slug"): JobState {
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
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

function makeLocalDeps(overrides: Partial<PipelineDeps> = {}, gitSpawnFn?: SpawnFn): PipelineDeps {
  return {
    config: {
      version: 1,
      runtime: "local",
      agents: {},
    },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
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
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "user",
    repo: "repo",
    spawn: (async () => ({ exitCode: 0, stdout: "", stderr: "" })) as PipelineSpawnFn,
    runtimeStrategy: gitSpawnFn ? makeTestRuntimeStrategy(gitSpawnFn) : undefined,
    ...overrides,
    storeFactory: overrides.storeFactory ?? makeStoreFactory(tempDir),
  };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-5",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...overrides,
  };
}

function makeSuccessRunner(): AgentRunner {
  return {
    async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
    },
  };
}

interface GitCallRecord {
  args: string[];
}

/**
 * Resolve a git response from baseResponses with priority for diff subcommands.
 *
 * Priority for `diff`:
 * 1. "diff --cached --name-only" — when both --cached and --name-only are present
 * 2. "diff --name-only"          — when --name-only is present (no --cached, e.g. HEAD diff)
 * 3. "diff"                      — fallback (e.g. --cached --quiet)
 *
 * All other subcommands: exact subcommand key lookup.
 */
function resolveGitResponse(
  args: string[],
  baseResponses: Record<string, { exitCode: number; stdout?: string }>,
): { exitCode: number; stdout?: string } {
  const subcommand = args[0] ?? "";

  if (subcommand === "diff") {
    const hasNameOnly = args.includes("--name-only");
    const hasCached = args.includes("--cached");

    if (hasNameOnly && hasCached) {
      const key = "diff --cached --name-only";
      if (baseResponses[key]) return baseResponses[key]!;
    }
    if (hasNameOnly && !hasCached) {
      const key = "diff --name-only";
      if (baseResponses[key]) return baseResponses[key]!;
    }
  }

  return baseResponses[subcommand] ?? { exitCode: 0, stdout: "" };
}

/**
 * Build a SpawnFn that handles rev-parse as a sequence of SHA values.
 *
 * - revParseSequence: SHAs returned in order per call; last entry is repeated if exhausted.
 * - baseResponses: maps git subcommand → { exitCode, stdout? } for non-rev-parse commands.
 *   For `diff`, compound keys are supported (see resolveGitResponse):
 *   - "diff --cached --name-only" for staged file list
 *   - "diff --name-only" for HEAD diff file list (agent self-commit path)
 *   - "diff" for plain exit-code-only checks (e.g. --cached --quiet)
 */
function makeGitSpawnFnWithRevParseSequence(
  baseResponses: Record<string, { exitCode: number; stdout?: string }>,
  revParseSequence: string[],
): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  let revParseCallCount = 0;

  const spawnFn: SpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });
    const subcommand = args[0] ?? "";

    let response: { exitCode: number; stdout?: string };
    if (subcommand === "rev-parse") {
      const sha = revParseSequence[revParseCallCount] ?? revParseSequence[revParseSequence.length - 1] ?? "";
      revParseCallCount++;
      response = sha ? { exitCode: 0, stdout: sha } : { exitCode: 128 };
    } else {
      response = resolveGitResponse(args, baseResponses);
    }

    const procEm = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEm as any;
    const stdoutEm = new EventEmitter();
    procAny.stdout = stdoutEm;
    procAny.stderr = new EventEmitter();
    procAny.stdin = { write: () => true, end: () => {} };

    setImmediate(() => {
      if (response.stdout) {
        stdoutEm.emit("data", Buffer.from(response.stdout));
      }
      procEm.emit("close", response.exitCode);
    });

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-001: staged + HEAD no advance → commit + push (regression check)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-001: staged changes → commit + push (requiresCommit:true, HEAD unchanged)", () => {
  it("commits and pushes when staged changes exist, regardless of HEAD position", async () => {
    const jobId = "tc-cap-new-001-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        status: { exitCode: 0, stdout: " M src/foo.ts\0" }, // guarded mode: non-empty changedPaths → add IS called
        add: { exitCode: 0 },
        diff: { exitCode: 1 }, // staged changes present
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["abc123before", "abc123before"], // HEAD same before and after
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).toContain("add");
    expect(subcommands).toContain("diff");
    expect(subcommands).toContain("commit");
    expect(subcommands).toContain("push");
    // -u binds the worktree branch's upstream to the feature branch itself
    // (branches are created with --no-track, so nothing else sets it).
    const pushArgs = calls.find((c) => c.args[0] === "push")?.args ?? [];
    expect(pushArgs).toContain("-u");
    // rev-parse is called 4x in the synthesis model:
    //   1. Before step (headBeforeStep, via raw gitExec in executor)
    //   2. Inside commitAndPush — headAtEntry (synthesis model HEAD comparison)
    //   3. Inside runInlineEgressCheck — newCommitOid (just-synthesized commit)
    //   4. After finalize — commitOid capture (via runtimeStrategy.captureHeadSha)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-002: staged 0 + HEAD no advance + requiresCommit:true → NO_COMMIT_DETECTED
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-002: staged 0 + HEAD no advance → silent skip (no NO_COMMIT_DETECTED)", () => {
  it("silently skips without commit or push when no staged changes and HEAD did not advance", async () => {
    const jobId = "tc-cap-new-002-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged changes
      },
      ["abc123same", "abc123same"], // HEAD identical before and after
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    // T-05: requiresCommit guard removed — no longer throws NO_COMMIT_DETECTED
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-003: staged 0 + HEAD advance + requiresCommit:true → push only (NEW behavior)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-003: agent self-commit + no pipeline-staged changes → synthesis commit + push", () => {
  it("resets agent commit, re-synthesizes from worktree, commits and pushes", async () => {
    // Synthesis model: when the agent self-commits (HEAD advances), the pipeline:
    //   1. Detects HEAD advance
    //   2. git reset --mixed headBeforeStep (undo agent commit, put changes back in worktree)
    //   3. git status → enumerates agent's changes (now in worktree)
    //   4. git add -- <changedPaths> → stages them
    //   5. git diff --cached → exit 1 (staged changes from reset)
    //   6. git commit → synthesis commit
    //   7. git push
    // The OLD "push-only" path (push agent's commit as-is) is removed in the synthesis model.
    const jobId = "tc-cap-new-003-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        reset: { exitCode: 0 },
        status: { exitCode: 0, stdout: " M src/agent-file.ts\0" }, // agent's changes in worktree after reset
        diff: { exitCode: 1 }, // staged changes present after add
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["abc123before", "def456after"], // HEAD advanced (agent self-committed)
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn, noopSleep);

    const step = makeAgentStep({ name: "implementer" });

    // Must NOT throw — synthesis model handles agent self-commits transparently
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // Synthesis model: reset + status + add + commit + push
    expect(subcommands).toContain("reset");  // mixed reset undoes agent commit
    expect(subcommands).toContain("commit"); // synthesis commit (not push-only)
    expect(subcommands).toContain("push");
    // rev-parse 4x in synthesis model (see TC-CAP-NEW-001 comment)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-004: staged + HEAD advance → commit staged changes + push
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-004: staged changes + HEAD advance → commit staged + push", () => {
  it("commits staged changes and pushes even when agent also self-committed (mixed scenario)", async () => {
    const jobId = "tc-cap-new-004-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // Synthesis model: agent self-commit is detected (HEAD advances), mixed-reset undoes it,
    // then status returns the staged changes, commit+push proceed.
    // Unlike the inspection model, `git diff --name-only` is not called for range inspection.
    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 1 }, // staged changes present (--cached check)
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
        reset: { exitCode: 0 },
        status: { exitCode: 0, stdout: " M src/agent-authored-change.ts\0" },
      },
      ["abc123before", "def456after"], // HEAD advanced (agent self-committed)
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // Synthesis model: reset + status + add + commit + push (agent self-commit subsumed).
    expect(subcommands).toContain("reset");
    expect(subcommands).toContain("commit");
    expect(subcommands).toContain("push");
    // rev-parse 4x in synthesis model:
    //   1. Before step (headBeforeStep)
    //   2. headAtEntry inside commitAndPush
    //   3. runInlineEgressCheck (newCommitOid)
    //   4. After finalize (commitOid capture)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-005: staged 0 + HEAD no advance + requiresCommit:false → silent skip
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-005: staged 0 + HEAD no advance + requiresCommit:false → silent skip", () => {
  it("returns without error and without commit/push when requiresCommit is false", async () => {
    const jobId = "tc-cap-new-005-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged changes
      },
      ["abc123"], // all three rev-parse calls return same SHA (no HEAD advance)
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    // requiresCommit omitted (falsy)
    const step = makeAgentStep({ name: "spec-review" });
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
    // Three rev-parse calls: before step (headBeforeStep) + inside commitAndPush (HEAD comparison) + after finalize (commitOid)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-006: staged 0 + HEAD advance + requiresCommit:false → silent skip (HEAD advance ignored)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-006: agent self-commit + synthesis model → synthesis commit + push", () => {
  it("resets agent commit, re-synthesizes from worktree, commits and pushes", async () => {
    // Synthesis model (see TC-CAP-NEW-003 for detailed description).
    // This test uses a scoped step (spec-review) to verify the synthesis path works
    // for both guarded (implementer) and scoped (spec-review) steps.
    const jobId = "tc-cap-new-006-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        reset: { exitCode: 0 },
        status: { exitCode: 0, stdout: " M src/agent-file.ts\0" }, // agent changes in worktree after reset
        diff: { exitCode: 1 }, // staged changes present after add
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["abc123before", "def456after"],
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn, noopSleep);

    const step = makeAgentStep({ name: "implementer" }); // guarded mode — accepts any changed path
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // Synthesis model: reset undoes agent commit, synthesis commit + push proceed
    expect(subcommands).toContain("reset");
    expect(subcommands).toContain("commit");
    expect(subcommands).toContain("push");
    // rev-parse 4x (see TC-CAP-NEW-001 comment)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-007: agent self-commit detected → stderr log output
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-007: agent self-commit detected → detection message written to stderr", () => {
  it("writes synthesis diagnostic log when HEAD advanced (mixed reset applied)", async () => {
    // Synthesis model: when the agent self-commits, commitAndPush logs the detection
    // and applies git reset --mixed to restore the synthesis baseline. The message
    // reflects the synthesis model (not the old push-only path).
    const jobId = "tc-cap-new-007-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        reset: { exitCode: 0 },
        status: { exitCode: 0, stdout: " M src/agent-file.ts\0" },
        diff: { exitCode: 1 }, // staged after add
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["before-sha-abc", "after-sha-def"], // HEAD advanced (agent self-committed)
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn, noopSleep);

    const stderrMessages: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrMessages.push(String(chunk));
      return true;
    });

    const step = makeAgentStep({ name: "implementer" });
    await executor.execute(step, state, makeLocalDeps({}, spawnFn));

    const combined = stderrMessages.join("");
    // Synthesis model diagnostic log (emitted in commitAndPush when HEAD advances)
    expect(combined).toContain("synthesis: agent self-commit detected");
    expect(combined).toContain("applying mixed reset");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: finalizeStep → appendLineage path exercised when writes() is declared
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-001: finalizeStep records lineage when step declares writes()", () => {
  it("writes a lineage record to events.jsonl after step completes", async () => {
    const jobId = "tc-lineage-001-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        // Non-empty status keeps guarded enumeration consistent with the staged diff below.
        status: { exitCode: 0, stdout: " M src/foo.ts\0" },
        diff: { exitCode: 1 }, // staged changes present
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["abc123before", "abc123before"],
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    // Step declares writes() → triggers lineage recording in finalizeStep
    const step = makeAgentStep({
      name: "implementer",
      writes: (_st, _dep) => [
        { path: "specrunner/changes/test-slug/implementer.md" },
      ],
    });

    await executor.execute(step, state, makeLocalDeps({}, spawnFn));

    // events.jsonl lives in the changeDir assigned by makeStoreFactory
    const eventsPath = path.join(
      tempDir,
      ".specrunner",
      "test-jobs",
      jobId,
      "events.jsonl",
    );
    const content = await fs.readFile(eventsPath, "utf-8");
    const result = fold(content);

    expect(result.lineage).toHaveLength(1);
    expect(result.lineage[0]!.step).toBe("implementer");
    expect(result.lineage[0]!.outputs).toHaveLength(1);
    expect(result.lineage[0]!.outputs[0]!.path).toBe("specrunner/changes/test-slug/implementer.md");
    // digestArtifacts in makeTestRuntimeStrategy returns hash: null
    expect(result.lineage[0]!.outputs[0]!.hash).toBeNull();
    // inputs empty (step.reads not declared)
    expect(result.lineage[0]!.inputs).toHaveLength(0);
  });

  it("does not write lineage when step has no writes() declaration", async () => {
    const jobId = "tc-lineage-001b-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        // Non-empty status keeps guarded enumeration consistent with the staged diff below.
        status: { exitCode: 0, stdout: " M src/foo.ts\0" },
        diff: { exitCode: 1 },
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["abc123", "abc123"],
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    // No writes() — lineage block must be skipped
    const step = makeAgentStep({ name: "implementer" });
    await executor.execute(step, state, makeLocalDeps({}, spawnFn));

    const eventsPath = path.join(
      tempDir,
      ".specrunner",
      "test-jobs",
      jobId,
      "events.jsonl",
    );
    const content = await fs.readFile(eventsPath, "utf-8");
    const result = fold(content);
    expect(result.lineage).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-HALT-001: git add failure → executor.execute rejects (halt path)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-HALT-001: git add failure → executor.execute rejects with COMMIT_AND_PUSH_FAILED", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git add exits non-zero", async () => {
    const jobId = "tc-cap-new-halt-001-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        status: { exitCode: 0, stdout: " M src/foo.ts\0" }, // guarded mode: non-empty changedPaths → add IS reached
        add: { exitCode: 128 }, // git add operational failure
      },
      ["abc123before"], // only pre-step rev-parse
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    await expect(
      executor.execute(step, state, makeLocalDeps({}, spawnFn)),
    ).rejects.toMatchObject({ code: "COMMIT_AND_PUSH_FAILED" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-008: commit:push event emitted on agent self-commit push path
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-008: commit:push event emitted after synthesis commit + push", () => {
  it("emits commit:push with step and branch when synthesis commit push succeeds", async () => {
    // Synthesis model: agent self-commit triggers reset → synthesis commit → push.
    // The commit:push event is emitted from pushOnly after the synthesis push.
    const jobId = "tc-cap-new-008-job";
    const state = makeJobState(jobId, "feat/self-commit-branch");
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        reset: { exitCode: 0 },
        status: { exitCode: 0, stdout: " M src/agent-file.ts\0" },
        diff: { exitCode: 1 }, // staged after add
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["sha-before-111", "sha-after-222"],
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn, noopSleep);

    const emittedEvents: Array<{ step: string; branch: string }> = [];
    events.on("commit:push" as never, (payload: { step: string; branch: string }) => {
      emittedEvents.push(payload);
    });

    const step = makeAgentStep({ name: "implementer" });
    await executor.execute(step, state, makeLocalDeps({}, spawnFn));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]).toMatchObject({
      step: "implementer",
      branch: "feat/self-commit-branch",
    });
  });
});

