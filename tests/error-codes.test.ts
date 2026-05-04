/**
 * Behavior invariance tests: error code preservation.
 *
 * TC-004 (this file): ERROR_CODES.SESSION_TIMEOUT does not exist (removed)
 * TC-005 (this file): sessionTimeoutError helper does not exist (removed)
 * TC-023 (this file): SESSION_TERMINATED preserved
 * TC-024 (this file): BRANCH_NOT_REGISTERED preserved
 * TC-025 (this file): CONFIG_INCOMPLETE preserved
 * TC-026 (this file): Named codes + STATE_FILE_INVALID preserved collectively
 *
 * Also asserts STATE_FILE_INVALID (review-feedback raised it).
 *
 * Source: proposal.md — Behavior Invariance (CRITICAL); tasks.md — 7.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ERROR_CODES,
  sessionTerminatedError,
  branchNotRegisteredError,
  stateFileInvalidError,
  configIncompleteError,
} from "../src/errors.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "error-codes-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

// -------------------------------------------------------------------------
// TC-004: ERROR_CODES.SESSION_TIMEOUT が存在しない (remove-session-timeout 削除済み)
// -------------------------------------------------------------------------
describe("TC-004: ERROR_CODES.SESSION_TIMEOUT は存在しない", () => {
  it("ERROR_CODES に SESSION_TIMEOUT キーが含まれない", () => {
    expect((ERROR_CODES as Record<string, unknown>)["SESSION_TIMEOUT"]).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// TC-005: sessionTimeoutError ヘルパーが存在しない (remove-session-timeout 削除済み)
// -------------------------------------------------------------------------
describe("TC-005: sessionTimeoutError ヘルパーはエクスポートされていない", () => {
  it("errors モジュールから sessionTimeoutError がインポートできない（undefined になる）", async () => {
    const errorsModule = await import("../src/errors.js");
    expect((errorsModule as Record<string, unknown>)["sessionTimeoutError"]).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// TC-023: SESSION_TERMINATED code preserved
// -------------------------------------------------------------------------
describe("TC-023 (error-codes): SESSION_TERMINATED code is preserved", () => {
  it("sessionTerminatedError produces code === 'SESSION_TERMINATED'", () => {
    const err = sessionTerminatedError();
    expect(err.code).toBe("SESSION_TERMINATED");
  });

  it("ERROR_CODES.SESSION_TERMINATED string value is 'SESSION_TERMINATED'", () => {
    expect(ERROR_CODES.SESSION_TERMINATED).toBe("SESSION_TERMINATED");
  });
});

// -------------------------------------------------------------------------
// TC-024: BRANCH_NOT_REGISTERED code preserved
// -------------------------------------------------------------------------
describe("TC-024 (error-codes): BRANCH_NOT_REGISTERED code is preserved", () => {
  it("branchNotRegisteredError produces code === 'BRANCH_NOT_REGISTERED'", () => {
    const err = branchNotRegisteredError();
    expect(err.code).toBe("BRANCH_NOT_REGISTERED");
  });

  it("ERROR_CODES.BRANCH_NOT_REGISTERED string value is 'BRANCH_NOT_REGISTERED'", () => {
    expect(ERROR_CODES.BRANCH_NOT_REGISTERED).toBe("BRANCH_NOT_REGISTERED");
  });
});

// -------------------------------------------------------------------------
// TC-025: CONFIG_INCOMPLETE code preserved
// -------------------------------------------------------------------------
describe("TC-025 (error-codes): CONFIG_INCOMPLETE code is preserved", () => {
  it("configIncompleteError produces code === 'CONFIG_INCOMPLETE'", () => {
    const err = configIncompleteError("agentId");
    expect(err.code).toBe("CONFIG_INCOMPLETE");
  });

  it("ERROR_CODES.CONFIG_INCOMPLETE string value is 'CONFIG_INCOMPLETE'", () => {
    expect(ERROR_CODES.CONFIG_INCOMPLETE).toBe("CONFIG_INCOMPLETE");
  });

  it("getAgentId throws CONFIG_INCOMPLETE when agents.propose.id is missing", async () => {
    const { getAgentId } = await import("../src/config/getAgentId.js");
    const configWithoutAgents = {
      version: 1 as const,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      // No agents.propose — should throw CONFIG_INCOMPLETE
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] as string[] },
    };
    expect(() => getAgentId(configWithoutAgents, "propose")).toThrow(
      expect.objectContaining({ code: "CONFIG_INCOMPLETE" }),
    );
  });
});

// -------------------------------------------------------------------------
// TC-026: All 5 named error codes collectively preserved + STATE_FILE_INVALID
// -------------------------------------------------------------------------
describe("TC-026 (error-codes): All 5 named codes + STATE_FILE_INVALID collectively preserved", () => {
  it("SPEC_REVIEW_RETRIES_EXHAUSTED is in ERROR_CODES", () => {
    expect(ERROR_CODES.SPEC_REVIEW_RETRIES_EXHAUSTED).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });

  it("Pipeline sets SPEC_REVIEW_RETRIES_EXHAUSTED when loop guard fires", async () => {
    const { Pipeline } = await import("../src/core/pipeline/pipeline.js");
    const { STANDARD_TRANSITIONS } = await import("../src/core/pipeline/types.js");
    const { EventBus } = await import("../src/core/event/event-bus.js");
    const { StepExecutor } = await import("../src/core/step/executor.js");
    type PipelineDeps = import("../src/core/types.js").PipelineDeps;
    type Step = import("../src/core/step/types.js").Step;
    type StepExecutorType = InstanceType<typeof StepExecutor>;

    const state = {
      version: 1 as const,
      jobId: "err-code-test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" as const },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "propose",
      status: "running" as const,
      branch: null,
      history: [],
      error: null,
      steps: {},
    } as import("../src/state/schema.js").JobState;

    const proposeResult = { ...state, status: "running" as const, branch: "feat/test" };

    const events = new EventBus();
    let specReviewCall = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "propose") return proposeResult;
      if (step.name === "spec-fixer") return { ...proposeResult };
      if (step.name === "spec-review") {
        const iter = ++specReviewCall;
        const existingRuns = iter === 1
          ? []
          : [{ iteration: 1, session: null, verdict: "needs-fix", findingsPath: null, completedAt: "2026-01-01", error: null }];
        return {
          ...proposeResult,
          status: "running" as const,
          steps: {
            "spec-review": [
              ...existingRuns,
              { iteration: iter, session: null, verdict: "needs-fix" as const, findingsPath: null, completedAt: "2026-01-01", error: null },
            ],
          },
        };
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const mockStep = (name: string): Step => ({
      kind: "agent",
      name,
      agent: { name: "test", role: name as any, model: "claude-sonnet-4-5", system: "", tools: [] },
      buildMessage: () => "",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    });

    const pipeline = new Pipeline({
      steps: new Map([
        ["propose",     mockStep("propose")],
        ["spec-review", mockStep("spec-review")],
        ["spec-fixer",  mockStep("spec-fixer")],
      ]),
      transitions: STANDARD_TRANSITIONS,
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutorType,
      events,
      loopName: "spec-review",
    });

    const result = await pipeline.run("propose", state, {
      client: {} as PipelineDeps["client"],
      config: {
        version: 1,
        anthropic: { apiKey: "sk-test" },
        agents: { propose: { agentId: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" } },
        environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
        github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
      },
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug: "test-slug", content: "content", enabled: [] },
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    });

    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });

  it("STATE_FILE_INVALID is in ERROR_CODES and stateFileInvalidError produces that code", () => {
    expect(ERROR_CODES.STATE_FILE_INVALID).toBe("STATE_FILE_INVALID");
    const err = stateFileInvalidError("/path/to/file.json", "version mismatch");
    expect(err.code).toBe("STATE_FILE_INVALID");
  });

  it("4 named codes are defined as string literals in ERROR_CODES (SESSION_TIMEOUT removed)", () => {
    const requiredCodes = [
      "SESSION_TERMINATED",
      "BRANCH_NOT_REGISTERED",
      "SPEC_REVIEW_RETRIES_EXHAUSTED",
      "CONFIG_INCOMPLETE",
    ] as const;

    for (const code of requiredCodes) {
      expect(ERROR_CODES[code as keyof typeof ERROR_CODES]).toBe(code);
    }
  });
});
