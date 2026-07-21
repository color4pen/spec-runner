/**
 * Tests for evidence field in report tool zodSchemas.
 *
 * Source: tasks.md T-03
 *
 * TC-022: JUDGE / CODE_REVIEW / CONFORMANCE report tool の zodSchema に evidence キーが存在する
 * TC-023 (reversed by TC-021): REQUEST_REVIEW_REPORT_TOOL の zodSchema に evidence キーが存在する
 * TC-014: REQUEST_REVIEW_REPORT_TOOL の zodSchema に evidence キーが存在する
 * TC-015: REQUEST_REVIEW_REPORT_TOOL の description に evidence 必須の説明が含まれる (should)
 * TC-016: 他の report tool の zodSchema が変更されていない (should)
 */
import { describe, it, expect } from "vitest";
import {
  JUDGE_REPORT_TOOL,
  CODE_REVIEW_REPORT_TOOL,
  CONFORMANCE_REPORT_TOOL,
  REQUEST_REVIEW_REPORT_TOOL,
  PRODUCER_REPORT_TOOL,
} from "../report-tool.js";

// ---------------------------------------------------------------------------
// TC-022: 3 judge tools have evidence key in zodSchema
// Source: tasks.md T-03
// ---------------------------------------------------------------------------

describe("TC-022: JUDGE / CODE_REVIEW / CONFORMANCE report tool zodSchema has evidence key", () => {
  it("TC-022: JUDGE_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(JUDGE_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-022: CODE_REVIEW_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(CODE_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-022: CONFORMANCE_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(CONFORMANCE_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-022: JUDGE_REPORT_TOOL description mentions 'evidence'", () => {
    expect(JUDGE_REPORT_TOOL.description).toContain("evidence");
  });

  it("TC-022: JUDGE_REPORT_TOOL description mentions 'checked'", () => {
    expect(JUDGE_REPORT_TOOL.description).toContain("checked");
  });

  it("TC-022: CODE_REVIEW_REPORT_TOOL description mentions 'evidence'", () => {
    expect(CODE_REVIEW_REPORT_TOOL.description).toContain("evidence");
  });

  it("TC-022: CONFORMANCE_REPORT_TOOL description mentions 'evidence'", () => {
    expect(CONFORMANCE_REPORT_TOOL.description).toContain("evidence");
  });
});

// ---------------------------------------------------------------------------
// TC-023 (reversed by TC-021): REQUEST_REVIEW_REPORT_TOOL zodSchema HAS evidence key
// TC-014: REQUEST_REVIEW_REPORT_TOOL.zodSchema に evidence キーが存在する
// Source: tasks.md T-07 drift-guard 反転 (TC-021) / tasks.md T-02 Acceptance Criteria (TC-014)
//
// REVERSAL NOTE: This test was previously TC-023 asserting evidence key ABSENT.
// Reversed per TC-021 (tasks.md T-07 drift-guard reversal) — now asserts evidence key PRESENT.
// Pre-implementation: RED (evidence key not yet added to REQUEST_REVIEW_REPORT_TOOL.zodSchema)
// Post-implementation: GREEN (T-02 adds evidence: optional(evidenceSchema))
// ---------------------------------------------------------------------------

describe("TC-023 / TC-014: REQUEST_REVIEW_REPORT_TOOL zodSchema HAS evidence key (post-reversal)", () => {
  it("TC-023/TC-014: REQUEST_REVIEW_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-023/TC-014: REQUEST_REVIEW_REPORT_TOOL.zodSchema still has 'ok' and 'findings' (base fields unchanged)", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("ok");
    expect(REQUEST_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("findings");
  });
});

// ---------------------------------------------------------------------------
// TC-015: REQUEST_REVIEW_REPORT_TOOL の description に evidence 必須の説明が含まれる (should)
// Source: tasks.md > T-02 Acceptance Criteria
// ---------------------------------------------------------------------------

describe("TC-015: REQUEST_REVIEW_REPORT_TOOL.description に evidence 必須の説明が含まれる", () => {
  it("TC-015: REQUEST_REVIEW_REPORT_TOOL.description contains 'evidence'", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.description).toContain("evidence");
  });

  it("TC-015: REQUEST_REVIEW_REPORT_TOOL.description contains 'checked'", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.description).toContain("checked");
  });

  it("TC-015: REQUEST_REVIEW_REPORT_TOOL.description contains 'skipped'", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.description).toContain("skipped");
  });

  it("TC-015: REQUEST_REVIEW_REPORT_TOOL.description contains 'unverified'", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.description).toContain("unverified");
  });
});

// ---------------------------------------------------------------------------
// TC-016: 他の report tool（JUDGE / CODE_REVIEW / CONFORMANCE / PRODUCER）の zodSchema が変更されていない (should)
// Source: tasks.md > T-02 Acceptance Criteria
// ---------------------------------------------------------------------------

describe("TC-016: 他の report tool の zodSchema が本変更で変わらない", () => {
  it("TC-016: JUDGE_REPORT_TOOL.zodSchema still has 'evidence' key (unchanged by this change)", () => {
    expect(JUDGE_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-016: CODE_REVIEW_REPORT_TOOL.zodSchema still has 'evidence' key (unchanged)", () => {
    expect(CODE_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-016: CONFORMANCE_REPORT_TOOL.zodSchema still has 'evidence' key (unchanged)", () => {
    expect(CONFORMANCE_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-016: PRODUCER_REPORT_TOOL.zodSchema does NOT have 'evidence' key (unchanged — producer tools are not affected)", () => {
    // PRODUCER_REPORT_TOOL (design/implementer/etc.) intentionally does not carry evidence
    expect(PRODUCER_REPORT_TOOL.zodSchema).not.toHaveProperty("evidence");
  });
});
