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
import { describe, it, expect } from "vitest";
import { CodeFixerStep, CODE_FIXER_NO_REVIEW_RESULT } from "../../../src/core/step/code-fixer.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/code-fixer-system.js";
import { AGENT_TOOLSET_TYPE } from "../../../src/core/agent/definition.js";
import { buildContinuationMessage } from "../../../src/core/step/fixer-helpers.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { reviewFeedbackPath, changeFolderPath } from "../../../src/util/paths.js";

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
  const findingsPath = reviewFeedbackPath(slug, iteration);
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
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "Fix the code.", enabled: [] },
    slug,
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

  it("step.agent.model === 'claude-sonnet-4-6'", () => {
    // TC-005: implementation/fixer steps use claude-sonnet-4-6 (opusplan pattern)
    expect(CodeFixerStep.agent.model).toBe("claude-sonnet-4-6");
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
    expect(message).toContain(changeFolderPath("my-change"));
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

// ---------------------------------------------------------------------------
// TC-BM-03: code-fixer continuation → short prompt
// ---------------------------------------------------------------------------

describe("TC-BM-03: CodeFixerStep.buildMessage returns short prompt when previous session exists", () => {
  function makeStateWithContinuation(sessionId: string, iteration: number = 1): JobState {
    const findingsPath = reviewFeedbackPath("my-change", iteration);
    return makeMinimalState({
      steps: {
        "code-fixer": [
          {
            attempt: 1,
            sessionId,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        "code-review": [
          {
            attempt: iteration,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
  }

  it("returns exact output of buildContinuationMessage", () => {
    const state = makeStateWithContinuation("sess-code-xyz", 1);
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);

    const findingsPath = reviewFeedbackPath("my-change", 1);
    const expected = buildContinuationMessage({
      stepName: "code-fixer",
      findingsPath,
      slug: "my-change",
    });

    expect(message).toBe(expected);
  });

  it("continuation prompt contains 'reviewer' as source label", () => {
    const state = makeStateWithContinuation("sess-code-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);

    expect(message).toContain("reviewer");
  });

  it("continuation prompt does NOT contain 'You are the code-fixer'", () => {
    const state = makeStateWithContinuation("sess-code-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);

    expect(message).not.toContain("You are the code-fixer");
  });

  it("continuation prompt contains the review-feedback findingsPath", () => {
    const state = makeStateWithContinuation("sess-code-xyz", 2);
    const deps = makeMinimalDeps("my-change");
    const message = CodeFixerStep.buildMessage(state, deps);
    const findingsPath = reviewFeedbackPath("my-change", 2);

    expect(message).toContain(findingsPath);
  });
});

// ---------------------------------------------------------------------------
// TC-BM-04: code-fixer continuation + code-review result absent → CODE_FIXER_NO_REVIEW_RESULT
// ---------------------------------------------------------------------------

describe("TC-BM-04: CodeFixerStep.buildMessage throws CODE_FIXER_NO_REVIEW_RESULT even in continuation mode", () => {
  function makeStateWithFixerRunButNoReview(sessionId: string): JobState {
    // code-fixer has been run before (continuation scenario),
    // but code-review result is absent (guard must still throw)
    return makeMinimalState({
      steps: {
        "code-fixer": [
          {
            attempt: 1,
            sessionId,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        // code-review is intentionally absent
      },
    });
  }

  it("throws SpecRunnerError with CODE_FIXER_NO_REVIEW_RESULT", () => {
    const state = makeStateWithFixerRunButNoReview("sess-code-xyz");
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

  it("guard runs before continuation check — throws even when code-fixer sessionId is set", () => {
    // Verify that having a previous sessionId does NOT bypass the code-review guard
    const state = makeStateWithFixerRunButNoReview("sess-code-xyz");
    const deps = makeMinimalDeps("my-change");

    expect(() => CodeFixerStep.buildMessage(state, deps)).toThrow();
  });
});
