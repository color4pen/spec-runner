/**
 * Unit tests for materializeScopedCodexAuth (credential containment for Codex runs).
 *
 * (a) authJson absent / empty → null (no ChatGPT auth configured)
 * (b) OPENAI_API_KEY set → null (API-key auth takes precedence; no file materialized)
 * (c) materializes auth.json (0600) inside a fresh temp CODEX_HOME with exact content
 * (d) cleanup removes the CODEX_HOME directory entirely and is idempotent
 * (e) run() wiring: default factory env carries CODEX_HOME (not CODEX_AUTH_JSON),
 *     auth.json exists during the run, and the CODEX_HOME dir is removed afterwards
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { materializeScopedCodexAuth, CodexAgentRunner } from "../../../../src/adapter/codex/agent-runner.js";
import type { CodexInstance, CodexThread } from "../../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

const AUTH_JSON = '{"tokens":{"access_token":"test-access","refresh_token":"test-refresh"}}';

describe("materializeScopedCodexAuth", () => {
  it("(a) returns null when authJson is undefined or empty", async () => {
    expect(await materializeScopedCodexAuth(undefined, undefined)).toBeNull();
    expect(await materializeScopedCodexAuth("", undefined)).toBeNull();
  });

  it("(b) returns null when OPENAI_API_KEY is set (API-key auth precedence)", async () => {
    expect(await materializeScopedCodexAuth(AUTH_JSON, "sk-test")).toBeNull();
  });

  it("(c) materializes auth.json with exact content and 0600 mode in a temp CODEX_HOME", async () => {
    const scoped = await materializeScopedCodexAuth(AUTH_JSON, undefined);
    expect(scoped).not.toBeNull();
    try {
      const authPath = path.join(scoped!.codexHome, "auth.json");
      expect(await fs.readFile(authPath, "utf8")).toBe(AUTH_JSON);
      const stat = await fs.stat(authPath);
      expect(stat.mode & 0o777).toBe(0o600);
      // CODEX_HOME contains only the auth file
      expect(await fs.readdir(scoped!.codexHome)).toEqual(["auth.json"]);
    } finally {
      await scoped!.cleanup();
    }
  });

  it("(c) two materializations get distinct CODEX_HOME dirs", async () => {
    const a = await materializeScopedCodexAuth(AUTH_JSON, undefined);
    const b = await materializeScopedCodexAuth(AUTH_JSON, undefined);
    try {
      expect(a!.codexHome).not.toBe(b!.codexHome);
    } finally {
      await a!.cleanup();
      await b!.cleanup();
    }
  });

  it("(d) cleanup removes the directory and is idempotent", async () => {
    const scoped = await materializeScopedCodexAuth(AUTH_JSON, undefined);
    await scoped!.cleanup();
    await expect(fs.stat(scoped!.codexHome)).rejects.toThrow();
    // Second cleanup must not throw (force remove)
    await scoped!.cleanup();
  });
});

// ---------------------------------------------------------------------------
// (e) run() wiring through the default factory path (_loadSdkFn injection)
// ---------------------------------------------------------------------------

function makeMockThread(responseText: string): CodexThread {
  return {
    id: "mock-thread-id",
    runStreamed: async (_prompt: string, _opts?: unknown) => {
      async function* generate() {
        yield { type: "item.completed", item: { type: "agent_message", text: responseText } };
        yield { type: "turn.completed" };
      }
      return { events: generate() };
    },
  };
}

function makeJobState(): JobState {
  return {
    version: 2,
    jobId: "scoped-auth-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "request-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "request-review",
    agent: {
      name: "specrunner-request-review",
      role: "request-review",
      model: "gpt-5.6-sol",
      system: "review this request",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "review the request",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(cwd: string): AgentRunContext {
  const config: SpecRunnerConfig = { version: 1, runtime: "local", agents: {} };
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {},
    requestType: "bug-fix",
    config,
    emit: () => {},
  } as AgentRunContext;
}

describe("(e) CodexAgentRunner.run() scoped-auth wiring", () => {
  let tempDir: string;
  const savedAuthJson = process.env["CODEX_AUTH_JSON"];
  const savedApiKey = process.env["OPENAI_API_KEY"];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "scoped-auth-test-"));
    process.env["CODEX_AUTH_JSON"] = AUTH_JSON;
    delete process.env["OPENAI_API_KEY"];
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (savedAuthJson === undefined) delete process.env["CODEX_AUTH_JSON"];
    else process.env["CODEX_AUTH_JSON"] = savedAuthJson;
    if (savedApiKey === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = savedApiKey;
  });

  it("factory env carries CODEX_HOME with live auth.json; CODEX_AUTH_JSON is stripped; dir removed after run", async () => {
    let capturedOpts: { env?: Record<string, string>; apiKey?: string } | undefined;
    let authExistedDuringRun = false;

    const thread = makeMockThread("done");
    class FakeCodex {
      constructor(opts?: { env?: Record<string, string>; apiKey?: string }) {
        capturedOpts = opts;
      }
      startThread(): CodexThread {
        const home = capturedOpts?.env?.["CODEX_HOME"];
        if (home !== undefined) {
          authExistedDuringRun = existsSync(path.join(home, "auth.json"));
        }
        return thread;
      }
      resumeThread(): CodexThread {
        return thread;
      }
    }

    const runner = new CodexAgentRunner({
      _loadSdkFn: async () => ({ Codex: FakeCodex as unknown as new (opts?: { env?: Record<string, string>; apiKey?: string }) => CodexInstance }),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("success");
    expect(capturedOpts?.env?.["CODEX_HOME"]).toBeDefined();
    expect(capturedOpts?.env?.["CODEX_AUTH_JSON"]).toBeUndefined();
    expect(capturedOpts?.apiKey).toBeUndefined();
    expect(authExistedDuringRun).toBe(true);
    // Cleanup: the scoped CODEX_HOME must be gone after run() returns
    expect(existsSync(capturedOpts!.env!["CODEX_HOME"]!)).toBe(false);
  });

  it("with OPENAI_API_KEY set, no CODEX_HOME is injected and apiKey is forwarded", async () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    let capturedOpts: { env?: Record<string, string>; apiKey?: string } | undefined;
    const thread = makeMockThread("done");
    class FakeCodex {
      constructor(opts?: { env?: Record<string, string>; apiKey?: string }) {
        capturedOpts = opts;
      }
      startThread(): CodexThread {
        return thread;
      }
      resumeThread(): CodexThread {
        return thread;
      }
    }

    const runner = new CodexAgentRunner({
      _loadSdkFn: async () => ({ Codex: FakeCodex as unknown as new (opts?: { env?: Record<string, string>; apiKey?: string }) => CodexInstance }),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("success");
    expect(capturedOpts?.env?.["CODEX_HOME"]).toBeUndefined();
    expect(capturedOpts?.apiKey).toBe("sk-test");
  });
});
