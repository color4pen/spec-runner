/**
 * Tests for deriveRequestReviewVerdict with evidence parameter (vacuous check).
 *
 * Source: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion
 *
 * TC-005: checked=0 + findings 空の完了が approve にならない
 * TC-006: checked>0 + findings 空の完了が approve になる
 * TC-007: checked>0 + ブロッキング finding は needs-discussion のまま（導出不変）
 * TC-008: evidence 引数なし（旧形式呼び出し）は従来導出にフォールバック
 * TC-017: ok=false の verdict 導出が needs-discussion のまま変わらない
 * TC-018: 非ブロッキング（low/medium fixable）+ checked>0 の完了が approve になる
 */
import { describe, it, expect } from "vitest";
import { deriveRequestReviewVerdict } from "../judge-verdict.js";
import type { Finding, Evidence } from "../../../kernel/report-result.js";

// After T-03, deriveRequestReviewVerdict accepts evidence as 3rd optional arg.
// Before T-03, we cast to the future signature to call it at runtime.
// At runtime (JavaScript), extra arguments are silently ignored by the pre-T-03 implementation,
// so tests calling with evidence and asserting "needs-discussion" for checked=0 will fail
// at the assertion level (the function will return "approve") — this is the expected RED state.
type RequestReviewVerdictWithEvidence = (
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
) => "approve" | "needs-discussion";

const requestReviewVerdictFn = deriveRequestReviewVerdict as unknown as RequestReviewVerdictWithEvidence;

function finding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
): Finding {
  return {
    severity,
    resolution,
    file: "src/example.ts",
    title: "test finding",
    rationale: "test",
  };
}

// ---------------------------------------------------------------------------
// TC-005: checked=0 + findings 空の完了が approve にならない
// Source: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion
//         > Scenario: zero checked with empty findings does not approve
// ---------------------------------------------------------------------------

describe("TC-005: checked=0 + findings 空の完了が approve にならない (vacuous check)", () => {
  it("TC-005: deriveRequestReviewVerdict([], true, { checked: 0, skipped: 3, unverified: 0 }) → 'needs-discussion' (not 'approve')", () => {
    const result = requestReviewVerdictFn([], true, { checked: 0, skipped: 3, unverified: 0 });
    expect(result).toBe("needs-discussion");
  });

  it("TC-005: deriveRequestReviewVerdict([], true, { checked: 0, skipped: 0, unverified: 0 }) → 'needs-discussion' (all zeros)", () => {
    const result = requestReviewVerdictFn([], true, { checked: 0, skipped: 0, unverified: 0 });
    expect(result).toBe("needs-discussion");
  });

  it("TC-005: deriveRequestReviewVerdict([], true, { checked: 0, skipped: 5, unverified: 2 }) → 'needs-discussion' (checked=0 regardless of other counts)", () => {
    const result = requestReviewVerdictFn([], true, { checked: 0, skipped: 5, unverified: 2 });
    expect(result).toBe("needs-discussion");
  });

  it("TC-005: checked=0 does not approve even when medium/low fixable findings exist", () => {
    const findings = [finding("medium", "fixable"), finding("low", "fixable")];
    const result = requestReviewVerdictFn(findings, true, { checked: 0, skipped: 0, unverified: 0 });
    expect(result).toBe("needs-discussion");
  });
});

// ---------------------------------------------------------------------------
// TC-006: checked>0 + findings 空の完了が approve になる
// Source: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion
//         > Scenario: positive checked with empty findings approves
// ---------------------------------------------------------------------------

describe("TC-006: checked>0 + findings 空の完了が approve になる", () => {
  it("TC-006: deriveRequestReviewVerdict([], true, { checked: 5, skipped: 0, unverified: 0 }) → 'approve'", () => {
    const result = requestReviewVerdictFn([], true, { checked: 5, skipped: 0, unverified: 0 });
    expect(result).toBe("approve");
  });

  it("TC-006: deriveRequestReviewVerdict([], true, { checked: 1, skipped: 10, unverified: 2 }) → 'approve' (checked=1 > 0)", () => {
    const result = requestReviewVerdictFn([], true, { checked: 1, skipped: 10, unverified: 2 });
    expect(result).toBe("approve");
  });
});

// ---------------------------------------------------------------------------
// TC-007: checked>0 + ブロッキング finding は needs-discussion のまま（導出不変）
// Source: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion
//         > Scenario: positive checked with blocking finding is unchanged
// ---------------------------------------------------------------------------

