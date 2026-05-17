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
import type { SpawnFn } from "../../../src/util/git-exec.js";
import type { SpawnFn as PipelineSpawnFn } from "../../../src/util/spawn.js";

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

function makeLocalDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
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
      enabled: [],
    },
    slug: "test-slug",
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
    },
    spawn: (async () => ({ exitCode: 0, stdout: "", stderr: "" })) as PipelineSpawnFn,
    ...overrides,
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
      return { completionReason: "success", resultContent: null };
    },
  };
}

interface GitCallRecord {
  args: string[];
}

/**
 * Build a SpawnFn that handles rev-parse as a sequence of SHA values.
 *
 * - revParseSequence: SHAs returned in order per call; last entry is repeated if exhausted.
 * - baseResponses: maps git subcommand → { exitCode, stdout? } for non-rev-parse commands.
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
      response = baseResponses[subcommand] ?? { exitCode: 0, stdout: "" };
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
    const executor = new StepExecutor(events, runner, spawnFn);

    const step = makeAgentStep({ name: "implementer", requiresCommit: true });
    const result = await executor.execute(step, state, makeLocalDeps());
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

describe("TC-CAP-NEW-002: staged 0 + HEAD no advance + requiresCommit:true → NO_COMMIT_DETECTED", () => {
  it("throws NO_COMMIT_DETECTED when no staged changes and HEAD did not advance", async () => {
    const jobId = "tc-cap-new-002-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { spawnFn } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged changes
      },
      ["abc123same", "abc123same"], // HEAD identical before and after
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, spawnFn);

    const step = makeAgentStep({ name: "implementer", requiresCommit: true });
    await expect(executor.execute(step, state, makeLocalDeps())).rejects.toMatchObject({
      code: "NO_COMMIT_DETECTED",
    });
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
    const executor = new StepExecutor(events, runner, spawnFn, noopSleep);

    const step = makeAgentStep({ name: "implementer", requiresCommit: true });

    // Must NOT throw
    const result = await executor.execute(step, state, makeLocalDeps());
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
    const executor = new StepExecutor(events, runner, spawnFn);

    const step = makeAgentStep({ name: "implementer", requiresCommit: true });
    const result = await executor.execute(step, state, makeLocalDeps());
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
    const executor = new StepExecutor(events, runner, spawnFn);

    // requiresCommit omitted (falsy)
    const step = makeAgentStep({ name: "spec-review" });
    const result = await executor.execute(step, state, makeLocalDeps());
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
    // No second rev-parse (requiresCommit false → no HEAD comparison)
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(1); // only the pre-step capture
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CAP-NEW-006: staged 0 + HEAD advance + requiresCommit:false → silent skip (HEAD advance ignored)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CAP-NEW-006: staged 0 + HEAD advance + requiresCommit:false → silent skip", () => {
  it("skips silently without push when requiresCommit is false, even if HEAD advanced", async () => {
    const jobId = "tc-cap-new-006-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // HEAD would advance, but requiresCommit is false so HEAD comparison is never reached
    const { spawnFn, calls } = makeGitSpawnFnWithRevParseSequence(
      {
        add: { exitCode: 0 },
        diff: { exitCode: 0 }, // no staged changes
      },
      ["abc123before", "def456after"],
    );

    const runner = makeSuccessRunner();
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, spawnFn);

    // requiresCommit not set (falsy)
    const step = makeAgentStep({ name: "spec-review" });
    const result = await executor.execute(step, state, makeLocalDeps());
    expect(result).toBeDefined();

    const subcommands = calls.map((c) => c.args[0]);
    // No commit or push — silent skip
    expect(subcommands).not.toContain("commit");
    expect(subcommands).not.toContain("push");
    // No second rev-parse — requiresCommit false exits before HEAD comparison
    const revParseCalls = calls.filter((c) => c.args[0] === "rev-parse");
    expect(revParseCalls.length).toBe(1);
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
    const executor = new StepExecutor(events, runner, spawnFn, noopSleep);

    const stderrMessages: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrMessages.push(String(chunk));
      return true;
    });

    const step = makeAgentStep({ name: "implementer", requiresCommit: true });
    await executor.execute(step, state, makeLocalDeps());

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
    const executor = new StepExecutor(events, runner, spawnFn, noopSleep);

    const emittedEvents: Array<{ step: string; branch: string }> = [];
    events.on("commit:push" as never, (payload: { step: string; branch: string }) => {
      emittedEvents.push(payload);
    });

    const step = makeAgentStep({ name: "implementer", requiresCommit: true });
    await executor.execute(step, state, makeLocalDeps());

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]).toMatchObject({
      step: "implementer",
      branch: "feat/self-commit-branch",
    });
  });
});
