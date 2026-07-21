/**
 * Unit tests for CodeReviewStep
 *
 * TC-001: CodeReviewStep の kind / name / agent.role が AgentStep 規約を満たす (must)
 * TC-002: CodeReviewStep の agent.name / model / tools が仕様値と一致する (must)
 * TC-003: CodeReviewStep は gitWrite capability を持たない (must)
 * TC-004: CodeReviewStep.resultFilePath が zero-padded 3 桁の iteration 番号を持つパスを返す (must)
 * TC-005: CodeReviewStep.parseResult は no-op（verdict: null）を返す (R4 contract lock)
 * TC-036: CodeReviewStep.parseResult が verdict 行なしのコンテンツでも verdict: null を返す (R4)
 */
import { describe, it, expect } from "vitest";
import { CodeReviewStep, buildReviewFeedbackPath, buildCodeReviewInitialMessage } from "../../../src/core/step/code-review.js";
import { evaluateContentFormatChecks } from "../../../src/core/step/output-verify.js";
import { deriveJudgeVerdict } from "../../../src/core/step/judge-verdict.js";
import type { Finding } from "../../../src/kernel/report-result.js";
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
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "Fix the code.", adr: false },
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

  it("step.agent.model === 'claude-sonnet-4-6'", () => {
    expect(CodeReviewStep.agent.model).toBe("claude-sonnet-4-6");
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

// TC-005: parseResult is no-op (R4 contract lock — verdict derived from typed toolResult via executor)
describe("TC-005: CodeReviewStep.parseResult は no-op（verdict: null）を返す", () => {
  it("returns verdict: null for any content (prose parse path is dead)", () => {
    const deps = makeMinimalDeps();
    const content = "# Code Review\n\n- **verdict**: needs-fix\n\n## Findings\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBeNull();
  });

  it("returns verdict: null even for approved content", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: approved\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBeNull();
  });

  it("returns verdict: null for escalation content", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: escalation\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBeNull();
  });
});

// TC-036: verdict: null for empty content (prose parse path is dead)
describe("TC-036: CodeReviewStep.parseResult が verdict 行なしのコンテンツでも verdict: null を返す", () => {
  it("returns verdict: null regardless of whether content has a verdict line", () => {
    const deps = makeMinimalDeps();
    const content = "# Code Review\n\nNo verdict here.\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBeNull();
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

// CodeReviewStep result file and parseResult semantics (R4: parseResult is no-op)
describe("CodeReviewStep — result file semantics", () => {
  it("resultFilePath returns non-null string for any state", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const path = CodeReviewStep.resultFilePath(state, deps);
    expect(path).not.toBeNull();
    expect(typeof path).toBe("string");
  });

  it("parseResult returns NULL_PARSE_RESULT equivalent (verdict: null — R4 no-op)", () => {
    const deps = makeMinimalDeps();
    const result = CodeReviewStep.parseResult("- **verdict**: approved\n", deps);
    // R4: parseResult is no-op; verdict is derived from typed toolResult by executor
    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-20: 補助 section を含む request.md → Request Constraints が code-review initial message に注入される
// TC-21: 配置順 </user-request> → Request Constraints → Branch Context
// TC-22: 補助 section なし → Request Constraints が含まれない
// TC-23: Request Constraints は </user-request> タグ外に存在する
// ---------------------------------------------------------------------------

const REQUEST_WITH_CONSTRAINTS = [
  "# タイトル",
  "",
  "## スコープ外",
  "",
  "- rules ファイルでの対応",
  "",
  "## 受け入れ基準",
  "",
  "- [ ] code-review に注入される",
  "",
  "## architect 評価済みの設計判断",
  "",
  "- CLI 内フォローアップを採用",
  "",
].join("\n");

const REQUEST_WITHOUT_CONSTRAINTS =
  "## 背景\n\ncontent\n\n## 要件\n\ncontent\n";

describe("TC-20: 補助 section を含む request.md → Request Constraints が code-review message に注入される", () => {
  it("includes ## Request Constraints (CLI-injected) when constraint sections exist", () => {
    const message = buildCodeReviewInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-change", 1),
      requestContent: REQUEST_WITH_CONSTRAINTS,
    });
    expect(message).toContain("## Request Constraints (CLI-injected)");
    expect(message).toContain("### スコープ外");
    expect(message).toContain("### 受け入れ基準");
    expect(message).toContain("### architect 評価済みの設計判断");
  });
});

describe("TC-21: 配置順 </user-request> → Request Constraints → Branch Context", () => {
  it("Request Constraints appears after </user-request> and before Branch Context", () => {
    const message = buildCodeReviewInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-change", 1),
      requestContent: REQUEST_WITH_CONSTRAINTS,
      dynamicContext: { diffStat: "2 files changed", gitLog: "", changesList: [] },
    });
    const closeTagIdx = message.indexOf("</user-request>");
    const constraintsIdx = message.indexOf("## Request Constraints (CLI-injected)");
    const branchContextIdx = message.indexOf("## Branch Context");
    expect(closeTagIdx).toBeGreaterThan(-1);
    expect(constraintsIdx).toBeGreaterThan(-1);
    expect(branchContextIdx).toBeGreaterThan(-1);
    expect(constraintsIdx).toBeGreaterThan(closeTagIdx);
    expect(constraintsIdx).toBeLessThan(branchContextIdx);
  });
});

describe("TC-22: 補助 section なし → code-review initial message に Request Constraints が含まれない", () => {
  it("does not include Request Constraints when no constraint sections exist", () => {
    const message = buildCodeReviewInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-change", 1),
      requestContent: REQUEST_WITHOUT_CONSTRAINTS,
    });
    expect(message).not.toContain("Request Constraints");
  });
});

describe("TC-23: Request Constraints は </user-request> タグ外に存在する (code-review)", () => {
  it("Request Constraints block appears after </user-request>", () => {
    const message = buildCodeReviewInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-change", 1),
      requestContent: REQUEST_WITH_CONSTRAINTS,
    });
    const closeTagIdx = message.indexOf("</user-request>");
    const constraintsIdx = message.indexOf("## Request Constraints (CLI-injected)");
    expect(constraintsIdx).toBeGreaterThan(closeTagIdx);
  });
});

