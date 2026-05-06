/**
 * Unit tests for BuildFixerStep
 *
 * TC-023: BuildFixerStep の構造検証
 * TC-024: BuildFixerStep.resultFilePath と parseResult
 * TC-016: BUILD_FIXER_NO_VERIFICATION_RESULT error shape
 */
import { describe, it, expect, vi } from "vitest";
import { BuildFixerStep, BUILD_FIXER_NO_VERIFICATION_RESULT } from "../../../src/core/step/build-fixer.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/build-fixer-system.js";
import { AGENT_TOOLSET_TYPE } from "../../../src/core/agent/definition.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "build-fixer",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStateWithVerificationResult(slug: string): JobState {
  return makeMinimalState({
    steps: {
      verification: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "failed",
            findingsPath: `openspec/changes/${slug}/verification-result.md`,
            error: null,
          },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  });
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    client: {} as StepDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", slug: "test-slug", content: "Fix build errors", enabled: [] },
    slug,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
    },
  };
}

// TC-023: BuildFixerStep の構造検証
describe("TC-023: BuildFixerStep 構造検証", () => {
  it("step.kind === 'agent' かつ step.name === 'build-fixer'", () => {
    expect(BuildFixerStep.kind).toBe("agent");
    expect(BuildFixerStep.name).toBe("build-fixer");
  });

  it("step.agent.role === 'build-fixer' かつ model === 'claude-sonnet-4-6'", () => {
    // TC-005: implementation/fixer steps use claude-sonnet-4-6 (opusplan pattern)
    expect(BuildFixerStep.agent.role).toBe("build-fixer");
    expect(BuildFixerStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("step.agent.capabilities.gitWrite === true", () => {
    expect(BuildFixerStep.agent.capabilities?.gitWrite).toBe(true);
  });

  it("step.agent.system === BUILD_FIXER_SYSTEM_PROMPT", () => {
    expect(BuildFixerStep.agent.system).toBe(BUILD_FIXER_SYSTEM_PROMPT);
  });

  it("step.agent.tools に agent_toolset_20260401 が含まれる (TC-033)", () => {
    const hasToolset = BuildFixerStep.agent.tools.some(
      (t) => t.type === AGENT_TOOLSET_TYPE,
    );
    expect(hasToolset).toBe(true);
  });
});

// TC-024: BuildFixerStep.resultFilePath と parseResult
describe("TC-024: BuildFixerStep.resultFilePath と parseResult", () => {
  it("resultFilePath は null を返す", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps();
    expect(BuildFixerStep.resultFilePath(state, deps)).toBeNull();
  });

  it("parseResult は NULL_PARSE_RESULT と deep-equal な値を返す", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps();
    const result = BuildFixerStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toBeNull();
    expect(result.fileContent).toBeNull();
  });
});

// TC-016: BUILD_FIXER_NO_VERIFICATION_RESULT error shape
describe("TC-016: BUILD_FIXER_NO_VERIFICATION_RESULT error shape", () => {
  it("verification result が不在の場合 SpecRunnerError を throw する（state を変更しない）", () => {
    // state.steps["verification"] が空
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    expect(() => BuildFixerStep.buildMessage(state, deps)).toThrow();

    // Pure function contract: state must NOT be mutated
    expect(state.status).toBe("running");
    expect(state.error).toBeNull();
  });

  it("throw した error.code が BUILD_FIXER_NO_VERIFICATION_RESULT", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    let thrown: unknown;
    try {
      BuildFixerStep.buildMessage(state, deps);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe(BUILD_FIXER_NO_VERIFICATION_RESULT);
    expect((thrown as Error).message).toContain("build-fixer requires verification result");
  });

  it("error.hint が slug を含む", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    let thrown: unknown;
    try {
      BuildFixerStep.buildMessage(state, deps);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as { hint?: string }).hint).toContain("my-change");
    expect((thrown as { hint?: string }).hint).toContain("verification-result.md");
  });
});

// buildMessage content
describe("BuildFixerStep.buildMessage 内容検証", () => {
  it("verification result がある場合、slug / branch / verification-result / commit / push / user-request が含まれる", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).toContain("openspec/changes/my-change");
    expect(message).toContain("verification-result.md");
    expect(message).toContain("feat/my-change");
    // buildGitPushInstruction uses "Commit" (capital) — case-insensitive check
    expect(message.toLowerCase()).toContain("commit");
    expect(message.toLowerCase()).toContain("push");
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });

  it("仕様変更禁止の条件が含まれる", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    // build-fixer should prohibit specification changes
    expect(message).toMatch(/NO specification|specification changes|仕様変更禁止/i);
  });
});

// completionVerdict
describe("BuildFixerStep.completionVerdict", () => {
  it("completionVerdict === 'success'", () => {
    expect(BuildFixerStep.completionVerdict).toBe("success");
  });
});

// Regression for workspace-mount-and-propose-boundary
describe("BuildFixerStep.buildMessage — fail-fast on missing branch", () => {
  it("throws BRANCH_NOT_SET when state.branch is null (checked before verification-result lookup)", () => {
    const state = makeStateWithVerificationResult("my-change");
    state.branch = null;
    const deps = makeMinimalDeps("my-change");
    expect(() => BuildFixerStep.buildMessage(state, deps)).toThrowError(
      expect.objectContaining({ code: "BRANCH_NOT_SET" }),
    );
  });
});
