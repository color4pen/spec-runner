/**
 * Unit tests for CodeFixerStep
 *
 * TC-006: CodeFixerStep の kind / name / agent.role が AgentStep 規約を満たす (must)
 * TC-007: CodeFixerStep が gitWrite capability = true を持つ (must)
 * TC-008: CodeFixerStep.resultFilePath が null を返す (must)
 * TC-009: CodeFixerStep.parseResult が NULL_PARSE_RESULT を返す (must)
 * TC-010: CodeFixerStep の completionVerdict が "approved" である (must)
 * TC-025: CodeFixerStep.buildMessage が直近の review-feedback パスを埋め込む (should)
 * TC-026: CodeFixerStep.buildMessage が前段 review-feedback 不在時に CODE_FIXER_NO_REVIEW_RESULT を throw する (should)
 */
import { describe, it, expect, vi } from "vitest";
import { CodeFixerStep, CODE_FIXER_NO_REVIEW_RESULT } from "../../../src/core/step/code-fixer.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/code-fixer-system.js";
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
    step: "code-fixer",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStateWithCodeReviewResult(slug: string, iteration: number = 2): JobState {
  const findingsPath = `openspec/changes/${slug}/review-feedback-${String(iteration).padStart(3, "0")}.md`;
  return makeMinimalState({
    steps: {
      "code-review": [
        {
          attempt: iteration,
          sessionId: null,
          outcome: {
            verdict: "needs-fix",
            findingsPath,
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
    request: { type: "feature", title: "Test", slug: "test-slug", content: "Fix the code.", enabled: [] },
    slug,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
    },
  };
}

// TC-006: AgentStep 規約
describe("TC-006: CodeFixerStep の kind / name / agent.role が AgentStep 規約を満たす", () => {
  it("step.kind === 'agent'", () => {
    expect(CodeFixerStep.kind).toBe("agent");
  });

  it("step.name === 'code-fixer'", () => {
    expect(CodeFixerStep.name).toBe("code-fixer");
  });

  it("step.agent.role === 'code-fixer'", () => {
    expect(CodeFixerStep.agent.role).toBe("code-fixer");
  });

  it("step.agent.name === 'specrunner-code-fixer'", () => {
    expect(CodeFixerStep.agent.name).toBe("specrunner-code-fixer");
  });

  it("step.agent.model === 'claude-sonnet-4-5'", () => {
    expect(CodeFixerStep.agent.model).toBe("claude-sonnet-4-5");
  });

  it("step.agent.tools contains agent_toolset_20260401", () => {
    const hasToolset = CodeFixerStep.agent.tools.some(
      (t) => t.type === AGENT_TOOLSET_TYPE,
    );
    expect(hasToolset).toBe(true);
  });

  it("step.agent.system === CODE_FIXER_SYSTEM_PROMPT", () => {
    expect(CodeFixerStep.agent.system).toBe(CODE_FIXER_SYSTEM_PROMPT);
  });
});

// TC-007: gitWrite capability
describe("TC-007: CodeFixerStep が gitWrite capability = true を持つ", () => {
  it("step.agent.capabilities.gitWrite === true", () => {
    expect(CodeFixerStep.agent.capabilities?.gitWrite).toBe(true);
  });
});

// TC-008: resultFilePath returns null
describe("TC-008: CodeFixerStep.resultFilePath が null を返す", () => {
  it("returns null for any state", () => {
    const state = makeStateWithCodeReviewResult("my-change");
    const deps = makeMinimalDeps();
    expect(CodeFixerStep.resultFilePath(state, deps)).toBeNull();
  });

  it("returns null even when steps is empty", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps();
    expect(CodeFixerStep.resultFilePath(state, deps)).toBeNull();
  });
});

// TC-009: parseResult returns NULL_PARSE_RESULT
describe("TC-009: CodeFixerStep.parseResult が NULL_PARSE_RESULT を返す", () => {
  it("returns NULL_PARSE_RESULT for any content", () => {
    const deps = makeMinimalDeps();
    const result = CodeFixerStep.parseResult("any content here", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toBeNull();
    expect(result.fileContent).toBeNull();
  });

  it("returns NULL_PARSE_RESULT for empty string", () => {
    const deps = makeMinimalDeps();
    const result = CodeFixerStep.parseResult("", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
  });
});

// TC-010: completionVerdict = "approved"
describe("TC-010: CodeFixerStep の completionVerdict が 'approved' である", () => {
  it("completionVerdict === 'approved'", () => {
    expect(CodeFixerStep.completionVerdict).toBe("approved");
  });
});

// TC-025: buildMessage embeds latest review-feedback path
describe("TC-025: CodeFixerStep.buildMessage が直近の review-feedback パスを埋め込む", () => {
  it("message contains review-feedback-002.md when iteration=2", () => {
    const state = makeStateWithCodeReviewResult("my-change", 2);
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);
    expect(message).toContain("review-feedback-002.md");
  });

  it("message contains buildGitPushInstruction output (commit / push)", () => {
    const state = makeStateWithCodeReviewResult("my-change", 1);
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);
    expect(message.toLowerCase()).toContain("commit");
    expect(message.toLowerCase()).toContain("push");
  });

  it("message contains <user-request> tags", () => {
    const state = makeStateWithCodeReviewResult("my-change", 1);
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });

  it("message contains slug and branch", () => {
    const state = makeStateWithCodeReviewResult("my-change", 1);
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);
    expect(message).toContain("openspec/changes/my-change");
    expect(message).toContain("feat/my-change");
  });
});

// TC-026: buildMessage throws CODE_FIXER_NO_REVIEW_RESULT when no code-review result
describe("TC-026: CodeFixerStep.buildMessage が前段 review-feedback 不在時に CODE_FIXER_NO_REVIEW_RESULT を throw する", () => {
  it("throws SpecRunnerError with CODE_FIXER_NO_REVIEW_RESULT when state has no code-review steps", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    expect(() => CodeFixerStep.buildMessage(state, deps)).toThrow();
  });

  it("thrown error has code === CODE_FIXER_NO_REVIEW_RESULT", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    let thrown: unknown;
    try {
      CodeFixerStep.buildMessage(state, deps);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe(CODE_FIXER_NO_REVIEW_RESULT);
  });

  it("thrown error message contains 'code-fixer requires code-review result'", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    let thrown: unknown;
    try {
      CodeFixerStep.buildMessage(state, deps);
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error).message).toContain("code-fixer requires code-review result");
  });

  it("error hint contains slug and review-feedback.md", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    let thrown: unknown;
    try {
      CodeFixerStep.buildMessage(state, deps);
    } catch (err) {
      thrown = err;
    }

    const hint = (thrown as { hint?: string }).hint ?? "";
    expect(hint).toContain("my-change");
    expect(hint).toContain("review-feedback-NNN.md");
  });

  it("pure function contract: state is NOT mutated on error", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");

    try {
      CodeFixerStep.buildMessage(state, deps);
    } catch {
      // expected
    }

    expect(state.status).toBe("running");
    expect(state.error).toBeNull();
  });
});

// Regression for workspace-mount-and-propose-boundary
describe("CodeFixerStep.buildMessage — fail-fast on missing branch", () => {
  it("throws BRANCH_NOT_SET when state.branch is null", () => {
    const state = makeStateWithCodeReviewResult("my-change");
    state.branch = null;
    const deps = makeMinimalDeps("my-change");
    expect(() => CodeFixerStep.buildMessage(state, deps)).toThrowError(
      expect.objectContaining({ code: "BRANCH_NOT_SET" }),
    );
  });
});
