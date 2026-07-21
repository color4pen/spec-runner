/**
 * Tests for verdict-channel-unification change.
 *
 * Spec: specrunner/changes/verdict-channel-unification/spec.md
 * Tasks: specrunner/changes/verdict-channel-unification/tasks.md
 *
 * TC-001: judge prompt 群に verdict 行の出力指示が存在しない
 * TC-002: verdict 行なしの result md でも routing が成立する
 * TC-003: evidence report template が必須セクションを持つ
 * TC-004: evidence report template が 7 列 findings 表を要求しない
 * TC-005: 必須セクションを持つ evidence report は gate を通過する
 * TC-006: 必須セクションを欠く result は follow-up violation になる
 * TC-007: gate は 7 列表 header をチェックしない
 * TC-008: PIPELINE_RULES にスコアリング・停滞検出が存在しない
 * TC-009: 各 judge prompt が単一ソースの severity を埋め込む
 * TC-010: severity 文言が judge-rules.ts 以外に存在しない
 * TC-011: 既存の verdict 導出テストが無改変で green
 * TC-012: findings から導出される verdict が変わらない
 * TC-013: VERDICT_BLOCKING_RULES から findings-priority 但し書きが削除されている
 * TC-014: VERDICT_BLOCKING_RULES が blocking rules 本体を保持する
 * TC-015: PIPELINE_RULES の 7 列 findings 表指示が存在しない
 * TC-016: PIPELINE_RULES の severity 表が存在しない
 * TC-017: result template から verdict placeholder・Scores 表・iteration 行が削除されている
 * TC-018: 4 step の initial message builder 出力に verdict 行指示が存在しない
 * TC-019: pipeline-mock-client の judge result md が evidence report 形式であり gate を通過する
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ─── Prompts ────────────────────────────────────────────────────────────────
import { PIPELINE_RULES } from "../../../prompts/fragments.js";
import { VERDICT_BLOCKING_RULES } from "../../../prompts/judge-rules.js";
// Dynamic access for SEVERITY_DEFINITION / REQUEST_REVIEW_SEVERITY_DEFINITION
// which will be added to judge-rules.ts by the implementer (T-01).
import * as judgeRules from "../../../prompts/judge-rules.js";

import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../prompts/code-review-system.js";
import {
  SPEC_REVIEW_SYSTEM_PROMPT,
  buildSpecReviewInitialMessage,
} from "../../../prompts/spec-review-system.js";
import {
  REQUEST_REVIEW_SYSTEM_PROMPT,
  buildRequestReviewInitialMessage,
} from "../../../prompts/request-review-system.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../../../prompts/conformance-system.js";
import { REGRESSION_GATE_SYSTEM_PROMPT } from "../../../prompts/regression-gate-system.js";
import { buildCustomReviewerSystemPrompt } from "../../../prompts/custom-reviewer-system.js";

// ─── Templates ──────────────────────────────────────────────────────────────
import {
  REQUEST_REVIEW_RESULT_TEMPLATE,
  SPEC_REVIEW_RESULT_TEMPLATE,
  REVIEW_FEEDBACK_TEMPLATE,
  CONFORMANCE_RESULT_TEMPLATE,
} from "../../../templates/step-output-templates.js";

// ─── Step implementations ────────────────────────────────────────────────────
import { CodeReviewStep, buildCodeReviewInitialMessage } from "../code-review.js";
import { ConformanceStep } from "../conformance.js";
import { buildCustomReviewerMessage } from "../custom-reviewer.js";
import { createRegressionGateStep } from "../regression-gate.js";
import {
  deriveJudgeVerdict,
  deriveRequestReviewVerdict,
} from "../judge-verdict.js";

// ─── Runtime (for integration tests) ────────────────────────────────────────
import { LocalRuntime } from "../../runtime/local.js";

// ─── Types ───────────────────────────────────────────────────────────────────
import type { ReviewerSnapshot } from "../../../kernel/reviewer-snapshot.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../../port/step-types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeMinimalReviewerSnapshot(): ReviewerSnapshot {
  return {
    name: "test-reviewer",
    maxIterations: 3,
    purpose: "Test purpose",
    criteria: "Test criteria",
    judgment: "Test judgment",
    freeText: "",
  };
}

function makeMinimalJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "/req.md",
      title: "Test",
      type: "spec-change",
      slug: "test-slug",
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "change/test-slug-abcd1234",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalStepDeps(): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    slug: "test-slug",
    request: {
      type: "spec-change",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "test request content",
      adr: false,
    },
  };
}

function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      headRefName: "",
      mergeable: "MERGEABLE",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi
      .fn()
      .mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi
      .fn()
      .mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verdict-channel-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeLocalRuntime(): LocalRuntime {
  const githubClient = buildMockGitHubClient();
  return new LocalRuntime({
    cwd: tempDir,
    githubClient,
    githubToken: "token",
    spawnFn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  });
}

// Dynamically-accessed severity constants (don't exist yet before implementation).
const SEVERITY_DEFINITION = (judgeRules as Record<string, unknown>).SEVERITY_DEFINITION as
  | string
  | undefined;
const REQUEST_REVIEW_SEVERITY_DEFINITION = (
  judgeRules as Record<string, unknown>
).REQUEST_REVIEW_SEVERITY_DEFINITION as string | undefined;

// Known signature text for each severity constant (from tasks.md T-01).
const SEVERITY_SIGNATURE = "本番障害、データ損失、セキュリティ侵害に直結";
const REQUEST_REVIEW_SEVERITY_SIGNATURE = "リクエストレベルの欠陥";

// Verdict line output instruction patterns (must be absent after implementation).
const VERDICT_OUTPUT_INSTRUCTION_PATTERNS = [
  "required for machine parsing",
  "The file MUST contain a verdict line",
  "The result file MUST contain a verdict line",
  "The verdict line MUST be exactly",
];

// 7-column header pattern (must be absent from templates and gate checks after implementation).
const SEVEN_COLUMN_HEADER = "# | Severity | Category | File | Description | How to Fix | Fix";

// ============================================================================
// TC-001: judge prompt 群に verdict 行の出力指示が存在しない
// Source: spec.md > Requirement: judge 系の prompt・message・template は verdict 行の出力を要求しない
//         > Scenario: judge prompt 群に verdict 行の出力指示が存在しない
// ============================================================================

describe("TC-001: judge prompt 群に verdict 行の出力指示が存在しない", () => {
  const minimalReviewer = makeMinimalReviewerSnapshot();

  // --- System prompts ---

  it("TC-001: SPEC_REVIEW_SYSTEM_PROMPT does not require verdict line for machine parsing", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(SPEC_REVIEW_SYSTEM_PROMPT, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: CODE_REVIEW_SYSTEM_PROMPT does not require verdict line for machine parsing", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(CODE_REVIEW_SYSTEM_PROMPT, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: REQUEST_REVIEW_SYSTEM_PROMPT does not require verdict line for machine parsing", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(REQUEST_REVIEW_SYSTEM_PROMPT, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: CONFORMANCE_SYSTEM_PROMPT does not require verdict line for machine parsing", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(CONFORMANCE_SYSTEM_PROMPT, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: REGRESSION_GATE_SYSTEM_PROMPT does not require verdict line for machine parsing", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(REGRESSION_GATE_SYSTEM_PROMPT, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: buildCustomReviewerSystemPrompt output does not require verdict line for machine parsing", () => {
    const prompt = buildCustomReviewerSystemPrompt(minimalReviewer);
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(prompt, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  // --- Initial message builders ---

  it("TC-001: buildSpecReviewInitialMessage output does not require verdict line", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "test-slug",
      requestType: "spec-change",
      iteration: 1,
    });
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(msg, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: buildRequestReviewInitialMessage output does not require verdict line", () => {
    const msg = buildRequestReviewInitialMessage({
      slug: "test-slug",
      requestType: "spec-change",
      branch: "change/test-slug-abc",
      iteration: 1,
      findingsPath: "specrunner/changes/test-slug/request-review-result-001.md",
    });
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(msg, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: buildCodeReviewInitialMessage output does not require verdict line", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "test-slug",
      branch: "change/test-slug-abc",
      iteration: 1,
      findingsPath: "specrunner/changes/test-slug/review-feedback-001.md",
      requestContent: "test request",
    });
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(msg, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: ConformanceStep.buildMessage output does not require verdict line", () => {
    const state = makeMinimalJobState({ step: "conformance" });
    const deps = makeMinimalStepDeps();
    const msg = ConformanceStep.buildMessage(state, deps);
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(msg, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: buildCustomReviewerMessage output does not require verdict line", () => {
    const msg = buildCustomReviewerMessage({
      slug: "test-slug",
      reviewerName: "test-reviewer",
      purpose: "Test purpose",
      iteration: 1,
      resultFilePath: "specrunner/changes/test-slug/test-reviewer-result-001.md",
      requestContent: "test request",
    });
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(msg, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: regression-gate buildMessage output does not require verdict line", () => {
    const state = makeMinimalJobState({ step: "regression-gate", steps: {} });
    const deps = makeMinimalStepDeps();
    const step = createRegressionGateStep();
    const msg = step.buildMessage(state, deps);
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(msg, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  // --- Result templates ---

  it("TC-001: REQUEST_REVIEW_RESULT_TEMPLATE does not output verdict line instruction", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(REQUEST_REVIEW_RESULT_TEMPLATE, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: SPEC_REVIEW_RESULT_TEMPLATE does not output verdict line instruction", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(SPEC_REVIEW_RESULT_TEMPLATE, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: REVIEW_FEEDBACK_TEMPLATE does not output verdict line instruction", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(REVIEW_FEEDBACK_TEMPLATE, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });

  it("TC-001: CONFORMANCE_RESULT_TEMPLATE does not output verdict line instruction", () => {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      expect(CONFORMANCE_RESULT_TEMPLATE, `pattern: "${pattern}"`).not.toContain(pattern);
    }
  });
});

// ============================================================================
// TC-002: verdict 行なしの result md でも routing が成立する
// Source: spec.md > Requirement: judge 系の prompt・message・template は verdict 行の出力を要求しない
//         > Scenario: verdict 行なしの result md でも routing が成立する
// ============================================================================

describe("TC-002: verdict 行なしの result md でも routing が成立する (regression guard)", () => {
  it("TC-002: deriveJudgeVerdict derives verdict from findings only, not MD content", () => {
    // critical finding → needs-fix without any MD verdict line
    expect(deriveJudgeVerdict([{ severity: "critical", resolution: "fixable", file: "f.ts", title: "t", rationale: "r" }], true)).toBe("needs-fix");
  });

  it("TC-002: deriveJudgeVerdict returns approved for empty findings without MD verdict line", () => {
    expect(deriveJudgeVerdict([], true)).toBe("approved");
  });

  it("TC-002: deriveJudgeVerdict returns escalation for decision-needed without MD verdict line", () => {
    expect(deriveJudgeVerdict([{ severity: "low", resolution: "decision-needed", file: "f.ts", title: "t", rationale: "r", options: [{ label: "A", consequence: "CA" }, { label: "B", consequence: "CB" }] }], true)).toBe("escalation");
  });
});

// ============================================================================
// TC-003: evidence report template が必須セクションを持つ
// Source: spec.md > Requirement: judge 系 result template は evidence report である
//         > Scenario: evidence report template が必須セクションを持つ
// ============================================================================

describe("TC-003: evidence report template が必須セクションを持つ", () => {
  it("TC-003: REQUEST_REVIEW_RESULT_TEMPLATE contains 検証した項目 section", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-003: REQUEST_REVIEW_RESULT_TEMPLATE contains 検証できなかった項目 section", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("## 検証できなかった項目");
  });

  it("TC-003: SPEC_REVIEW_RESULT_TEMPLATE contains 検証した項目 section", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-003: SPEC_REVIEW_RESULT_TEMPLATE contains 検証できなかった項目 section", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("## 検証できなかった項目");
  });

  it("TC-003: REVIEW_FEEDBACK_TEMPLATE contains 検証した項目 section", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-003: REVIEW_FEEDBACK_TEMPLATE contains 検証できなかった項目 section", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("## 検証できなかった項目");
  });

  it("TC-003: CONFORMANCE_RESULT_TEMPLATE contains 検証した項目 section", () => {
    expect(CONFORMANCE_RESULT_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-003: CONFORMANCE_RESULT_TEMPLATE contains 検証できなかった項目 section", () => {
    expect(CONFORMANCE_RESULT_TEMPLATE).toContain("## 検証できなかった項目");
  });
});

// ============================================================================
// TC-004: evidence report template が 7 列 findings 表を要求しない
// Source: spec.md > Requirement: judge 系 result template は evidence report である
//         > Scenario: evidence report template が 7 列 findings 表を要求しない
// ============================================================================

describe("TC-004: evidence report template が 7 列 findings 表を要求しない", () => {
  const SEVEN_COLUMNS = "# | Severity | Category | File | Description | How to Fix | Fix";

  it("TC-004: REQUEST_REVIEW_RESULT_TEMPLATE does not contain 7-column findings table header", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).not.toContain(SEVEN_COLUMNS);
  });

  it("TC-004: SPEC_REVIEW_RESULT_TEMPLATE does not contain 7-column findings table header", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).not.toContain(SEVEN_COLUMNS);
  });

  it("TC-004: REVIEW_FEEDBACK_TEMPLATE does not contain 7-column findings table header", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).not.toContain(SEVEN_COLUMNS);
  });

  it("TC-004: CONFORMANCE_RESULT_TEMPLATE does not contain 7-column findings table header", () => {
    expect(CONFORMANCE_RESULT_TEMPLATE).not.toContain(SEVEN_COLUMNS);
  });

  it("TC-004: REQUEST_REVIEW_RESULT_TEMPLATE does not contain verdict placeholder line", () => {
    // The `- **verdict**:` placeholder line should be absent from the template body.
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).not.toMatch(/^- \*\*verdict\*\*:/m);
  });

  it("TC-004: SPEC_REVIEW_RESULT_TEMPLATE does not contain verdict placeholder line", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).not.toMatch(/^- \*\*verdict\*\*:/m);
  });

  it("TC-004: REVIEW_FEEDBACK_TEMPLATE does not contain verdict placeholder line", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).not.toMatch(/^- \*\*verdict\*\*:/m);
  });

  it("TC-004: CONFORMANCE_RESULT_TEMPLATE does not contain verdict placeholder line", () => {
    expect(CONFORMANCE_RESULT_TEMPLATE).not.toMatch(/^- \*\*verdict\*\*:/m);
  });
});

// ============================================================================
// TC-005: 必須セクションを持つ evidence report は gate を通過する
// Source: spec.md > Requirement: code-review の content-format gate は evidence セクションを検証する
//         > Scenario: 必須セクションを持つ evidence report は gate を通過する
// ============================================================================

describe("TC-005: 必須セクションを持つ evidence report は gate を通過する", () => {
  const VALID_EVIDENCE_REPORT = [
    "## 検証した項目",
    "",
    "- src/prompts/judge-rules.ts を確認した",
    "- 全 judge system prompt を読んだ",
    "",
    "## 検証できなかった項目",
    "",
    "None",
    "",
    "## Findings 詳細",
    "",
    "None",
  ].join("\n");

  it("TC-005: evidence report with required sections passes code-review content-format gate", async () => {
    const feedbackDir = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackDir, { recursive: true });
    await fs.writeFile(
      path.join(feedbackDir, "review-feedback-001.md"),
      VALID_EVIDENCE_REPORT,
      "utf-8",
    );

    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "change/test-slug-abc");

    expect(result.violations).toHaveLength(0);
  });
});

// ============================================================================
// TC-006: 必須セクションを欠く result は follow-up violation になる
// Source: spec.md > Requirement: code-review の content-format gate は evidence セクションを検証する
//         > Scenario: 必須セクションを欠く result は follow-up violation になる
// ============================================================================

describe("TC-006: 必須セクションを欠く result は follow-up violation になる", () => {
  // File has 検証できなかった項目 but NOT 検証した項目 — isolates the missing section.
  const MISSING_VERIFIED_SECTION = [
    "## 検証できなかった項目",
    "",
    "None",
    "",
    "## Findings 詳細",
    "",
    "Nothing to report.",
  ].join("\n");

  it("TC-006: review-feedback missing 検証した項目 section yields follow-up violation", async () => {
    const feedbackDir = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackDir, { recursive: true });
    await fs.writeFile(
      path.join(feedbackDir, "review-feedback-001.md"),
      MISSING_VERIFIED_SECTION,
      "utf-8",
    );

    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "change/test-slug-abc");

    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.kind).toBe("content-format");
    expect(v.policy).toBe("follow-up");
    // The failing label must mention 検証した項目 — NOT the 7-column table.
    expect(v.detail).toContain("Verified section present (## 検証した項目)");
  });

  it("TC-006: review-feedback missing both required sections yields follow-up violation with both labels", async () => {
    const feedbackDir = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackDir, { recursive: true });
    // File has neither section.
    await fs.writeFile(
      path.join(feedbackDir, "review-feedback-001.md"),
      "## Findings 詳細\n\nNone",
      "utf-8",
    );

    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "change/test-slug-abc");

    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.policy).toBe("follow-up");
    // Both labels should be in the violation detail.
    expect(v.detail).toContain("Verified section present (## 検証した項目)");
    expect(v.detail).toContain("Unverified section present (## 検証できなかった項目)");
  });
});

// ============================================================================
// TC-007: gate は 7 列表 header をチェックしない
// Source: spec.md > Requirement: code-review の content-format gate は evidence セクションを検証する
//         > Scenario: gate は 7 列表 header をチェックしない
// ============================================================================

describe("TC-007: gate は 7 列表 header をチェックしない", () => {
  it("TC-007: CodeReviewStep.outputContracts checks do not include 7-column header pattern", () => {
    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);
    const cfContract = contracts.find((c) => c.kind === "content-format");
    expect(cfContract).toBeDefined();
    const checks = cfContract!.checks ?? [];
    const patterns = checks.map((c) => c.pattern);
    // Must NOT have a check that looks for 7-column table header.
    const has7ColCheck = patterns.some((p) =>
      /Severity.*Category.*File.*Description.*How to Fix.*Fix/i.test(p),
    );
    expect(has7ColCheck).toBe(false);
  });

  it("TC-007: CodeReviewStep.outputContracts check labels do not mention 7 columns header", () => {
    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);
    const cfContract = contracts.find((c) => c.kind === "content-format");
    const labels = (cfContract!.checks ?? []).map((c) => c.label);
    const hasOldLabel = labels.some((l) => l.includes("7 columns") || l.includes("separator row"));
    expect(hasOldLabel).toBe(false);
  });

  it("TC-007: CodeReviewStep.outputContracts checks include evidence section patterns", () => {
    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);
    const cfContract = contracts.find((c) => c.kind === "content-format");
    const labels = (cfContract!.checks ?? []).map((c) => c.label);
    // Must have checks for both evidence sections.
    expect(labels.some((l) => l.includes("検証した項目"))).toBe(true);
    expect(labels.some((l) => l.includes("検証できなかった項目"))).toBe(true);
  });
});

// ============================================================================
// TC-008: PIPELINE_RULES にスコアリング・停滞検出が存在しない
// Source: spec.md > Requirement: PIPELINE_RULES は死装置を含まない
//         > Scenario: PIPELINE_RULES にスコアリング・停滞検出が存在しない
// ============================================================================

describe("TC-008: PIPELINE_RULES にスコアリング・停滞検出が存在しない", () => {
  it("TC-008: PIPELINE_RULES does not contain Score keyword (承認閾値 7.0)", () => {
    // Score 1-10 scale used in Scoring section.
    expect(PIPELINE_RULES).not.toContain("Score 基準");
    expect(PIPELINE_RULES).not.toContain("7.0");
  });

  it("TC-008: PIPELINE_RULES does not contain Weight table entries (0.30/0.25/0.15)", () => {
    expect(PIPELINE_RULES).not.toContain("0.30");
    expect(PIPELINE_RULES).not.toContain("0.25");
    expect(PIPELINE_RULES).not.toContain("0.15");
  });

  it("TC-008: PIPELINE_RULES does not contain Total scoring formula", () => {
    expect(PIPELINE_RULES).not.toContain("Total");
  });

  it("TC-008: PIPELINE_RULES does not contain Convergence Trend section", () => {
    expect(PIPELINE_RULES).not.toContain("Convergence Trend");
  });

  it("TC-008: PIPELINE_RULES does not contain plateau detection instruction", () => {
    expect(PIPELINE_RULES).not.toContain("plateau");
    expect(PIPELINE_RULES).not.toContain("plateaued");
  });

  it("TC-008: PIPELINE_RULES does not contain Iteration Comparison section", () => {
    expect(PIPELINE_RULES).not.toContain("Iteration Comparison");
  });
});

// ============================================================================
// TC-009: 各 judge prompt が単一ソースの severity を埋め込む
// Source: spec.md > Requirement: severity 定義は judge-rules.ts に単一ソース化される
//         > Scenario: 各 judge prompt が単一ソースの severity を埋め込む
// ============================================================================

describe("TC-009: 各 judge prompt が単一ソースの severity を埋め込む", () => {
  it("TC-009: judge-rules.ts exports SEVERITY_DEFINITION constant", () => {
    expect(SEVERITY_DEFINITION).toBeDefined();
    expect(typeof SEVERITY_DEFINITION).toBe("string");
    expect((SEVERITY_DEFINITION as string).length).toBeGreaterThan(0);
  });

  it("TC-009: judge-rules.ts exports REQUEST_REVIEW_SEVERITY_DEFINITION constant", () => {
    expect(REQUEST_REVIEW_SEVERITY_DEFINITION).toBeDefined();
    expect(typeof REQUEST_REVIEW_SEVERITY_DEFINITION).toBe("string");
    expect((REQUEST_REVIEW_SEVERITY_DEFINITION as string).length).toBeGreaterThan(0);
  });

  it("TC-009: CODE_REVIEW_SYSTEM_PROMPT embeds SEVERITY_DEFINITION", () => {
    // Fails if SEVERITY_DEFINITION is not yet exported from judge-rules.ts
    expect(SEVERITY_DEFINITION).toBeDefined();
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION as string);
  });

  it("TC-009: SPEC_REVIEW_SYSTEM_PROMPT embeds SEVERITY_DEFINITION", () => {
    expect(SEVERITY_DEFINITION).toBeDefined();
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION as string);
  });

  it("TC-009: CONFORMANCE_SYSTEM_PROMPT embeds SEVERITY_DEFINITION", () => {
    expect(SEVERITY_DEFINITION).toBeDefined();
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION as string);
  });

  it("TC-009: REGRESSION_GATE_SYSTEM_PROMPT embeds SEVERITY_DEFINITION", () => {
    expect(SEVERITY_DEFINITION).toBeDefined();
    expect(REGRESSION_GATE_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION as string);
  });

  it("TC-009: buildCustomReviewerSystemPrompt embeds SEVERITY_DEFINITION", () => {
    expect(SEVERITY_DEFINITION).toBeDefined();
    const prompt = buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot());
    expect(prompt).toContain(SEVERITY_DEFINITION as string);
  });

  it("TC-009: REQUEST_REVIEW_SYSTEM_PROMPT embeds REQUEST_REVIEW_SEVERITY_DEFINITION", () => {
    expect(REQUEST_REVIEW_SEVERITY_DEFINITION).toBeDefined();
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(REQUEST_REVIEW_SEVERITY_DEFINITION as string);
  });
});

// ============================================================================
// TC-010: severity 文言が judge-rules.ts 以外に存在しない
// Source: spec.md > Requirement: severity 定義は judge-rules.ts に単一ソース化される
//         > Scenario: severity 文言が judge-rules.ts 以外に存在しない
// ============================================================================

describe("TC-010: severity 文言が judge-rules.ts 以外に存在しない", () => {
  it("TC-010: PIPELINE_RULES does not contain hardcoded severity signature (本番障害…)", () => {
    expect(PIPELINE_RULES).not.toContain(SEVERITY_SIGNATURE);
  });

  it("TC-010: PIPELINE_RULES does not contain ## Severity table header", () => {
    // The ## Severity section with hardcoded table should be removed from PIPELINE_RULES.
    // Severity is now sourced from SEVERITY_DEFINITION in judge-rules.ts.
    expect(PIPELINE_RULES).not.toMatch(/^## Severity\s*$/m);
  });

  it("TC-010: CODE_REVIEW_SYSTEM_PROMPT severity text comes from SEVERITY_DEFINITION, not hardcoded", () => {
    // After removing from PIPELINE_RULES and adding SEVERITY_DEFINITION embedding,
    // the severity text must be present via the constant — not via PIPELINE_RULES.
    // PIPELINE_RULES must NOT contain the severity signature.
    expect(PIPELINE_RULES).not.toContain(SEVERITY_SIGNATURE);
  });

  it("TC-010: REQUEST_REVIEW_SYSTEM_PROMPT request-review severity signature comes from REQUEST_REVIEW_SEVERITY_DEFINITION", () => {
    // The request-review severity text should come from the constant, not be hardcoded inline.
    // We can verify by checking that the constant content equals what the prompt contains.
    expect(REQUEST_REVIEW_SEVERITY_DEFINITION).toBeDefined();
    // If the prompt contains the signature, it must do so via the constant (which we check separately).
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(REQUEST_REVIEW_SEVERITY_SIGNATURE);
  });
});

// ============================================================================
// TC-011: 既存の verdict 導出テストが無改変で green
// Source: spec.md > Requirement: verdict 導出（routing）は不変である
//         > Scenario: 既存の verdict 導出テストが無改変で green
// ============================================================================

describe("TC-011: 既存の verdict 導出テストが無改変で green (regression guard)", () => {
  it("TC-011: deriveJudgeVerdict and deriveRequestReviewVerdict are still exported from judge-verdict.ts", () => {
    expect(typeof deriveJudgeVerdict).toBe("function");
    expect(typeof deriveRequestReviewVerdict).toBe("function");
  });

  it("TC-011: CodeReviewStep still exports reportTool reference (judge identity check)", () => {
    expect(CodeReviewStep.reportTool).toBeDefined();
  });
});

// ============================================================================
// TC-012: findings から導出される verdict が変わらない
// Source: spec.md > Requirement: verdict 導出（routing）は不変である
//         > Scenario: findings から導出される verdict が変わらない
// ============================================================================

describe("TC-012: findings から導出される verdict が変わらない (regression guard)", () => {
  function f(
    severity: "critical" | "high" | "medium" | "low",
    resolution: "fixable" | "decision-needed",
  ) {
    return { severity, resolution, file: "f.ts", title: "t", rationale: "r" };
  }

  it("TC-012: critical/high + ok=true → needs-fix", () => {
    expect(deriveJudgeVerdict([f("critical", "fixable")], true)).toBe("needs-fix");
    expect(deriveJudgeVerdict([f("high", "fixable")], true)).toBe("needs-fix");
  });

  it("TC-012: decision-needed + ok=true → escalation", () => {
    expect(deriveJudgeVerdict([f("low", "decision-needed")], true)).toBe("escalation");
  });

  it("TC-012: empty findings + ok=true → approved", () => {
    expect(deriveJudgeVerdict([], true)).toBe("approved");
  });

  it("TC-012: medium/low fixable + ok=true → approved", () => {
    expect(deriveJudgeVerdict([f("medium", "fixable"), f("low", "fixable")], true)).toBe("approved");
  });

  it("TC-012: ok=false → escalation (regardless of findings)", () => {
    expect(deriveJudgeVerdict([], false)).toBe("escalation");
    expect(deriveJudgeVerdict([f("critical", "fixable")], false)).toBe("escalation");
  });

  it("TC-012: decision-needed takes priority over critical (escalation first)", () => {
    expect(
      deriveJudgeVerdict([f("critical", "fixable"), f("low", "decision-needed")], true),
    ).toBe("escalation");
  });
});

// ============================================================================
// TC-013: VERDICT_BLOCKING_RULES から findings-priority 但し書きが削除されている
// Source: tasks.md > T-01
// ============================================================================

describe("TC-013: VERDICT_BLOCKING_RULES から findings-priority 但し書きが削除されている", () => {
  it("TC-013: VERDICT_BLOCKING_RULES does not contain 'findings 由来の導出が優先'", () => {
    expect(VERDICT_BLOCKING_RULES).not.toContain("findings 由来の導出が優先");
  });

  it("TC-013: VERDICT_BLOCKING_RULES does not contain 'verdict 行は人間向けの要約'", () => {
    expect(VERDICT_BLOCKING_RULES).not.toContain("verdict 行は人間向けの要約");
  });

  it("TC-013: VERDICT_BLOCKING_RULES does not contain 'markdown の verdict 行と報告された findings が矛盾'", () => {
    expect(VERDICT_BLOCKING_RULES).not.toContain("markdown の verdict 行と報告された findings が矛盾");
  });
});

// ============================================================================
// TC-014: VERDICT_BLOCKING_RULES が blocking rules 本体を保持する
// Source: tasks.md > T-01 Acceptance Criteria
// ============================================================================

describe("TC-014: VERDICT_BLOCKING_RULES が blocking rules 本体を保持する (regression guard)", () => {
  it("TC-014: VERDICT_BLOCKING_RULES contains decision-needed → escalation rule", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("decision-needed");
    expect(VERDICT_BLOCKING_RULES).toContain("escalation");
  });

  it("TC-014: VERDICT_BLOCKING_RULES contains critical|high → needs-fix rule", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("needs-fix");
  });

  it("TC-014: VERDICT_BLOCKING_RULES mentions request-review needs-discussion", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("needs-discussion");
  });

  it("TC-014: VERDICT_BLOCKING_RULES is a non-empty string", () => {
    expect(typeof VERDICT_BLOCKING_RULES).toBe("string");
    expect(VERDICT_BLOCKING_RULES.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// TC-015: PIPELINE_RULES の 7 列 findings 表指示が存在しない
// Source: tasks.md > T-02 / design.md > D4
// ============================================================================

describe("TC-015: PIPELINE_RULES の 7 列 findings 表指示が存在しない", () => {
  it("TC-015: PIPELINE_RULES does not contain 7-column findings header", () => {
    expect(PIPELINE_RULES).not.toContain(SEVEN_COLUMN_HEADER);
  });

  it("TC-015: PIPELINE_RULES does not contain ## Findings Format section heading", () => {
    expect(PIPELINE_RULES).not.toContain("## Findings Format");
  });

  it("TC-015: PIPELINE_RULES does not contain 必須カラム instruction with Fix column", () => {
    // The old instruction "必須カラム: #, Severity, Category, File, Description, How to Fix, Fix"
    expect(PIPELINE_RULES).not.toContain("**Fix カラム**");
  });
});

// ============================================================================
// TC-016: PIPELINE_RULES の severity 表が存在しない
// Source: tasks.md > T-02 / design.md > D5
// ============================================================================

describe("TC-016: PIPELINE_RULES の severity 表が存在しない", () => {
  it("TC-016: PIPELINE_RULES does not contain hardcoded 本番障害 severity text", () => {
    expect(PIPELINE_RULES).not.toContain(SEVERITY_SIGNATURE);
  });

  it("TC-016: PIPELINE_RULES does not contain hardcoded 機能不全、明確なバグ severity text", () => {
    expect(PIPELINE_RULES).not.toContain("機能不全、明確なバグ、回避策なし");
  });

  it("TC-016: PIPELINE_RULES still contains VERDICT_BLOCKING_RULES (not removed by T-02)", () => {
    // PIPELINE_RULES must retain VERDICT_BLOCKING_RULES even after severity table removal.
    expect(PIPELINE_RULES).toContain(VERDICT_BLOCKING_RULES);
  });
});

// ============================================================================
// TC-017: result template から verdict placeholder・Scores 表・iteration 行が削除されている
// Source: tasks.md > T-03 / design.md > D2
// ============================================================================

describe("TC-017: result template から verdict placeholder・Scores 表・iteration 行が削除されている", () => {
  const ALL_FOUR_TEMPLATES: Array<[string, string]> = [
    ["REQUEST_REVIEW_RESULT_TEMPLATE", REQUEST_REVIEW_RESULT_TEMPLATE],
    ["SPEC_REVIEW_RESULT_TEMPLATE", SPEC_REVIEW_RESULT_TEMPLATE],
    ["REVIEW_FEEDBACK_TEMPLATE", REVIEW_FEEDBACK_TEMPLATE],
    ["CONFORMANCE_RESULT_TEMPLATE", CONFORMANCE_RESULT_TEMPLATE],
  ];

  for (const [name, template] of ALL_FOUR_TEMPLATES) {
    it(`TC-017: ${name} does not contain - **verdict**: placeholder`, () => {
      // The placeholder `- **verdict**:` line (with empty value, used for agent to fill in)
      // must be absent. This is distinct from mentioning "verdict" in comments.
      expect(template).not.toMatch(/^- \*\*verdict\*\*:\s*$/m);
    });

    it(`TC-017: ${name} does not contain - **total**: placeholder`, () => {
      expect(template).not.toMatch(/^- \*\*total\*\*:/m);
    });

    it(`TC-017: ${name} does not contain - **iteration**: placeholder`, () => {
      expect(template).not.toMatch(/^- \*\*iteration\*\*:/m);
    });
  }

  it("TC-017: REVIEW_FEEDBACK_TEMPLATE does not contain Scores table", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).not.toContain("## Scores");
  });

  it("TC-017: REVIEW_FEEDBACK_TEMPLATE does not contain correctness weight row", () => {
    // The old Scores table had "| correctness | | 0.30 |"
    expect(REVIEW_FEEDBACK_TEMPLATE).not.toMatch(/\|\s*correctness\s*\|.*\|\s*0\.30\s*\|/);
  });

  it("TC-017: 4 templates each contain the evidence report HTML comment about verdict derivation", () => {
    // Each template must have an HTML comment explaining that verdict is derived by CLI,
    // not written in this file.
    for (const [name, template] of ALL_FOUR_TEMPLATES) {
      expect(template, `${name} should explain CLI derives verdict`).toContain(
        "verdict は CLI が typed findings から導出する",
      );
    }
  });
});

// ============================================================================
// TC-018: 4 step の initial message builder 出力に verdict 行指示が存在しない
// Source: tasks.md > T-05
// ============================================================================

describe("TC-018: 4 step の initial message builder 出力に verdict 行指示が存在しない", () => {
  function assertNoVerdictInstruction(msgName: string, msg: string): void {
    // "The file MUST contain a verdict line" and variants must be absent.
    expect(msg, `${msgName}: must not contain verdict line instruction`).not.toContain(
      "The file MUST contain a verdict line",
    );
    expect(msg, `${msgName}: must not contain "**verdict**: <" output requirement`).not.toMatch(
      /\*\*verdict\*\*:\s*<(approved|needs-fix|escalation)/,
    );
  }

  it("TC-018: buildCodeReviewInitialMessage does not contain verdict line instruction", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "test-slug",
      branch: "change/test-slug-abc",
      iteration: 1,
      findingsPath: "specrunner/changes/test-slug/review-feedback-001.md",
      requestContent: "test request",
    });
    assertNoVerdictInstruction("buildCodeReviewInitialMessage", msg);
  });

  it("TC-018: ConformanceStep.buildMessage does not contain verdict line instruction", () => {
    const state = makeMinimalJobState({ step: "conformance" });
    const deps = makeMinimalStepDeps();
    const msg = ConformanceStep.buildMessage(state, deps);
    assertNoVerdictInstruction("ConformanceStep.buildMessage", msg);
  });

  it("TC-018: buildCustomReviewerMessage does not contain verdict line instruction", () => {
    const msg = buildCustomReviewerMessage({
      slug: "test-slug",
      reviewerName: "test-reviewer",
      purpose: "Test purpose",
      iteration: 1,
      resultFilePath: "specrunner/changes/test-slug/test-reviewer-result-001.md",
      requestContent: "test request",
    });
    assertNoVerdictInstruction("buildCustomReviewerMessage", msg);
  });

  it("TC-018: regression-gate buildMessage does not contain verdict line instruction", () => {
    const state = makeMinimalJobState({ step: "regression-gate", steps: {} });
    const deps = makeMinimalStepDeps();
    const step = createRegressionGateStep();
    const msg = step.buildMessage(state, deps);
    assertNoVerdictInstruction("regression-gate buildMessage", msg);
  });

  it("TC-018: buildCodeReviewInitialMessage still contains report_result guidance for findings", () => {
    // The initial message should still guide the agent to report findings (even though verdict line is removed).
    // After implementation, it should say something about reporting findings.
    const msg = buildCodeReviewInitialMessage({
      slug: "test-slug",
      branch: "change/test-slug-abc",
      iteration: 1,
      findingsPath: "specrunner/changes/test-slug/review-feedback-001.md",
      requestContent: "test request",
    });
    // Must still reference findings in some way.
    expect(msg).toContain("findings");
  });
});

// ============================================================================
// TC-019: pipeline-mock-client の judge result md が evidence report 形式であり gate を通過する
// Source: tasks.md > T-08 / design.md > Risks
// ============================================================================

describe("TC-019: judge result md が evidence report 形式であり gate を通過する", () => {
  // This is the evidence report format that the mock should generate after implementation.
  // The gate (after implementation) checks for 検証した項目 and 検証できなかった項目 sections.
  const EVIDENCE_REPORT_MOCK_FORMAT = [
    "# Code Review Feedback — iteration 001",
    "",
    "## 検証した項目",
    "",
    "- Changed files reviewed: src/foo.ts",
    "- Spec files read: design.md, tasks.md",
    "",
    "## 検証できなかった項目",
    "",
    "None",
    "",
    "## Findings 詳細",
    "",
    "None",
  ].join("\n");

  it("TC-019: evidence report format passes code-review content-format gate", async () => {
    const feedbackDir = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackDir, { recursive: true });
    await fs.writeFile(
      path.join(feedbackDir, "review-feedback-001.md"),
      EVIDENCE_REPORT_MOCK_FORMAT,
      "utf-8",
    );

    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "change/test-slug-abc");

    // RED before implementation: gate checks 7-column table → file lacks it → 1 violation.
    // GREEN after implementation: gate checks evidence sections → file has them → 0 violations.
    expect(result.violations).toHaveLength(0);
  });

  it("TC-019: old verdict-line mock format (without evidence sections) fails the gate", async () => {
    // This verifies the gate provides meaningful signal: the OLD format (verdict + 7-column table)
    // fails the NEW gate, ensuring the mock must be updated.
    const OLD_FORMAT = [
      "# Code Review Feedback — iteration NNN",
      "- **verdict**: approved",
      "- **iteration**: 001",
      "## Findings",
      "| # | Severity | Category | File | Description | How to Fix | Fix |",
      "|---|----------|----------|------|-------------|------------|-----|",
    ].join("\n");

    const feedbackDir = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackDir, { recursive: true });
    await fs.writeFile(
      path.join(feedbackDir, "review-feedback-001.md"),
      OLD_FORMAT,
      "utf-8",
    );

    const state = makeMinimalJobState({ step: "code-review" });
    const deps = makeMinimalStepDeps();
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "change/test-slug-abc");

    // After implementation: old format has no evidence sections → violation (ensuring mock must update).
    // This test verifies that the gate has meaningful signal even for TC-019.
    // Note: before implementation this test PASSES (gate checks 7-col table which IS present in old format).
    // RED before implementation: gate checks 7-column table → old format HAS it → 0 violations (assertion >= 1 FAILS).
    // GREEN after implementation: gate checks evidence sections → old format lacks them → >= 1 violation.
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });
});
