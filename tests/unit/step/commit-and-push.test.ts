/**
 * Unit tests for StepExecutor.commitAndPush() — local runtime git operations.
 *
 * TC-CAP-001: add → diff → commit → push call sequence
 * TC-CAP-002: no staged changes (diff exit 0) + HEAD no advance → silent skip (no error)
 * TC-CAP-003: no staged changes (diff exit 0) + HEAD no advance → silent skip (requiresCommit:false)
 * TC-CAP-004: push failure → retry once → success on second attempt
 * TC-CAP-005: push failure → retry once → second failure → PUSH_FAILED
 * TC-CAP-006: commit message format is "${step.name}: ${slug}"
 * TC-CAP-007: successful push emits commit:push event
 * TC-CAP-008: git add failure (exit 128) → COMMIT_AND_PUSH_FAILED halt (fail-closed)
 * TC-CAP-009: git add failure (any step) → COMMIT_AND_PUSH_FAILED halt (fail-closed)
 * TC-CAP-010: git commit failure → COMMIT_AND_PUSH_FAILED halt, push NOT called
 * TC-CAP-011: git diff exit≥2 → COMMIT_AND_PUSH_FAILED halt (not treated as "no changes")
 * TC-CAP-016: git add spawn failure (ChildProcess error event → ok:false, exitCode:-1) → COMMIT_AND_PUSH_FAILED halt
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
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { gitExec } from "../../../src/util/git-exec.js";
import type { SpawnFn as PipelineSpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import { cleanupOutputTemplates } from "../../../src/core/artifact/copy-artifacts.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commit-push-test-"));
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
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/** Minimal RuntimeStrategy mock that uses the test's git spawnFn for artifact lifecycle. */
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
    async captureHeadSha(cwd: string): Promise<string | null> {
      return gitExec(spawnFn, cwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(
      step: AgentStep,
      state: JobState,
      deps: PipelineDeps,
      headBeforeStep: string | null,
      infra: CommitPushInfra,
    ): Promise<void> {
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

/** Create a mock runner that immediately returns success */
function makeSuccessRunner(): AgentRunner {
  return {
    async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
    },
  };
}

/**
 * Build a mock SpawnFn that simulates git commands.
 *
 * The `calls` array records each git invocation for assertion.
 * The `responses` map overrides exit codes per git subcommand.
 * By default all commands exit 0 (success).
 */
interface GitCallRecord {
  args: string[];
}

function makeGitSpawnFn(opts: {
  responses?: Record<string, { exitCode: number; stdout?: string }>;
} = {}): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const responses = opts.responses ?? {};

  const spawnFn: SpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });

    const subcommand = args[0] ?? "";
    const response = responses[subcommand] ?? { exitCode: 0, stdout: "" };

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

/**
 * Build a SpawnFn that delegates to a base spawnFn except for `push` commands,
 * where it uses a sequence of exit codes.
 */
function makePushSequenceSpawnFn(
  baseFn: SpawnFn,
  pushExitCodes: number[],
  calls: GitCallRecord[],
): SpawnFn {
  let pushCallCount = 0;

  return (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });

    if (args[0] === "push") {
      const exitCode = pushExitCodes[pushCallCount] ?? 1;
      pushCallCount++;

      const procEm = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procAny = procEm as any;
      procAny.stdout = new EventEmitter();
      procAny.stderr = new EventEmitter();
      procAny.stdin = { write: () => true, end: () => {} };
      setImmediate(() => { procEm.emit("close", exitCode); });
      return procEm as unknown as ChildProcess;
    }

    return baseFn(_bin, args, _opts);
  };
}

/**
 * Build a SpawnFn that simulates a spawn failure (ChildProcess error event) for
 * the specified git subcommand. All other commands default to exit 0 (success).
 *
 * When the targeted subcommand is spawned, the returned ChildProcess emits an
 * `error` event instead of a `close` event. This causes `runSubprocess` in
 * git-exec.ts to reject, which `gitExecResult` catches and converts to
 * `{ ok: false, exitCode: -1 }` — the !addResult.ok branch in commitAndPush.
 */
