/**
 * Integration test: ClaudeCodeRunner ↔ StepExecutor boundary (TC-146)
 *
 * Regression guard for review-feedback-001 finding #1/#2:
 * Verifies that when ClaudeCodeRunner is wired into StepExecutor via the
 * local runtime path, state.steps and state.history are correctly populated
 * after a successful agent step execution.
 *
 * TC-146: StepExecutor + ClaudeCodeRunner integration — state.steps and
 *         state.history populated after local-runtime agent step
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { ClaudeCodeRunner } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { SpawnFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

let tempDir: string;
let originalClaudeBin: string | undefined;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-executor-integration-"));
  originalClaudeBin = process.env["CLAUDE_BIN"];
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["CLAUDE_BIN"] = "/fake/claude";
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalClaudeBin !== undefined) {
    process.env["CLAUDE_BIN"] = originalClaudeBin;
  } else {
    delete process.env["CLAUDE_BIN"];
  }
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(jobId: string): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Integration Test", type: "feature", slug: "integration-test" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "feat/integration-test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    anthropic: { apiKey: "" },
    agents: {},
    github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
  };
}

/**
 * Create a fake spawn function that:
 * - For the claude binary: writes a result file to cwd as a side effect, then exits 0
 * - For git: returns success no-op
 */
function makeLocalSpawnFn(opts: {
  resultRelPath?: string;
  resultContent?: string;
  exitCode?: number;
}): SpawnFn {
  const { resultRelPath, resultContent = "", exitCode = 0 } = opts;

  return (_bin: string, _args: string[], spawnOpts: SpawnOptions): ChildProcess => {
    const cwd = (spawnOpts.cwd as string) ?? "";

    const stdinEmitter = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdinAny = stdinEmitter as any;
    stdinAny.write = (): boolean => true;
    stdinAny.end = (): void => {
      // Side effect: write result file if configured
      const doWork = async (): Promise<void> => {
        if (resultRelPath && resultContent) {
          const filePath = path.join(cwd, resultRelPath);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, resultContent, "utf-8");
        }
        procAny.emit("close", exitCode);
      };
      void doWork();
    };

    const procEmitter = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procAny = procEmitter as any;
    procAny.stdin = stdinAny;
    procAny.stdout = new EventEmitter();
    procAny.stderr = new EventEmitter();

    return procEmitter as unknown as ChildProcess;
  };
}

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${jobId}.json`), JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// TC-146: Integration — ClaudeCodeRunner + StepExecutor state propagation
// ---------------------------------------------------------------------------

describe("TC-146: ClaudeCodeRunner + StepExecutor — local runtime state propagation", () => {
  it("state.steps['spec-review'] and state.history are populated after successful local-runtime agent step", async () => {
    const jobId = "tc146-integration-job";
    const resultRelPath = "openspec/changes/integration-test/spec-review-result-001.md";
    const resultContent = "**Verdict**: approved\n";

    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    const spawnFn = makeLocalSpawnFn({ resultRelPath, resultContent });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-5",
        system: "review this",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "review this",
      resultFilePath: () => resultRelPath,
      parseResult: (content: string) => ({
        verdict: content.includes("approved") ? ("approved" as const) : ("needs-fix" as const),
        findingsPath: resultRelPath,
      }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: {
        type: "feature",
        title: "Integration Test",
        slug: "integration-test",
        content: "test content",
        enabled: [],
      },
      slug: "integration-test",
      repo: { owner: "testowner", name: "testrepo" },
      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
      },
      cwd: tempDir,
    };

    const verdictEvents: string[] = [];
    events.on("verdict:parsed", (payload) => {
      const p = payload as { step: string; outcome: { verdict: string | null } };
      verdictEvents.push(`${p.step}:${p.outcome.verdict}`);
    });

    const resultState = await executor.execute(step, initialState, deps);

    // Assert state.steps["spec-review"] is populated with a step result
    const stepResults = resultState.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    expect(Array.isArray(stepResults)).toBe(true);
    expect(stepResults!.length).toBeGreaterThan(0);

    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    // StepRun shape: outcome.verdict
    expect(lastResult.outcome.verdict).toBe("approved");

    // Assert state.history has a verdict entry
    const verdictHistoryEntry = resultState.history.find(
      (h) => h.step === "spec-review-verdict" && h.status === "ok",
    );
    expect(verdictHistoryEntry).toBeDefined();
    expect(verdictHistoryEntry?.message).toContain("approved");

    // Assert verdict:parsed event was emitted with correct verdict
    expect(verdictEvents).toContain("spec-review:approved");

    // Assert state was persisted to disk
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    const persisted = JSON.parse(
      await fs.readFile(path.join(jobsDir, `${jobId}.json`), "utf-8"),
    ) as JobState;
    expect(persisted.steps?.["spec-review"]).toBeDefined();
  });

  it("state.steps has a failed step result when ClaudeCodeRunner returns completionReason='error'", async () => {
    const jobId = "tc146-error-job";
    const initialState = makeJobState(jobId);
    await seedJobState(jobId, initialState);

    // spawn exits with non-zero → ClaudeCodeRunner returns completionReason="error"
    const spawnFn = makeLocalSpawnFn({ exitCode: 1 });
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _spawnFn: spawnFn });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner);

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-5",
        system: "review this",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "review this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    const config = makeConfig();
    const deps: PipelineDeps = {
      config,
      request: {
        type: "feature",
        title: "Integration Test",
        slug: "integration-test",
        content: "test content",
        enabled: [],
      },
      slug: "integration-test",
      repo: { owner: "testowner", name: "testrepo" },
      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
      },
      cwd: tempDir,
    };

    // executor.execute should throw (attach state and rethrow)
    await expect(executor.execute(step, initialState, deps)).rejects.toMatchObject({
      code: "CLAUDE_CODE_SUBPROCESS_FAILED",
    });

    // Persisted state should have a failed step result
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    const persisted = JSON.parse(
      await fs.readFile(path.join(jobsDir, `${jobId}.json`), "utf-8"),
    ) as JobState;
    const stepResults = persisted.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    expect(Array.isArray(stepResults)).toBe(true);
    expect(stepResults!.length).toBeGreaterThan(0);

    const lastResult = stepResults![stepResults!.length - 1] as StepRun;
    expect(lastResult.outcome.verdict).toBeNull();
    expect(lastResult.outcome.error).toBeDefined();
  });
});
