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
import * as os from "node:os";
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
    // rev-parse should NOT be called a second time inside commitAndPush (hasChanges=true)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(1); // only the pre-step capture
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

describe("TC-CAP-NEW-003: staged 0 + HEAD advance + requiresCommit:true → push only, no halt", () => {
  it("does not halt, calls push but not commit, when agent self-committed and HEAD advanced", async () => {
    const jobId = "tc-cap-new-003-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged changes (agent already committed)
        push: { exitCode: 0 },
      },
      ["abc123before", "def456after"], // HEAD advanced (agent self-committed)
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn, noopSleep);

    const step = makeAgentStep({ name: "implementer" });

    // Must NOT throw
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // push must have been called
    expect(subcommands).toContain("push");
    // commit must NOT have been called (push-only path)
    expect(subcommands).not.toContain("commit");
    // Two rev-parse calls: one before step, one inside commitAndPush
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(2);
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

    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 1 }, // staged changes present
        commit: { exitCode: 0 },
        push: { exitCode: 0 },
      },
      ["abc123before", "def456after"], // HEAD advanced (partial agent commit)
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn);

    const step = makeAgentStep({ name: "implementer" });
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // Both commit and push should be called (staged changes take precedence path)
    expect(subcommands).toContain("commit");
    expect(subcommands).toContain("push");
    // Only one rev-parse (before step) — hasChanges=true skips the HEAD comparison
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(1);
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
      ["abc123"], // only one rev-parse call (before step)
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
    // Two rev-parse calls: one before step, one inside commitAndPush (HEAD comparison always runs)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-006: staged 0 + HEAD advance + requiresCommit:false → silent skip (HEAD advance ignored)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-006: staged 0 + HEAD advance → push only (requiresCommit removed, HEAD advance always pushes)", () => {
  it("calls push-only when HEAD advanced and no staged changes, regardless of step config", async () => {
    const jobId = "tc-cap-new-006-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // HEAD advances — T-05: requiresCommit removed, HEAD advance always triggers push
    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged changes
        push: { exitCode: 0 },
      },
      ["abc123before", "def456after"],
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const noopSleep = async (_ms: number) => {};
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir), spawnFn, noopSleep);

    const step = makeAgentStep({ name: "spec-review" });
    const result = await executor.execute(step, state, makeLocalDeps({}, spawnFn));
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // HEAD advanced → push-only path (no staged, agent self-commit)
    expect(subcommands).not.toContain("commit");
    expect(subcommands).toContain("push");
    // Two rev-parse calls: one before step, one inside commitAndPush
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-007: agent self-commit detected → stderr log output
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-007: agent self-commit detected → detection message written to stderr", () => {
  it("writes detection log when HEAD advanced and staged is 0", async () => {
    const jobId = "tc-cap-new-007-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged (agent committed)
        push: { exitCode: 0 },
      },
      ["before-sha-abc", "after-sha-def"], // HEAD advanced
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
    expect(combined).toContain("Detected agent-authored commit(s) since step start");
    expect(combined).toContain("skipping pipeline commit and pushing as-is");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-008: commit:push event emitted on agent self-commit push path
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-008: commit:push event emitted after push-only path", () => {
  it("emits commit:push with step and branch when push succeeds on agent self-commit path", async () => {
    const jobId = "tc-cap-new-008-job";
    const state = makeJobState(jobId, "feat/self-commit-branch");
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 },
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