function makeGitSpawnFnWithSpawnError(opts: {
  errorOnSubcommand: string;
}): { spawnFn: SpawnFn; calls: GitCallRecord[] } {
  const calls: GitCallRecord[] = [];
  const { errorOnSubcommand } = opts;

  const spawnFn: SpawnFn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push({ args: [...args] });
    const subcommand = args[0] ?? "";

    const procEm = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEm as any;
    procAny.stdout = new EventEmitter();
    procAny.stderr = new EventEmitter();
    procAny.stdin = { write: () => true, end: () => {} };

    if (subcommand === errorOnSubcommand) {
      // Emit error event → runSubprocess rejects → gitExecResult returns {ok:false, exitCode:-1}
      setImmediate(() => {
        procEm.emit("error", new Error(`Simulated spawn failure for git ${subcommand}`));
      });
    } else {
      // All other commands succeed
      setImmediate(() => { procEm.emit("close", 0); });
    }

    return procEm as unknown as ChildProcess;
  };

  return { spawnFn, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-001: call sequence: add → diff → commit → push
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-001: commitAndPush — correct git call sequence", () => {
  it("calls git add, diff --cached, commit, push in order", async () => {
    const jobId = "tc-cap-001-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        // git add exits 0
        "add": { exitCode: 0 },
        // git diff --cached --quiet exits 1 (staged changes present)
        "diff": { exitCode: 1 },
        // git commit exits 0
        "commit": { exitCode: 0 },
        // git push exits 0
        "push": { exitCode: 0 },
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    const deps = makeLocalDeps({}, spawnFn);
    await executor.execute(step, state, deps);

    const gitSubcommands = calls.map((c) => c.args[0]);
    expect(gitSubcommands).toContain("add");
    expect(gitSubcommands).toContain("diff");
    expect(gitSubcommands).toContain("commit");
    expect(gitSubcommands).toContain("push");

    // Order check: add before diff, diff before commit, commit before push
    const addIdx = gitSubcommands.indexOf("add");
    const diffIdx = gitSubcommands.indexOf("diff");
    const commitIdx = gitSubcommands.indexOf("commit");
    const pushIdx = gitSubcommands.indexOf("push");

    expect(addIdx).toBeLessThan(diffIdx);
    expect(diffIdx).toBeLessThan(commitIdx);
    expect(commitIdx).toBeLessThan(pushIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-002: no staged changes → silent skip (new behavior: no error)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-002: no staged changes → silent skip", () => {
  it("does not throw when diff --cached shows no changes", async () => {
    const jobId = "tc-cap-002-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 0 }, // exit 0 = no staged changes
        "rev-parse": { exitCode: 0, stdout: "abc123\n" },
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    const deps = makeLocalDeps({}, spawnFn);

    await expect(executor.execute(step, state, deps)).resolves.toBeDefined();

    // Should skip commit and push
    const gitSubcommands = calls.map((c) => c.args[0]);
    expect(gitSubcommands).not.toContain("commit");
    expect(gitSubcommands).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-003: requiresCommit:false + no staged changes → silent skip
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-003: requiresCommit:false + no staged changes → silent skip", () => {
  it("does not throw and does not commit when no staged changes and requiresCommit is false", async () => {
    const jobId = "tc-cap-003-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 0 }, // no staged changes
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    // requiresCommit omitted (falsy)
    const step = makeAgentStep({ name: "spec-review" });
    const deps = makeLocalDeps({}, spawnFn);

    await expect(executor.execute(step, state, deps)).resolves.toBeDefined();

    // Commit and push should NOT have been called
    const gitSubcommands = calls.map((c) => c.args[0]);
    expect(gitSubcommands).not.toContain("commit");
    expect(gitSubcommands).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-004: push failure → retry once → success on second attempt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-004: push failure → retry once → success on second push", () => {
  it("retries push once and succeeds on the second attempt", async () => {
    const jobId = "tc-cap-004-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn: baseFn } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 }, // staged changes
        "commit": { exitCode: 0 },
      },
    });

    const overrideCalls: GitCallRecord[] = [];
    // First push fails, second succeeds
    const overriddenSpawnFn = makePushSequenceSpawnFn(baseFn, [1, 0], overrideCalls);

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), overriddenSpawnFn, noopSleep);

    const result = await executor.execute(
      makeAgentStep({ name: "implementer" }),
      state,
      makeLocalDeps({}, overriddenSpawnFn),
    );

    expect(result).toBeDefined();
    // Two push calls: first failed, second succeeded
    const pushCalls = overrideCalls.filter((c) => c.args[0] === "push");
    expect(pushCalls.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-005: push failure → retry → second failure → PUSH_FAILED
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-005: push failure → retry → second failure → PUSH_FAILED", () => {
  it("throws PUSH_FAILED when both push attempts fail", async () => {
    const jobId = "tc-cap-005-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn: baseFn } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
      },
    });

    const overrideCalls: GitCallRecord[] = [];
    // Both push attempts fail
    const overriddenSpawnFn = makePushSequenceSpawnFn(baseFn, [1, 1], overrideCalls);

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), overriddenSpawnFn, noopSleep);

    await expect(
      executor.execute(
        makeAgentStep({ name: "implementer" }),
        state,
        makeLocalDeps({}, overriddenSpawnFn),
      ),
    ).rejects.toMatchObject({
      code: "PUSH_FAILED",
    });

    const pushCalls = overrideCalls.filter((c) => c.args[0] === "push");
    expect(pushCalls.length).toBe(2); // tried twice
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-006: commit message format is "${step.name}: ${slug}"
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-006: commit message format", () => {
  it("commits with message '${step.name}: ${slug}'", async () => {
    const jobId = "tc-cap-006-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "build-fixer" });
    const _deps = makeLocalDeps({ slug: "my-test-slug" }, spawnFn);
    state.steps = {};

    await executor.execute(step, state, makeLocalDeps({ slug: "my-test-slug" }, spawnFn));

    const commitCall = calls.find((c) => c.args[0] === "commit");
    expect(commitCall).toBeDefined();
    // Format: git commit -m "build-fixer: my-test-slug"
    const commitMsgIndex = commitCall!.args.indexOf("-m");
    expect(commitMsgIndex).toBeGreaterThanOrEqual(0);
    const commitMsg = commitCall!.args[commitMsgIndex + 1];
    expect(commitMsg).toBe("build-fixer: my-test-slug");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-007: successful push emits commit:push event
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-007: successful push emits commit:push event", () => {
  it("emits commit:push with step and branch after successful push", async () => {
    const jobId = "tc-cap-007-job";
    const state = makeJobState(jobId, "feat/emit-test");
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 },
        "commit": { exitCode: 0 },
        "push": { exitCode: 0 },
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const emittedEvents: Array<{ step: string; branch: string }> = [];
    events.on("commit:push" as never, (payload: { step: string; branch: string }) => {
      emittedEvents.push(payload);
    });

    const step = makeAgentStep({ name: "implementer" });
    await executor.execute(step, state, makeLocalDeps({}, spawnFn));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]).toMatchObject({
      step: "implementer",
      branch: "feat/emit-test",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-008: git add failure → COMMIT_AND_PUSH_FAILED halt (fail-closed)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-008: git add failure → COMMIT_AND_PUSH_FAILED halt", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git add fails (exit 128)", async () => {
    const jobId = "tc-cap-008-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 128 }, // git operational failure
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    await expect(executor.execute(step, state, makeLocalDeps({}, spawnFn))).rejects.toMatchObject({
      code: "COMMIT_AND_PUSH_FAILED",
    });

    // commit and push must NOT have been attempted
    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-009: git add failure (any step) → COMMIT_AND_PUSH_FAILED halt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-009: git add failure (any step) → COMMIT_AND_PUSH_FAILED halt", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git add fails regardless of step name", async () => {
    const jobId = "tc-cap-009-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 128 }, // git operational failure
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "spec-review" });
    await expect(executor.execute(step, state, makeLocalDeps({}, spawnFn))).rejects.toMatchObject({
      code: "COMMIT_AND_PUSH_FAILED",
    });

    // commit and push must NOT have been attempted
    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-010: git commit failure → COMMIT_AND_PUSH_FAILED halt, push NOT called
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-010: git commit failure → COMMIT_AND_PUSH_FAILED halt, push not called", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git commit fails, without calling push", async () => {
    const jobId = "tc-cap-010-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 1 }, // staged changes present
        "commit": { exitCode: 1 }, // commit fails
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    await expect(executor.execute(step, state, makeLocalDeps({}, spawnFn))).rejects.toMatchObject({
      code: "COMMIT_AND_PUSH_FAILED",
    });

    // push must NOT have been called after commit failure
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-011: git diff exit≥2 → COMMIT_AND_PUSH_FAILED halt (not "no changes")
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-011: git diff --cached exit≥2 → COMMIT_AND_PUSH_FAILED halt", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git diff exits with ≥2 (git error)", async () => {
    const jobId = "tc-cap-011-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFn({
      responses: {
        "add": { exitCode: 0 },
        "diff": { exitCode: 128 }, // git error (not "no changes" nor "has changes")
      },
    });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    await expect(executor.execute(step, state, makeLocalDeps({}, spawnFn))).rejects.toMatchObject({
      code: "COMMIT_AND_PUSH_FAILED",
    });

    // commit and push must NOT have been called
    expect(calls.map((c) => c.args[0])).not.toContain("commit");
    expect(calls.map((c) => c.args[0])).not.toContain("push");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-016: git add spawn failure (ok:false, exitCode:-1) → COMMIT_AND_PUSH_FAILED
//
// TC-016 (test-cases.md, priority: must): verifies the !addResult.ok branch
// in commitAndPush that handles ChildProcess error events (spawn failure), not
// just non-zero exit codes. makeGitSpawnFn only emits close events; this test
// uses makeGitSpawnFnWithSpawnError to emit an error event so runSubprocess
// rejects and gitExecResult returns {ok:false, exitCode:-1}.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-016: git add spawn failure (ChildProcess error event) → COMMIT_AND_PUSH_FAILED halt", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git add spawn fails (ok:false, exitCode:-1)", async () => {
    const jobId = "tc-cap-016-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // Simulates spawn-level failure for `git add`:
    // ChildProcess emits error event → runSubprocess rejects →
    // gitExecResult returns {ok:false, exitCode:-1} → !addResult.ok branch throws.
    const { spawnFn, calls } = makeGitSpawnFnWithSpawnError({ errorOnSubcommand: "add" });

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    await expect(executor.execute(step, state, makeLocalDeps({}, spawnFn))).rejects.toMatchObject({
      code: "COMMIT_AND_PUSH_FAILED",
    });

    // diff, commit, and push must NOT have been attempted after spawn failure
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("diff");
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
  });
});
