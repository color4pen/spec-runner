/**
 * Unit tests for determineVerdict and parseResult with structured scoring
 *
 * TC-VD-001: スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent approved → approved (must)
 * TC-VD-002: スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent needs-fix → needs-fix（厳しい方）(must)
 * TC-VD-003: スコア < 7.0 + agent approved → needs-fix（CLI が上書き）(must)
 * TC-VD-004: CRITICAL >= 1 + agent approved → needs-fix（CLI が上書き）(must)
 * TC-VD-005: HIGH >= 1 + agent approved → needs-fix（CLI が上書き）(must)
 * TC-VD-006: agent escalation → escalation（スコアに関係なく）(must)
 * TC-VD-007: スコアテーブルなし + agent approved → approved（フォールバック）(must)
 * TC-VD-008: スコアテーブルなし + agent needs-fix → needs-fix（フォールバック）(must)
 * TC-VD-009: スコアテーブルなし + verdict 行なし → escalation（既存の挙動）(must)
 */
import { describe, it, expect } from "vitest";
import { CodeReviewStep } from "../../../src/core/step/code-review.js";
import type { StepDeps } from "../../../src/core/step/types.js";

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

function buildContent(opts: {
  agentVerdict?: string;
  scoresTable?: string;
  findings?: string;
}): string {
  const verdictLine = opts.agentVerdict
    ? `- **verdict**: ${opts.agentVerdict}\n`
    : "";

  const findingsSection = opts.findings
    ? `## Findings\n\n${opts.findings}\n`
    : `## Findings\n\n| # | Severity | Category | File | Description | How to Fix |\n|---|----------|----------|------|-------------|------------|\n\n`;

  const scoresSection = opts.scoresTable
    ? `## Scores\n\n${opts.scoresTable}\n`
    : "";

  return `# Code Review Feedback\n\n${verdictLine}\n${findingsSection}\n${scoresSection}\n## Summary\n\nDone.\n`;
}

const GOOD_SCORES_TABLE = `| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.8`;

const LOW_SCORES_TABLE = `| Category | Score | Weight |
|----------|-------|--------|
| correctness | 4 | 0.30 |
| security | 5 | 0.25 |
| architecture | 5 | 0.15 |
| performance | 6 | 0.10 |
| maintainability | 5 | 0.10 |
| testing | 4 | 0.10 |

- **total**: 4.8`;

const CRITICAL_FINDING = `| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | CRITICAL | security | src/auth.ts:10 | Auth bypass | Fix auth |`;

const HIGH_FINDING = `| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check |`;

// TC-VD-001: スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent approved → approved
describe("TC-VD-001: スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent approved → approved", () => {
  it("returns approved when all conditions pass", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });

  it("populates scores field with criticalCount and highCount", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.scores).toBeDefined();
    expect(result.scores!.total).toBe(7.8);
    expect(result.scores!.critical).toBe(0);
    expect(result.scores!.high).toBe(0);
  });
});

// TC-VD-002: スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent needs-fix → needs-fix（厳しい方）
describe("TC-VD-002: スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent needs-fix → needs-fix", () => {
  it("returns needs-fix when agent says needs-fix even if CLI says approved (stricter wins)", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "needs-fix",
      scoresTable: GOOD_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
  });
});

// TC-VD-003: スコア < 7.0 + agent approved → needs-fix（CLI が上書き）
describe("TC-VD-003: スコア < 7.0 + agent approved → needs-fix", () => {
  it("returns needs-fix when total score is below 7.0", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: LOW_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
  });
});

// TC-VD-004: CRITICAL >= 1 + agent approved → needs-fix（CLI が上書き）
describe("TC-VD-004: CRITICAL >= 1 + agent approved → needs-fix", () => {
  it("returns needs-fix when CRITICAL finding exists even if scores are high", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
      findings: CRITICAL_FINDING,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
  });

  it("scores.criticalCount reflects the finding count", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
      findings: CRITICAL_FINDING,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.scores!.critical).toBe(1);
  });
});

// TC-VD-005: HIGH >= 1 + agent approved → needs-fix（CLI が上書き）
describe("TC-VD-005: HIGH >= 1 + agent approved → needs-fix", () => {
  it("returns needs-fix when HIGH finding exists even if scores are high", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
      findings: HIGH_FINDING,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
  });

  it("scores.highCount reflects the finding count", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
      findings: HIGH_FINDING,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.scores!.high).toBe(1);
  });
});

// TC-VD-006: agent escalation → escalation（スコアに関係なく）
describe("TC-VD-006: agent escalation → escalation（スコアに関係なく）", () => {
  it("returns escalation when agent says escalation, ignoring good scores", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "escalation",
      scoresTable: GOOD_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("escalation");
  });

  it("returns escalation when agent says escalation with low scores", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "escalation",
      scoresTable: LOW_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("escalation");
  });

  it("returns escalation when agent says escalation with no scores", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: escalation\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("escalation");
  });
});

// TC-VD-007: スコアテーブルなし + agent approved → approved（フォールバック）
describe("TC-VD-007: スコアテーブルなし + agent approved → approved（フォールバック）", () => {
  it("falls back to agent verdict when no Scores section", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: approved\n\n## Findings\n\nNo issues.\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
    expect(result.scores).toBeUndefined();
  });
});

// TC-VD-008: スコアテーブルなし + agent needs-fix → needs-fix（フォールバック）
describe("TC-VD-008: スコアテーブルなし + agent needs-fix → needs-fix（フォールバック）", () => {
  it("falls back to agent needs-fix when no Scores section", () => {
    const deps = makeMinimalDeps();
    const content = "- **verdict**: needs-fix\n\n## Findings\n\n## Summary\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("needs-fix");
    expect(result.scores).toBeUndefined();
  });
});

// TC-VD-009: スコアテーブルなし + verdict 行なし → escalation（既存の挙動）
describe("TC-VD-009: スコアテーブルなし + verdict 行なし → escalation（既存の挙動）", () => {
  it("returns escalation when no verdict line and no scores (existing fallback)", () => {
    const deps = makeMinimalDeps();
    const content = "# Code Review\n\nNo verdict here.\n";
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("escalation");
    expect(result.scores).toBeUndefined();
  });
});
