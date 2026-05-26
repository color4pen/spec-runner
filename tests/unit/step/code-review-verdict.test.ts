/**
 * Unit tests for parseResult in code-review.ts (new design: agent verdict adopted directly)
 *
 * Design D4: determineVerdict() abolished. Agent verdict is adopted as-is.
 * Design D5: Fix column in Findings table drives observation auto-fix via transition when predicate.
 *
 * TC-VD-001: agent approved + no Fix column → approved (score not consulted)
 * TC-VD-002: agent needs-fix → needs-fix (Fix column is not consulted)
 * TC-VD-003: agent approved + score < 7.0 → approved (CLI no longer overrides)
 * TC-VD-004: agent approved + CRITICAL finding (no Fix column) → approved (Fix col not present)
 * TC-VD-005: agent approved + HIGH finding (no Fix column) → approved (Fix col not present)
 * TC-VD-006: agent escalation → escalation (regardless of Fix column)
 * TC-VD-007: no scores + agent approved → approved (fallback preserved)
 * TC-VD-008: no scores + agent needs-fix → needs-fix (fallback preserved)
 * TC-VD-009: no verdict line → escalation (existing fallback)
 * TC-VD-010: agent approved + Fix: yes finding → approved (transition handles fixCount)
 * TC-VD-011: agent approved + Fix: no finding → approved
 * TC-VD-012: agent approved + mixed Fix yes/no → approved (transition handles fixCount)
 * TC-VD-013: scores field is NOT populated (score computation removed)
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
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "Fix the code.", adr: false },
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

const CRITICAL_FINDING_NO_FIX_COL = `| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | CRITICAL | security | src/auth.ts:10 | Auth bypass | Fix auth |`;

const HIGH_FINDING_NO_FIX_COL = `| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check |`;

const FINDING_WITH_FIX_YES = `| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check | yes |`;

const FINDING_WITH_FIX_NO = `| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check | no |`;

const FINDING_WITH_MIXED_FIX = `| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check | yes |
| 2 | MEDIUM | maintainability | src/bar.ts:10 | Long func | Split it | no |`;

// TC-VD-001: agent approved + no Fix column → approved (score not consulted)
describe("TC-VD-001: agent approved + no Fix column → approved", () => {
  it("returns approved when agent says approved and no Fix column", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });
});

// TC-VD-002: agent needs-fix → needs-fix (Fix column is not consulted)
describe("TC-VD-002: agent needs-fix → needs-fix", () => {
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

// TC-VD-003: agent approved + score < 7.0 → approved (CLI no longer overrides)
describe("TC-VD-003: agent approved + score < 7.0 → approved (CLI no longer overrides)", () => {
  it("returns approved when total score is below 7.0 (agent verdict trusted)", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: LOW_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });
});

// TC-VD-004: agent approved + CRITICAL finding (no Fix column) → approved
describe("TC-VD-004: agent approved + CRITICAL finding (no Fix column) → approved", () => {
  it("returns approved when CRITICAL finding exists but Fix column absent (no CLI override)", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
      findings: CRITICAL_FINDING_NO_FIX_COL,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });
});

// TC-VD-005: agent approved + HIGH finding (no Fix column) → approved
describe("TC-VD-005: agent approved + HIGH finding (no Fix column) → approved", () => {
  it("returns approved when HIGH finding exists but Fix column absent (no CLI override)", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
      findings: HIGH_FINDING_NO_FIX_COL,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
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

// TC-VD-010: agent approved + Fix: yes finding → verdict stays approved (transition handles fixCount)
describe("TC-VD-010: agent approved + Fix: yes finding → approved (verdict not recomputed)", () => {
  it("returns approved as-is — fixCount routing is handled by transition table, not parseResult", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      findings: FINDING_WITH_FIX_YES,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });
});

// TC-VD-011: agent approved + Fix: no finding → approved
describe("TC-VD-011: agent approved + Fix: no finding → approved", () => {
  it("returns approved when all findings are Fix: no", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      findings: FINDING_WITH_FIX_NO,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });
});

// TC-VD-012: agent approved + mixed Fix yes/no → approved (transition handles fixCount)
describe("TC-VD-012: agent approved + mixed Fix yes/no → approved (verdict not recomputed)", () => {
  it("returns approved as-is — fixCount routing is handled by transition table", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      findings: FINDING_WITH_MIXED_FIX,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.verdict).toBe("approved");
  });
});

// TC-VD-013: scores field is NOT populated (score computation removed)
describe("TC-VD-013: scores field is not populated", () => {
  it("does not populate scores field even when score table is present", () => {
    const deps = makeMinimalDeps();
    const content = buildContent({
      agentVerdict: "approved",
      scoresTable: GOOD_SCORES_TABLE,
    });
    const result = CodeReviewStep.parseResult(content, deps);
    expect(result.scores).toBeUndefined();
  });
});
