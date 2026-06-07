/**
 * Verbose log instrumentation tests for ManagedAgentRunner (managed runtime).
 *
 * TC-09-01: ManagedAgentRunner.run() → ログに "session created" と runtime: "managed" が記録される
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ManagedAgentRunner } from "../../../../src/adapter/managed-agent/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { SessionClient } from "../../../../src/core/port/session-client.js";
import type { GitHubClient } from "../../../../src/core/port/github-client.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import { specReviewResultPath } from "../../../../src/util/paths.js";
import {
  setLogLevel,
  initVerboseLog,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../../src/logger/stdout.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "managed-runner-verbose-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fsPromises.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(jobId = "tc09-01-job", branch = "feat/test"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

async function persistState(state: JobState): Promise<void> {
  const jobsDir = path.join(tempDir, ".specrunner", "jobs");
  await fsPromises.mkdir(jobsDir, { recursive: true });
  await fsPromises.writeFile(
    path.join(jobsDir, `${state.jobId}.json`),
    JSON.stringify(state, null, 2),
  );
}

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    agents: {
      design: { agentId: "agent_design", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01" },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:xyz", lastSyncedAt: "2026-01-01" },
      "implementer": { agentId: "agent_implementer", definitionHash: "sha256:imh", lastSyncedAt: "2026-01-01" },
      "build-fixer": { agentId: "agent_build_fixer", definitionHash: "sha256:bfh", lastSyncedAt: "2026-01-01" },
      "code-review": { agentId: "agent_code_review", definitionHash: "sha256:crh", lastSyncedAt: "2026-01-01" },
      "code-fixer": { agentId: "agent_code_fixer", definitionHash: "sha256:cfh", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
  };
}

function makePollingStyleStep(name: string, role: string, resultFilePath: string | null = null): AgentStep {
  return {
    kind: "agent" as const,
    name,
    agent: {
      name: `specrunner-${role}`,
      role: role as "spec-review",
      model: "claude-sonnet-4-5",
      system: `system for ${role}`,
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => `message for ${role}`,
    resultFilePath: () => resultFilePath,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: resultFilePath }),
  };
}

function makeMockSessionClient(): SessionClient {
  return {
    createSession: vi.fn().mockResolvedValue({ sessionId: "sess_tc09_01" }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    streamEvents: vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    }),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionClient;
}

function makeMockGithubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue("verdict: approved"),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" as const, mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" as const }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success" as const, total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    ...overrides,
  };
}

/**
 * Close verbose log and read all JSON Lines entries from the log file.
 */
function readLogEntries(logPath: string): Record<string, unknown>[] {
  closeVerboseLog();
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// TC-09-01: managed runtime でセッション作成が記録される
// ---------------------------------------------------------------------------

describe("TC-09-01: ManagedAgentRunner.run() — logs 'session created' with runtime: 'managed'", () => {
  it("セッション作成後にログに 'session created' エントリと runtime: 'managed' が書き出される", async () => {
    const jobId = "tc09-01-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    const state = makeJobState(jobId);
    await persistState(state);

    const sessionClient = makeMockSessionClient();
    const githubClient = makeMockGithubClient();

    const runner = new ManagedAgentRunner({
      sessionClient,
      githubClient,
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
    });

    const ctx: AgentRunContext = {
      step: makePollingStyleStep("spec-review", "spec-review", specReviewResultPath("test-slug", 1)),
      state,
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      input: { requestContent: "request content" },
      session: {},
      policy: {},
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    const entries = readLogEntries(logPath);
    const sessionEntry = entries.find((e) => e["message"] === "session created");
    expect(sessionEntry).toBeDefined();
    expect(sessionEntry!["runtime"]).toBe("managed");
  });
});
