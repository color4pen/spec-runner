/**
 * Unit tests for src/core/steps/spec-fixer.ts
 * TC-029: runSpecFixerStep — success: verdict=null, findingsPath=null recorded
 * TC-030: runSpecFixerStep — session create params have no Custom Tools, has github_repository
 * TC-031: runSpecFixerStep — findingsPath=null → SPEC_FIXER_NO_FINDINGS (must)
 * TC-032: runSpecFixerStep — initial message contains XML wrapper, path, branch, commit, push (should)
 * TC-033: runSpecFixerStep — SESSION_TERMINATED → status=failed (should)
 * TC-035: runSpecFixerStep — specFixer getAgentId no legacy fallback → CONFIG_INCOMPLETE (must)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runSpecFixerStep } from "../../../src/core/steps/spec-fixer.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import { pushStepResult } from "../../../src/state/helpers.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-fixer-test-"));
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

function makeStateWithSpecReview(findingsPath: string | null = "openspec/changes/test-slug/spec-review-result-001.md"): JobState {
  let state: JobState = {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "success",
    branch: "feat/test-branch",
    history: [],
    error: null,
    steps: {},
  };

  state = pushStepResult(state, "spec-review", {
    session: { id: "sess_spec_review", agentId: "agent_001", environmentId: "env_001" },
    verdict: "needs-fix",
    findingsPath,
    completedAt: "2026-01-01T00:00:00.000Z",
    error: null,
  });

  return state;
}

function buildDepsWithSpecFixer(
  sessionStatus: "idle" | "terminated" | "timeout" = "idle",
  retrieveStatus?: string,
): PipelineDeps {
  const sessionId = "sess_spec_fixer_001";

  return {
    client: {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: sessionId, type: "session" }),
          retrieve: vi.fn().mockResolvedValue({
            id: sessionId,
            status: retrieveStatus ?? (sessionStatus === "idle" ? "idle" : sessionStatus),
          }),
          events: {
            send: vi.fn().mockResolvedValue({}),
            stream: vi.fn(),
          },
        },
      },
    } as unknown as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agent: { id: "agent_propose", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      agents: {
        propose: { id: "agent_propose", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
        specFixer: { id: "agent_spec_fixer", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
  };
}

function buildDepsWithoutSpecFixer(): PipelineDeps {
  return {
    client: {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: "sess_001", type: "session" }),
          retrieve: vi.fn().mockResolvedValue({ id: "sess_001", status: "idle" }),
          events: {
            send: vi.fn().mockResolvedValue({}),
            stream: vi.fn(),
          },
        },
      },
    } as unknown as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agent: { id: "agent_propose", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      // No agents.specFixer configured
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
  };
}

// TC-029: runSpecFixerStep — 正常完了で verdict=null, findingsPath=null が記録される
describe("TC-029: runSpecFixerStep — success: records verdict=null, findingsPath=null", () => {
  it("records spec-fixer result with verdict=null, findingsPath=null, error=null on idle completion", async () => {
    const state = makeStateWithSpecReview("openspec/changes/test-slug/spec-review-result-001.md");
    const deps = buildDepsWithSpecFixer("idle");

    const result = await runSpecFixerStep(state, deps);

    const specFixerArr = result.steps?.["spec-fixer"];
    expect(specFixerArr).toBeDefined();
    const last = specFixerArr?.[specFixerArr.length - 1];
    expect(last?.verdict).toBeNull();
    expect(last?.findingsPath).toBeNull();
    expect(last?.error).toBeNull();
    expect(last?.completedAt).toBeDefined();
  });
});

// TC-030: runSpecFixerStep — セッション作成パラメータに Custom Tool が含まれない
describe("TC-030: runSpecFixerStep — session create params have no tools, has github_repository", () => {
  it("does not include tools in sessions.create call, includes github_repository in resources", async () => {
    const state = makeStateWithSpecReview();
    const deps = buildDepsWithSpecFixer("idle");

    await runSpecFixerStep(state, deps);

    const createSpy = deps.client.beta.sessions.create as ReturnType<typeof vi.fn>;
    expect(createSpy).toHaveBeenCalled();

    const createParams = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    // No tools/custom_tools in create params
    expect(createParams?.["tools"]).toBeUndefined();
    expect(createParams?.["custom_tools"]).toBeUndefined();

    // Has github_repository in resources
    const resources = createParams?.["resources"] as Array<Record<string, unknown>>;
    expect(resources).toBeDefined();
    const hasGithub = resources?.some((r) => r["type"] === "github_repository");
    expect(hasGithub).toBe(true);
  });
});

// TC-031: runSpecFixerStep — findingsPath が null の場合に SPEC_FIXER_NO_FINDINGS で失敗
describe("TC-031: runSpecFixerStep — SPEC_FIXER_NO_FINDINGS when findingsPath is null", () => {
  it("returns state with status=failed and error.code=SPEC_FIXER_NO_FINDINGS when findingsPath is null", async () => {
    const state = makeStateWithSpecReview(null); // findings path is null
    const deps = buildDepsWithSpecFixer("idle");

    const result = await runSpecFixerStep(state, deps);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("SPEC_FIXER_NO_FINDINGS");
  });
});

// TC-032: runSpecFixerStep — 初回メッセージに findings ファイルパス・ブランチ・commit/push 指示が含まれる (should)
describe("TC-032: runSpecFixerStep — initial message contains required content", () => {
  it("includes XML delimiters, findings path, branch, commit, push in initial message", async () => {
    const findingsPath = "openspec/changes/test-slug/spec-review-result-001.md";
    const state = makeStateWithSpecReview(findingsPath);
    const deps = buildDepsWithSpecFixer("idle");

    await runSpecFixerStep(state, deps);

    const sendSpy = deps.client.beta.sessions.events?.send as ReturnType<typeof vi.fn>;
    expect(sendSpy).toHaveBeenCalled();

    const sendArgs = sendSpy.mock.calls[0];
    const eventsPayload = sendArgs?.[1] as { events: Array<{ content: Array<{ text: string }> }> };
    const messageText = eventsPayload?.events?.[0]?.content?.[0]?.text ?? "";

    expect(messageText).toContain("<user-request>");
    expect(messageText).toContain("</user-request>");
    expect(messageText).toContain("spec-review-result-001.md");
    expect(messageText).toContain("feat/test-branch");
    expect(messageText).toContain("commit");
    // The message has "Push" (capitalized) for the push instruction
    expect(messageText.toLowerCase()).toContain("push");
  });
});

// TC-033: runSpecFixerStep — SESSION_TERMINATED で state.status=failed (should)
describe("TC-033: runSpecFixerStep — SESSION_TERMINATED results in status=failed", () => {
  it("throws with attached state having status=failed and SESSION_TERMINATED error when session is terminated", async () => {
    const state = makeStateWithSpecReview();

    // Mock retrieve to return "terminated"
    const deps: PipelineDeps = {
      ...buildDepsWithSpecFixer(),
      client: {
        beta: {
          sessions: {
            create: vi.fn().mockResolvedValue({ id: "sess_001", type: "session" }),
            retrieve: vi.fn().mockResolvedValue({ id: "sess_001", status: "terminated" }),
            events: {
              send: vi.fn().mockResolvedValue({}),
              stream: vi.fn(),
            },
          },
        },
      } as unknown as PipelineDeps["client"],
    };

    // runSpecFixerStep throws on SESSION_TERMINATED, attaching state to the error
    let caughtState: JobState | undefined;
    try {
      await runSpecFixerStep(state, deps);
      expect.fail("should have thrown");
    } catch (err) {
      caughtState = (err as { state?: JobState }).state;
    }

    expect(caughtState).toBeDefined();
    expect(caughtState?.status).toBe("failed");
    const specFixerArr = caughtState?.steps?.["spec-fixer"];
    const last = specFixerArr?.[specFixerArr.length - 1];
    expect(last?.error?.code).toBe("SESSION_TERMINATED");
  });
});

// TC-035: runSpecFixerStep — specFixer ロールで getAgentId を呼び、legacy fallback 不可を検証
describe("TC-035: runSpecFixerStep — CONFIG_INCOMPLETE when agents.specFixer not configured", () => {
  it("returns state with status=failed and error.code=CONFIG_INCOMPLETE when no specFixer config", async () => {
    const state = makeStateWithSpecReview();
    const deps = buildDepsWithoutSpecFixer();

    const result = await runSpecFixerStep(state, deps);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("CONFIG_INCOMPLETE");
  });
});
