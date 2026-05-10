/**
 * Unit tests for ManagedAgentRunner (TC-013 through TC-031)
 *
 * TC-013: ManagedAgentRunner implements AgentRunner interface
 * TC-014: ManagedAgentRunner constructor receives correct deps
 * TC-015: ManagedAgentRunner.run() is semantically equivalent to existing lifecycle
 * TC-016: register_branch tool removed (D4) — file no longer exists
 * TC-017: no source file imports register-branch module
 * TC-018: propose role does not inject register_branch (D4: tool removed)
 * TC-019: register_branch tool removed — adapter does not import it
 * TC-020: prompt includes ctx.branch
 * TC-021: propose uses pre-set ctx.branch from CLI (D4)
 * TC-030: verifyBranch 404 → error
 * TC-031: result file not found → error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ManagedAgentRunner, resolveTimeoutMs } from "../../../../src/adapter/managed-agent/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { SessionClient } from "../../../../src/core/port/session-client.js";
import type { GitHubClient } from "../../../../src/core/port/github-client.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import { specReviewResultPath } from "../../../../src/util/paths.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "managed-agent-runner-test-"));
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

function makeJobState(jobId = "tc-job", branch = "feat/test"): JobState {
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
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(
    path.join(jobsDir, `${state.jobId}.json`),
    JSON.stringify(state, null, 2),
  );
}

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    anthropic: { apiKey: "sk-test" },
    agents: {
      propose: { agentId: "agent_propose", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01" },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:xyz", lastSyncedAt: "2026-01-01" },
      "implementer": { agentId: "agent_implementer", definitionHash: "sha256:imh", lastSyncedAt: "2026-01-01" },
      "build-fixer": { agentId: "agent_build_fixer", definitionHash: "sha256:bfh", lastSyncedAt: "2026-01-01" },
      "code-review": { agentId: "agent_code_review", definitionHash: "sha256:crh", lastSyncedAt: "2026-01-01" },
      "code-fixer": { agentId: "agent_code_fixer", definitionHash: "sha256:cfh", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    ...overrides,
  };
}

function makePollingStyleStep(name: string, role: string, resultFilePath: string | null = null): AgentStep {
  return {
    kind: "agent",
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
    createSession: vi.fn().mockResolvedValue({ sessionId: "sess_mock_001" }),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    streamEvents: vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: true,
      terminated: false,
      terminationReason: "end_turn" as const,
    }),
  } as SessionClient;
}

function makeMockGithubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeCtx(
  overrides: Partial<AgentRunContext> = {},
  jobId = "test-job",
): AgentRunContext {
  const state = makeJobState(jobId);
  return {
    step: makePollingStyleStep("spec-review", "spec-review"),
    state,
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    requestContent: "request content",
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-013: ManagedAgentRunner implements AgentRunner interface
// ---------------------------------------------------------------------------

describe("TC-013: ManagedAgentRunner implements AgentRunner interface", () => {
  it("ManagedAgentRunner has run() method", () => {
    const runner = new ManagedAgentRunner({
      sessionClient: makeMockSessionClient(),
      githubClient: makeMockGithubClient(),
      repo: { owner: "testowner", name: "testrepo" },
    });
    expect(typeof runner.run).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-014: ManagedAgentRunner constructor receives correct deps
// ---------------------------------------------------------------------------

describe("TC-014: ManagedAgentRunner constructor receives sessionClient, githubClient, repo", () => {
  it("can be constructed with sessionClient, githubClient, and repo", () => {
    const sessionClient = makeMockSessionClient();
    const githubClient = makeMockGithubClient();
    const repo = { owner: "testowner", name: "testrepo" };

    expect(() => new ManagedAgentRunner({ sessionClient, githubClient, repo })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-015: ManagedAgentRunner.run() is equivalent to existing lifecycle (polling-style)
// ---------------------------------------------------------------------------

describe("TC-015: ManagedAgentRunner.run() is equivalent to existing lifecycle", () => {
  it("polling-style step: session created, message sent, polled, result fetched → success", async () => {
    const jobId = "tc015-job";
    const state = makeJobState(jobId);
    await persistState(state);

    const sessionClient = makeMockSessionClient();
    const githubClient = makeMockGithubClient({
      getRawFile: vi.fn().mockResolvedValue("verdict: approved"),
    });

    const runner = new ManagedAgentRunner({
      sessionClient,
      githubClient,
      repo: { owner: "testowner", name: "testrepo" },
    });

    const ctx = makeCtx(
      {
        step: makePollingStyleStep("spec-review", "spec-review", specReviewResultPath("test-slug", 1)),
        state,
      },
      jobId,
    );

    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(sessionClient.createSession).toHaveBeenCalledTimes(1);
    expect(sessionClient.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(sessionClient.pollUntilComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-016: register_branch tool has been removed (D4)
// ---------------------------------------------------------------------------

describe("TC-016: register_branch tool removed (D4)", () => {
  it("register-branch.ts does NOT exist in adapter/managed-agent/tools/", async () => {
    const toolsDir = path.resolve(__dirname, "../../../../src/adapter/managed-agent/tools");
    try {
      await fs.access(toolsDir);
    } catch {
      return; // directory doesn't exist → register-branch.ts can't exist
    }
    const files = await fs.readdir(toolsDir);
    const hasBranchTool = files.some((f) => f.includes("register-branch"));
    expect(hasBranchTool).toBe(false);
  });

  it("register_branch does NOT exist in src/core/tools/ (only types.ts remains)", async () => {
    const coreToolsDir = path.resolve(__dirname, "../../../../src/core/tools");
    const files = await fs.readdir(coreToolsDir);
    const hasBranchTool = files.some((f) => f.includes("register-branch"));
    expect(hasBranchTool).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017: no file in src imports register-branch module
// ---------------------------------------------------------------------------

describe("TC-017: no source file imports register-branch (removed in D4)", () => {
  it("no file in src/core/ imports register-branch module", async () => {
    const coreDir = path.resolve(__dirname, "../../../../src/core");

    async function scanDir(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...(await scanDir(full)));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const content = await fs.readFile(full, "utf-8");
          const importPattern = /from\s+["'][^"']*register-branch["']/;
          if (importPattern.test(content)) {
            matches.push(full);
          }
        }
      }
      return matches;
    }

    const matches = await scanDir(coreDir);
    expect(matches).toHaveLength(0);
  });

  it("no file in src/adapter/ imports register-branch module", async () => {
    const adapterDir = path.resolve(__dirname, "../../../../src/adapter");

    async function scanDir(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...(await scanDir(full)));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const content = await fs.readFile(full, "utf-8");
          const importPattern = /from\s+["'][^"']*register-branch["']/;
          if (importPattern.test(content)) {
            matches.push(full);
          }
        }
      }
      return matches;
    }

    const matches = await scanDir(adapterDir);
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-018: propose role — no register_branch in toolHandlers (D4)
// ---------------------------------------------------------------------------

describe("TC-018: propose role — register_branch not in toolHandlers (D4: tool removed)", () => {
  it("for propose role: streamEvents is called WITHOUT register_branch in toolHandlers", async () => {
    const jobId = "tc018-job";
    const state = makeJobState(jobId, "feat/test-slug-tc018abc");

    await persistState(state);

    let capturedToolHandlers: Map<string, unknown> | undefined;

    const sessionClient: SessionClient = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess_018" }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockImplementation((_sessionId, opts: { toolHandlers?: Map<string, unknown> }) => {
        capturedToolHandlers = opts.toolHandlers;
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: true,
          terminated: false,
          terminationReason: "end_turn" as const,
        });
      }),
    };

    const githubClient = makeMockGithubClient();

    const runner = new ManagedAgentRunner({
      sessionClient,
      githubClient,
      repo: { owner: "testowner", name: "testrepo" },
    });

    const proposeStep: AgentStep = {
      kind: "agent",
      name: "propose",
      agent: {
        name: "specrunner-propose",
        role: "propose",
        model: "claude-sonnet-4-5",
        system: "propose system",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "propose message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const ctx: AgentRunContext = {
      step: proposeStep,
      state,
      branch: "feat/test-slug-tc018abc",
      slug: "test-slug",
      cwd: tempDir,
      requestContent: "request content",
      config: makeConfig(),
      emit: vi.fn(),
    };

    try {
      await runner.run(ctx);
    } catch {
      // May throw during verification
    }

    // TC-018 (updated): register_branch must NOT be in toolHandlers (tool removed in D4)
    expect(capturedToolHandlers).toBeDefined();
    expect(capturedToolHandlers?.has("register_branch")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-019: register_branch tool removed — adapter does not import it
// ---------------------------------------------------------------------------

describe("TC-019: register_branch tool removed (D4)", () => {
  it("ManagedAgentRunner source does not import from register-branch", async () => {
    const agentRunnerPath = path.resolve(__dirname, "../../../../src/adapter/managed-agent/agent-runner.ts");
    const content = await fs.readFile(agentRunnerPath, "utf-8");
    expect(content).not.toMatch(/from.*register-branch/);
  });

  it("PROPOSE_SYSTEM_PROMPT does not contain register_branch instruction", async () => {
    const { PROPOSE_SYSTEM_PROMPT } = await import("../../../../src/prompts/propose-system.js");
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain("register_branch");
  });
});

// ---------------------------------------------------------------------------
// TC-020: prompt includes ctx.branch
// ---------------------------------------------------------------------------

describe("TC-020: ManagedAgentRunner includes ctx.branch in prompt", () => {
  it("streamEvents opts.branch matches ctx.branch for propose", async () => {
    const jobId = "tc020-job";
    const state = makeJobState(jobId, "");
    await persistState(state);

    let capturedBranch: string | undefined;

    const sessionClient: SessionClient = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess_020" }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockImplementation((_sid, opts: { branch?: string }) => {
        capturedBranch = opts.branch;
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: true,
          terminated: false,
          terminationReason: "end_turn" as const,
        });
      }),
    };

    const runner = new ManagedAgentRunner({
      sessionClient,
      githubClient: makeMockGithubClient(),
      repo: { owner: "testowner", name: "testrepo" },
    });

    const proposeStep: AgentStep = {
      kind: "agent",
      name: "propose",
      agent: { name: "specrunner-propose", role: "propose", model: "claude-sonnet-4-5", system: "propose", tools: [] },
      toolHandlers: undefined,
      buildMessage: () => "propose",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    try {
      await runner.run({
        step: proposeStep,
        state,
        branch: "feat/foo-bar",
        slug: "foo-bar",
        cwd: tempDir,
        requestContent: "content",
        config: makeConfig(),
        emit: vi.fn(),
      });
    } catch {
      // May throw if register_branch not called — we only need capturedBranch
    }

    // TC-020: branch must be passed to streamEvents opts
    expect(capturedBranch).toBe("feat/foo-bar");
  });
});

// ---------------------------------------------------------------------------
// TC-021: ctx.branch is pre-set by CLI (D4 — register_branch removed)
// ---------------------------------------------------------------------------

describe("TC-021: propose uses pre-set ctx.branch from CLI (D4)", () => {
  it("createSession is called with ctx.branch when branch is pre-set", async () => {
    const jobId = "tc021-job";
    const state = makeJobState(jobId, "feat/foo-bar-tc021abc");
    await persistState(state);

    let capturedBranchInSession: string | undefined;

    const sessionClient: SessionClient = {
      createSession: vi.fn().mockImplementation((params: { branch?: string }) => {
        capturedBranchInSession = params.branch;
        return Promise.resolve({ sessionId: "sess_021" });
      }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockResolvedValue({
        sseDisconnected: false,
        idleEndTurnDetected: true,
        terminated: false,
        terminationReason: "end_turn" as const,
      }),
    };

    const runner = new ManagedAgentRunner({
      sessionClient,
      githubClient: makeMockGithubClient(),
      repo: { owner: "testowner", name: "testrepo" },
    });

    const proposeStep: AgentStep = {
      kind: "agent",
      name: "propose",
      agent: { name: "specrunner-propose", role: "propose", model: "claude-sonnet-4-5", system: "propose", tools: [] },
      toolHandlers: undefined,
      buildMessage: () => "propose",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    try {
      await runner.run({
        step: proposeStep,
        state,
        branch: "feat/foo-bar-tc021abc",
        slug: "foo-bar",
        cwd: tempDir,
        requestContent: "content",
        config: makeConfig(),
        emit: vi.fn(),
      });
    } catch {
      // May throw during verification
    }

    // TC-021 (updated): session is created with the pre-set CLI branch
    expect(capturedBranchInSession).toBe("feat/foo-bar-tc021abc");
  });
});

// ---------------------------------------------------------------------------
// TC-030: verifyBranch 404 → completionReason error (via warning)
// ---------------------------------------------------------------------------

describe("TC-030: ManagedAgentRunner.verifyBranch — branch not found → warning", () => {
  it("when verifyBranch returns false, execution continues with a warning (non-fatal)", async () => {
    const jobId = "tc030-job";
    const state = makeJobState(jobId);
    await persistState(state);

    const githubClient = makeMockGithubClient({
      verifyBranch: vi.fn().mockResolvedValue(false), // branch not found
      getRawFile: vi.fn().mockResolvedValue(null),
    });

    const runner = new ManagedAgentRunner({
      sessionClient: makeMockSessionClient(),
      githubClient,
      repo: { owner: "testowner", name: "testrepo" },
    });

    const ctx = makeCtx(
      {
        step: makePollingStyleStep("spec-review", "spec-review", null),
        state,
      },
      jobId,
    );

    // Should not throw — verifyBranch failure is non-fatal (warning only)
    const result = await runner.run(ctx);
    expect(result.completionReason).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// TC-026/TC-027: resolveTimeoutMs — 0 → null (SSE fallback path + direct poll path)
// TC-028: resolveTimeoutMs — null → DEFAULT_POLL_TIMEOUT_MS
// TC-029: resolveTimeoutMs — 正数はそのまま
// TC-032: resolveTimeoutMs — 未設定(null) → DEFAULT_POLL_TIMEOUT_MS
// ---------------------------------------------------------------------------

describe("resolveTimeoutMs — 0 → null (TC-026/TC-027: タイムアウト無効)", () => {
  it("timeoutMs: 0 は null に変換される（pollUntilComplete にタイムアウトなしで渡す）", () => {
    expect(resolveTimeoutMs(0)).toBeNull();
  });
});

describe("resolveTimeoutMs — null → DEFAULT_POLL_TIMEOUT_MS (TC-028/TC-032)", () => {
  it("timeoutMs: null は DEFAULT_POLL_TIMEOUT_MS (900000ms) にフォールバックする", () => {
    expect(resolveTimeoutMs(null)).toBe(900_000);
  });
});

describe("resolveTimeoutMs — 正数はそのまま (TC-029)", () => {
  it("timeoutMs: 30000 は 30000 のまま渡される", () => {
    expect(resolveTimeoutMs(30000)).toBe(30000);
  });

  it("timeoutMs: 1 は 1 のまま渡される（下限境界値）", () => {
    expect(resolveTimeoutMs(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-031: result file not found → completionReason error
// ---------------------------------------------------------------------------

describe("TC-031: managed adapter result file not found → error", () => {
  it("getRawFile returning null → run() throws (propagated as error)", async () => {
    const jobId = "tc031-job";
    const state = makeJobState(jobId);
    await persistState(state);

    const githubClient = makeMockGithubClient({
      getRawFile: vi.fn().mockResolvedValue(null), // file not found
    });

    const runner = new ManagedAgentRunner({
      sessionClient: makeMockSessionClient(),
      githubClient,
      repo: { owner: "testowner", name: "testrepo" },
    });

    // Step has a resultFilePath (expects a file to exist)
    const ctx = makeCtx(
      {
        step: makePollingStyleStep("spec-review", "spec-review", specReviewResultPath("test-slug", 1)),
        state,
      },
      jobId,
    );

    // Result file not found should throw or return error
    await expect(runner.run(ctx)).rejects.toMatchObject({
      code: expect.stringMatching(/NOT_FOUND|RESULT_FILE/),
    });
  });
});
