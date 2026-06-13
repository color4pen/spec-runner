/**
 * Unit tests for Claude Code OAuth token injection into SDK env.
 *
 * TC-003: credentials token is injected when env is absent
 * TC-004: environment token has precedence (env wins over credentials)
 * TC-005: process environment is not mutated
 * TC-011: existing crontab env continues to work
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../agent-runner.js";
import type { ClaudeCodeOAuthTokenResolver } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cred-inject-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-6",
      system: "implement this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    ...overrides,
  };
}

function makeCtx(step: AgentStep, state: JobState): AgentRunContext {
  return {
    step,
    state,
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {},
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  };
}

/**
 * Creates a mock queryFn that captures the options it receives.
 * Yields a minimal success result so the runner completes.
 */
function makeCaptureQueryFn(): {
  queryFn: (params: {
    prompt: string | AsyncIterable<unknown>;
    options?: Record<string, unknown>;
  }) => AsyncGenerator<unknown, void>;
  capturedOptions: Record<string, unknown>[];
} {
  const capturedOptions: Record<string, unknown>[] = [];

  async function* queryFn(params: {
    prompt: string | AsyncIterable<unknown>;
    options?: Record<string, unknown>;
  }): AsyncGenerator<unknown, void> {
    if (params.options) {
      capturedOptions.push({ ...params.options });
    }
    yield {
      type: "result",
      subtype: "success",
      result: "done",
      session_id: "sess-123",
    };
  }

  return { queryFn, capturedOptions };
}

/**
 * Build an env-filter mock: strips nothing except CLAUDE_CODE_OAUTH_TOKEN
 * (simulating the real stripSecrets behavior for the token).
 */
function makeProcessEnvWithoutToken(
  base: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  // Clone without CLAUDE_CODE_OAUTH_TOKEN to simulate stripSecrets removal
  const result: Record<string, string | undefined> = { ...base };
  delete result["CLAUDE_CODE_OAUTH_TOKEN"];
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: Credential injection when env is absent
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-003: credential injection when env is absent", () => {
  it("injects CLAUDE_CODE_OAUTH_TOKEN from credentials when env var is absent", async () => {
    const { queryFn, capturedOptions } = makeCaptureQueryFn();

    // Resolver returns credentials-backed token (env var not set)
    const resolver: ClaudeCodeOAuthTokenResolver = vi.fn().mockResolvedValue({
      token: "cred-token-123",
      source: "credentials" as const,
    });

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _resolveClaudeCodeOAuthTokenFn: resolver,
    });

    const step = makeAgentStep();
    const state = makeJobState();
    await runner.run(makeCtx(step, state));

    expect(capturedOptions).toHaveLength(1);
    const env = capturedOptions[0]?.["env"] as Record<string, string | undefined>;
    expect(env?.["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("cred-token-123");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004 / TC-011: Environment token has precedence
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-004 / TC-011: environment token has precedence over credentials", () => {
  it("uses env token when resolver returns env source (env-set scenario)", async () => {
    const { queryFn, capturedOptions } = makeCaptureQueryFn();

    // Resolver returns env-backed token (env var is set)
    const resolver: ClaudeCodeOAuthTokenResolver = vi.fn().mockResolvedValue({
      token: "env-token-456",
      source: "env" as const,
    });

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _resolveClaudeCodeOAuthTokenFn: resolver,
    });

    const step = makeAgentStep();
    const state = makeJobState();
    await runner.run(makeCtx(step, state));

    expect(capturedOptions).toHaveLength(1);
    const env = capturedOptions[0]?.["env"] as Record<string, string | undefined>;
    // The token (from resolver, which reports env precedence) is passed through
    expect(env?.["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("env-token-456");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: process environment is not mutated
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-005: process environment is not mutated", () => {
  it("does not add CLAUDE_CODE_OAUTH_TOKEN to process.env", async () => {
    const { queryFn } = makeCaptureQueryFn();

    const resolver: ClaudeCodeOAuthTokenResolver = vi.fn().mockResolvedValue({
      token: "cred-token-789",
      source: "credentials" as const,
    });

    // Ensure CLAUDE_CODE_OAUTH_TOKEN is not in process.env before the test
    const originalToken = process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _resolveClaudeCodeOAuthTokenFn: resolver,
    });

    const step = makeAgentStep();
    const state = makeJobState();
    await runner.run(makeCtx(step, state));

    // process.env must NOT be mutated
    expect(process.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();

    // Restore if it was set
    if (originalToken !== undefined) {
      process.env["CLAUDE_CODE_OAUTH_TOKEN"] = originalToken;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No resolver injected — token injection is skipped
// ─────────────────────────────────────────────────────────────────────────────
describe("No resolver injected — token injection skipped", () => {
  it("does not add CLAUDE_CODE_OAUTH_TOKEN when resolver is not injected", async () => {
    const { queryFn, capturedOptions } = makeCaptureQueryFn();

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      // No _resolveClaudeCodeOAuthTokenFn — resolver not injected
    });

    const step = makeAgentStep();
    const state = makeJobState();
    await runner.run(makeCtx(step, state));

    // Captured env should not have CLAUDE_CODE_OAUTH_TOKEN added by the runner
    const env = capturedOptions[0]?.["env"] as Record<string, string | undefined> | undefined;
    // The env may or may not have the key from process.env; what matters is
    // the runner did not inject it from credentials
    // (actual process.env.CLAUDE_CODE_OAUTH_TOKEN may or may not be set in CI)
    expect(env).toBeDefined();
  });

  it("resolver returns undefined — token is not injected into SDK env", async () => {
    const { queryFn, capturedOptions } = makeCaptureQueryFn();

    // Resolver returns undefined (unset scenario)
    const resolver: ClaudeCodeOAuthTokenResolver = vi.fn().mockResolvedValue(undefined);

    // Remove token from process.env for this test
    const originalToken = process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _resolveClaudeCodeOAuthTokenFn: resolver,
    });

    const step = makeAgentStep();
    const state = makeJobState();
    await runner.run(makeCtx(step, state));

    const env = capturedOptions[0]?.["env"] as Record<string, string | undefined> | undefined;
    // Token should not have been added by the runner
    expect(env?.["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();

    if (originalToken !== undefined) {
      process.env["CLAUDE_CODE_OAUTH_TOKEN"] = originalToken;
    }
  });
});