describe("TC-007: checked>0 + ブロッキング finding は needs-discussion のまま（導出不変）", () => {
  it("TC-007: high/fixable finding + checked>0 → 'needs-discussion' (blocking derivation unchanged)", () => {
    const result = requestReviewVerdictFn(
      [finding("high", "fixable")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("needs-discussion");
  });

  it("TC-007: critical/fixable finding + checked>0 → 'needs-discussion'", () => {
    const result = requestReviewVerdictFn(
      [finding("critical", "fixable")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("needs-discussion");
  });

  it("TC-007: low/decision-needed finding + checked>0 → 'needs-discussion' (decision-needed unchanged)", () => {
    const result = requestReviewVerdictFn(
      [finding("low", "decision-needed")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("needs-discussion");
  });

  it("TC-007: medium/decision-needed finding + checked>0 → 'needs-discussion'", () => {
    const result = requestReviewVerdictFn(
      [finding("medium", "decision-needed")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("needs-discussion");
  });
});

// ---------------------------------------------------------------------------
// TC-008: evidence 引数なし（旧形式呼び出し）は従来導出にフォールバック
// Source: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion
//         > Scenario: absent evidence preserves legacy derivation
// ---------------------------------------------------------------------------

describe("TC-008: evidence 引数なし（旧形式呼び出し）は従来導出にフォールバック", () => {
  it("TC-008: deriveRequestReviewVerdict([], true) (2-arg, no evidence) → 'approve' (legacy behavior)", () => {
    expect(deriveRequestReviewVerdict([], true)).toBe("approve");
  });

  it("TC-008: deriveRequestReviewVerdict([high/fixable], true) (2-arg) → 'needs-discussion' (legacy blocking detection unchanged)", () => {
    expect(deriveRequestReviewVerdict([finding("high", "fixable")], true)).toBe("needs-discussion");
  });

  it("TC-008: deriveRequestReviewVerdict([], false) (2-arg) → 'needs-discussion' (legacy ok=false rule unchanged)", () => {
    expect(deriveRequestReviewVerdict([], false)).toBe("needs-discussion");
  });

  it("TC-008: deriveRequestReviewVerdict(undefined evidence) → treats same as absent (legacy path)", () => {
    const result = requestReviewVerdictFn([], true, undefined);
    expect(result).toBe("approve");
  });
});

// ---------------------------------------------------------------------------
// TC-017: ok=false の verdict 導出が needs-discussion のまま変わらない
// Source: tasks.md > T-03 Acceptance Criteria
// ---------------------------------------------------------------------------

describe("TC-017: ok=false の verdict 導出が needs-discussion のまま変わらない", () => {
  it("TC-017: deriveRequestReviewVerdict([], false) → 'needs-discussion' (ok=false 最優先ルール不変)", () => {
    const result = requestReviewVerdictFn([], false);
    expect(result).toBe("needs-discussion");
  });

  it("TC-017: deriveRequestReviewVerdict([], false, { checked: 5, ... }) → 'needs-discussion' (ok=false overrides evidence)", () => {
    const result = requestReviewVerdictFn([], false, { checked: 5, skipped: 0, unverified: 0 });
    expect(result).toBe("needs-discussion");
  });
});

// ---------------------------------------------------------------------------
// TC-018: 非ブロッキング（low/medium fixable）+ checked>0 の完了が approve になる
// Source: tasks.md > T-03 Acceptance Criteria
// ---------------------------------------------------------------------------

describe("TC-018: 非ブロッキング（low/medium fixable）+ checked>0 の完了が approve になる", () => {
  it("TC-018: medium/fixable finding + checked>0 → 'approve' (medium not blocking, approve derivation unchanged)", () => {
    const result = requestReviewVerdictFn(
      [finding("medium", "fixable")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("approve");
  });

  it("TC-018: low/fixable finding + checked>0 → 'approve' (low not blocking)", () => {
    const result = requestReviewVerdictFn(
      [finding("low", "fixable")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("approve");
  });

  it("TC-018: medium+low fixable findings + checked>0 → 'approve'", () => {
    const result = requestReviewVerdictFn(
      [finding("medium", "fixable"), finding("low", "fixable")],
      true,
      { checked: 2, skipped: 0, unverified: 0 },
    );
    expect(result).toBe("approve");
  });
});
