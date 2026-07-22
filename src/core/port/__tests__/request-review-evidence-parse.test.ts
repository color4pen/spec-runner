/**
 * Tests for parseRequestReviewReportInput evidence enforcement.
 *
 * Source: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts
 *
 * TC-001: evidence 欠落の ok=true 報告が parse 拒否される
 * TC-002: 有効な evidence 付き ok=true 報告が parse 受理される
 * TC-003: 負値の evidence カウントが parse 拒否される
 * TC-004: ok=false の自発失敗は evidence 不要で parse 受理される
 * TC-013: 非整数（浮動小数）の evidence カウントが parse 拒否される
 */
import { describe, it, expect } from "vitest";
import { parseRequestReviewReportInput } from "../../port/report-result.js";

// ---------------------------------------------------------------------------
// TC-001: evidence 欠落の ok=true 報告が parse 拒否される
// Source: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts
//         > Scenario: request-review report without evidence on ok=true is rejected
// ---------------------------------------------------------------------------

describe("TC-001: evidence 欠落の ok=true 報告が parse 拒否される", () => {
  it("TC-001: parseRequestReviewReportInput({ ok: true, findings: [] }) with no evidence → { ok: false } with missingFields containing 'evidence'", () => {
    const result = parseRequestReviewReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-001: parseRequestReviewReportInput({ ok: true }) with no evidence and no findings → { ok: false } with missingFields containing 'evidence'", () => {
    const result = parseRequestReviewReportInput({ ok: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-001: parseRequestReviewReportInput({ ok: true, verdict: 'approve', findings: [] }) with no evidence → { ok: false }", () => {
    const result = parseRequestReviewReportInput({ ok: true, verdict: "approve", findings: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-002: 有効な evidence 付き ok=true 報告が parse 受理される
// Source: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts
//         > Scenario: request-review report with valid evidence is accepted
// ---------------------------------------------------------------------------

describe("TC-002: 有効な evidence 付き ok=true 報告が parse 受理される", () => {
  it("TC-002: parseRequestReviewReportInput({ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } }) → { ok: true }, value.evidence matches", () => {
    const evidence = { checked: 3, skipped: 0, unverified: 0 };
    const result = parseRequestReviewReportInput({ ok: true, findings: [], evidence });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as unknown as { evidence?: typeof evidence };
      expect(value.evidence).toEqual(evidence);
    }
  });

  it("TC-002: evidence.checked=0 → parse succeeds (checked=0 → needs-discussion rule is in verdict derivation layer, not parse)", () => {
    const evidence = { checked: 0, skipped: 3, unverified: 0 };
    const result = parseRequestReviewReportInput({ ok: true, findings: [], evidence });
    // parse should succeed — the vacuous check is enforced in verdict derivation, not at parse time
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as unknown as { evidence?: typeof evidence };
      expect(value.evidence).toEqual(evidence);
    }
  });

  it("TC-002: evidence with all counts positive → { ok: true }", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 10, skipped: 2, unverified: 1 },
    });
    expect(result.ok).toBe(true);
  });

  it("TC-002: evidence with all counts zero → { ok: true } (parse accepts; verdict layer handles checked=0)", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 0, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: 負値の evidence カウントが parse 拒否される
// Source: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts
//         > Scenario: negative or non-integer counts are rejected
// ---------------------------------------------------------------------------

describe("TC-003: 負値の evidence カウントが parse 拒否される", () => {
  it("TC-003: negative checked → { ok: false } with missingFields containing 'evidence'", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: -1, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-003: negative skipped → { ok: false }", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: 1, skipped: -2, unverified: 0 },
    });
    expect(result.ok).toBe(false);
  });

  it("TC-003: negative unverified → { ok: false }", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: -3 },
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-004: ok=false の自発失敗は evidence 不要で parse 受理される
// Source: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts
//         > Scenario: voluntary failure does not require evidence
// ---------------------------------------------------------------------------

describe("TC-004: ok=false の自発失敗は evidence 不要で parse 受理される", () => {
  it("TC-004: parseRequestReviewReportInput({ ok: false, reason: 'cannot verify' }) → { ok: true }", () => {
    const result = parseRequestReviewReportInput({ ok: false, reason: "cannot verify" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ok).toBe(false);
    }
  });

  it("TC-004: parseRequestReviewReportInput({ ok: false }) without reason → { ok: true }", () => {
    const result = parseRequestReviewReportInput({ ok: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-013: 非整数（浮動小数）の evidence カウントが parse 拒否される
// Source: tasks.md > T-01 Acceptance Criteria
// ---------------------------------------------------------------------------

describe("TC-013: 非整数（浮動小数）の evidence カウントが parse 拒否される", () => {
  it("TC-013: checked: 1.5 → { ok: false } with missingFields containing 'evidence' (非整数は非負整数条件違反)", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: 1.5, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-013: skipped: 0.3 → { ok: false }", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0.3, unverified: 0 },
    });
    expect(result.ok).toBe(false);
  });

  it("TC-013: unverified: 0.1 → { ok: false }", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0.1 },
    });
    expect(result.ok).toBe(false);
  });
});
