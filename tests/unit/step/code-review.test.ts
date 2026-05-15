/**
 * Unit tests for CodeReviewStep
 *
 * TC-001: CodeReviewStep の kind / name / agent.role が AgentStep 規約を満たす (must)
 * TC-002: CodeReviewStep の agent.name / model / tools が仕様値と一致する (must)
 * TC-003: CodeReviewStep は gitWrite capability を持たない (must)
 * TC-004: CodeReviewStep.resultFilePath が zero-padded 3 桁の iteration 番号を持つパスを返す (must)
 * TC-005: CodeReviewStep.parseResult が共通 helper 経由で verdict を抽出する (must)
 * TC-036: CodeReviewStep.parseResult が verdict 行なしのコンテンツで escalation フォールバックする (could)
 */
import { describe, it, expect } from "vitest";
import { CodeReviewStep, buildReviewFeedbackPath } from "../../../src/core/step/code-review.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/code-review-system.js";
import { AGENT_TOOLSET_TYPE } from "../../../src/core/agent/definition.js";
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
    step: "code-review",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "Fix the code.", enabled: [] },
    slug,
  };
}

// TC-001: AgentStep 規約
describe("TC-001: CodeReviewStep の kind / name / agent.role が AgentStep 規約を満たす", () => {
  it("step.kind === 'agent'", () => {
    expect(CodeReviewStep.kind).toBe("agent");
  });

  it("step.name === 'code-review'", () => {
    expect(CodeReviewStep.name).toBe("code-review");
  });

  it("step.agent.role === 'code-review'", () => {
    expect(CodeReviewStep.agent.role).toBe("code-review");
  });
});

// TC-002: agent.name / model / tools
describe("TC-002: CodeReviewStep の agent.name / model / tools が仕様値と一致する", () => {
  it("step.agent.name === 'specrunner-code-review'", () => {
    expect(CodeReviewStep.agent.name).toBe("specrunner-code-review");
  });

  it("step.agent.model === 'claude-opus-4-6[1m]'", () => {
    // TC-004: design/review steps use claude-opus-4-6[1m] (opusplan pattern)
    expect(CodeReviewStep.agent.model).toBe("claude-opus-4-6[1m]");
  });

  it("step.agent.tools contains agent_toolset_20260401", () => {
    const hasToolset = CodeReviewStep.agent.tools.some(
      (t) => t.type === AGENT_TOOLSET_TYPE,
    );
    expect(hasToolset).toBe(true);
  });

  it("step.agent.system === CODE_REVIEW_SYSTEM_PROMPT", () => {
    expect(CodeReviewStep.agent.system).toBe(CODE_REVIEW_SYSTEM_PROMPT);
  });
});

// TC-003: gitWrite: true (updated by review-exit-contract — Managed Agents require agent-driven push)
describe("TC-003: CodeReviewStep は gitWrite: true capability を持つ（Managed Agents 制約）", () => {
  it("step.agent.capabilities.gitWrite === true", () => {
    expect(CodeReviewStep.agent.capabilities?.gitWrite).toBe(true);
  });
});

// TC-004: resultFilePath zero-padded
describe("TC-004: CodeReviewStep.resultFilePath が zero-padded 3 桁の iteration 番号を持つパスを返す", () => {
  it("returns review-feedback-001.md for first iteration (no existing steps)", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-slug");
    const result = CodeReviewStep.resultFilePath(state, deps);
    expect(result).toContain("review-feedback-001.md");
    expect(result).toContain(`${changeFolderPath("my-slug")}/`);
  });

  it("returns review-feedback-002.md for second iteration", () => {
    const state = makeMinimalState({
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath: reviewFeedbackPath("my-slug", 1), error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const deps = makeMinimalDeps("my-slug");
    const result = CodeReviewStep.resultFilePath(state, deps);
    expect(result).toContain("review-feedback-002.md");
  });

  it("buildReviewFeedbackPath produces zero-padded path — TC-013: must match reviewFeedbackPath", () => {
    expect(buildReviewFeedbackPath("my-slug", 1)).toBe(reviewFeedbackPath("my-slug", 1));
    expect(buildReviewFeedbackPath("my-slug", 10)).toBe(reviewFeedbackPath("my-slug", 10));
  });
});

// TC-005: parseResult via shared helper
describe("TC-005: CodeReviewStep.parseResult が共通 helper 経由で verdict を抽出する", () => {
  it("extracts 'needs-fix' from review-feedback content", () => {
    const deps = makeMinimalDeps();
    const content = "# Code Review\n\n- **verdict**: needs-fix\n\n## Findings\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
  });

  it("extracts 'approved' from review-feedback content", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: approved\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });

  it("extracts 'escalation' from review-feedback content", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: escalation\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("escalation");
  });
});

// TC-036: fallback to escalation when no verdict line
describe("TC-036: CodeReviewStep.parseResult が verdict 行なしのコンテンツで escalation フォールバックする", () => {
  it("returns 'escalation' when content has no verdict line", () => {
    const deps = makeMinimalDeps();
    const content = "# Code Review\n\nNo verdict here.\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("escalation");
  });
});

// buildMessage content
describe("CodeReviewStep.buildMessage 内容検証", () => {
  it("includes slug, iteration, findingsPath, and user-request tags", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-slug");
    const message = CodeReviewStep.buildMessage(state, deps);

    expect(message).toContain("my-slug");
    expect(message).toContain("review-feedback-001.md");
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });

  it("includes commit and push instruction via buildGitPushInstruction", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-slug");
    const message = CodeReviewStep.buildMessage(state, deps);

    // review-exit-contract: code-review agent must commit + push result file
    expect(message).toContain(reviewFeedbackPath("my-slug", 1));
    // buildGitPushInstruction uses "Commit" (capital C) — case-insensitive check
    expect(message.toLowerCase()).toContain("commit");
    expect(message.toLowerCase()).toContain("push");
  });
});

// completionVerdict not set (file-based verdict)
describe("CodeReviewStep.completionVerdict", () => {
  it("completionVerdict is undefined (verdict comes from result file)", () => {
    expect(CodeReviewStep.completionVerdict).toBeUndefined();
  });
});

// Verify NULL_PARSE_RESULT is NOT used (code-review has a result file)
describe("CodeReviewStep — result file semantics", () => {
  it("resultFilePath returns non-null string for any state", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const path = CodeReviewStep.resultFilePath(state, deps);
    expect(path).not.toBeNull();
    expect(typeof path).toBe("string");
  });

  it("parseResult is not NULL_PARSE_RESULT (code-review extracts verdict)", () => {
    const deps = makeMinimalDeps();
    const result = CodeReviewStep.parseResult("- **verdict**: approved\n", deps);
    expect(result).not.toEqual(NULL_PARSE_RESULT);
    expect(result.verdict).not.toBeNull();
  });
});