// ---------------------------------------------------------------------------
// T-03 (added-turns-persist-and-review-trim): followUpPrompt removal
// ---------------------------------------------------------------------------

describe("T-03: CodeReviewStep.followUpPrompt / getFollowUpPrompt are absent (unconditional post-work turn removed)", () => {
  it("CodeReviewStep.followUpPrompt is undefined", () => {
    expect((CodeReviewStep as unknown as Record<string, unknown>)["followUpPrompt"]).toBeUndefined();
  });

  it("CodeReviewStep.getFollowUpPrompt is undefined", () => {
    expect((CodeReviewStep as unknown as Record<string, unknown>)["getFollowUpPrompt"]).toBeUndefined();
  });
});

// A well-formed evidence report (検証した項目 / 検証できなかった項目 sections present)
const VALID_REVIEW_FEEDBACK = [
  "# Review Feedback",
  "",
  "## 検証した項目",
  "",
  "Reviewed src/foo.ts and src/bar.ts. Read design.md and tasks.md.",
  "",
  "## 検証できなかった項目",
  "",
  "None",
  "",
  "## Findings 詳細",
  "",
  "None",
].join("\n");

// A malformed review-feedback (missing required evidence sections)
const INVALID_REVIEW_FEEDBACK = [
  "# Review Feedback",
  "",
  "Just some text without the required evidence report sections.",
  "",
].join("\n");

describe("T-03: content-format contract — format-conformant feedback produces no violations", () => {
  it("valid format → evaluateContentFormatChecks returns empty failed list (no repair turn fires)", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-slug");
    const contracts = CodeReviewStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);

    const contentFormatContract = contracts[0]!;
    expect(contentFormatContract.kind).toBe("content-format");

    const failedChecks = evaluateContentFormatChecks(VALID_REVIEW_FEEDBACK, contentFormatContract.checks!);
    expect(failedChecks).toHaveLength(0);
  });
});

describe("T-03: content-format contract — format-violating feedback fires repair", () => {
  it("invalid format → evaluateContentFormatChecks returns non-empty failed list (repair turn fires)", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-slug");
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const contentFormatContract = contracts[0]!;
    const failedChecks = evaluateContentFormatChecks(INVALID_REVIEW_FEEDBACK, contentFormatContract.checks!);
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it("missing content (null) → all checks fail (repair turn fires)", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-slug");
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const contentFormatContract = contracts[0]!;
    const failedChecks = evaluateContentFormatChecks(null, contentFormatContract.checks!);
    expect(failedChecks).toHaveLength(contentFormatContract.checks!.length);
  });
});

describe("T-03: routing lock — deriveJudgeVerdict uses structured findings (not .md content)", () => {
  it("critical finding + ok=true → needs-fix regardless of .md content", () => {
    const findings: Finding[] = [
      {
        severity: "critical",
        resolution: "fixable",
        file: "src/foo.ts",
        title: "Critical bug",
        rationale: "Causes data loss",
      },
    ];
    // Routing verdict derived purely from structured findings — .md is irrelevant
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("needs-fix");
  });

  it("high finding + ok=true → needs-fix regardless of .md content", () => {
    const findings: Finding[] = [
      {
        severity: "high",
        resolution: "fixable",
        file: "src/bar.ts",
        title: "High severity bug",
        rationale: "Functional failure",
      },
    ];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("needs-fix");
  });

  it("approved verdict when no critical/high findings and ok=true — md self-check removal does not affect routing", () => {
    // With no critical/high findings, verdict is approved even without the .md self-check
    const findings: Finding[] = [
      {
        severity: "low",
        resolution: "fixable",
        file: "src/baz.ts",
        title: "Low severity suggestion",
        rationale: "Style issue",
      },
    ];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("approved");
  });

  it("no findings and ok=true → approved — pipeline transition is unaffected by .md removal", () => {
    const verdict = deriveJudgeVerdict([], true);
    expect(verdict).toBe("approved");
  });
});
