/**
 * Tests for evidence field enforcement in judge step completion reports.
 *
 * Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
 *
 * TC-001: ok=true の judge 完了報告で evidence フィールドが欠落した場合は拒否
 * TC-002: evidence を含む ok=true の judge 完了報告は受理される
 * TC-003: evidence の counts に負値または非整数を指定した場合は拒否
 * TC-004: ok=false（自発的失敗）のとき evidence は不要
 * TC-005: code-review / conformance も evidence 必須化を継承する
 * TC-006: request-review は evidence 必須化の対象外
 * TC-019: parseEvidence に非オブジェクト値を渡すと失敗
 * TC-020: parseEvidence にフィールドが欠落した場合は失敗
 * TC-021: parseEvidence に浮動小数点数が含まれる場合は失敗
 */
import { describe, it, expect } from "vitest";
import {
  parseJudgeReportInput,
  parseCodeReviewReportInput,
  parseConformanceReportInput,
  parseRequestReviewReportInput,
} from "../../port/report-result.js";

// TC-019/020/021: parseEvidence is a new export added in T-02.
// Using dynamic require to avoid a hard import failure before T-02 is implemented.
// Before T-02: parseEvidence is undefined → tests fail with TypeError (RED).
// After T-02: parseEvidence is defined → tests pass their assertions (GREEN).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reportResultModule = (await import("../../port/report-result.js")) as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const parseEvidence = reportResultModule["parseEvidence"] as ((v: unknown) => { ok: boolean; value?: unknown }) | undefined;

// ---------------------------------------------------------------------------
// TC-001: ok=true + evidence 欠落 → 拒否
// Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
//         > Scenario: judge report without evidence on ok=true is rejected
// ---------------------------------------------------------------------------

describe("TC-001: judge report without evidence on ok=true is rejected", () => {
  it("TC-001: parseJudgeReportInput({ ok: true, findings: [] }) with no evidence → ok:false with missingFields containing 'evidence'", () => {
    const result = parseJudgeReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-001: parseJudgeReportInput({ ok: true, findings: [], observations: [] }) with no evidence → ok:false", () => {
    const result = parseJudgeReportInput({ ok: true, findings: [], observations: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-002: ok=true + valid evidence → 受理
// Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
//         > Scenario: judge report with valid evidence is accepted
// ---------------------------------------------------------------------------

describe("TC-002: judge report with valid evidence is accepted", () => {
  it("TC-002: parseJudgeReportInput with valid evidence → ok:true, value.evidence matches", () => {
    const evidence = { checked: 3, skipped: 0, unverified: 0 };
    const result = parseJudgeReportInput({ ok: true, findings: [], evidence });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // After T-01/T-02, JudgeReportResult.evidence is a typed field.
      // Before implementation, cast through unknown to avoid TypeScript errors.
      const value = result.value as unknown as { evidence?: typeof evidence };
      expect(value.evidence).toEqual(evidence);
    }
  });

  it("TC-002: parseJudgeReportInput with evidence.checked=0 → ok:true (parse succeeds; verdict escalation is separate concern)", () => {
    const evidence = { checked: 0, skipped: 5, unverified: 0 };
    const result = parseJudgeReportInput({ ok: true, findings: [], evidence });
    // parse should succeed — verdict derivation (escalation) is a separate layer
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as unknown as { evidence?: typeof evidence };
      expect(value.evidence).toEqual(evidence);
    }
  });

  it("TC-002: parseJudgeReportInput with all counts positive → ok:true", () => {
    const evidence = { checked: 10, skipped: 2, unverified: 1 };
    const result = parseJudgeReportInput({ ok: true, findings: [], evidence });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: negative or non-integer counts → 拒否
// Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
//         > Scenario: negative or non-integer counts are rejected
// ---------------------------------------------------------------------------

describe("TC-003: negative or non-integer counts are rejected", () => {
  it("TC-003: negative checked → ok:false with missingFields containing 'evidence'", () => {
    const result = parseJudgeReportInput({
      ok: true,
      findings: [],
      evidence: { checked: -1, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-003: non-integer checked (1.5) → ok:false", () => {
    const result = parseJudgeReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 1.5, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-003: negative skipped → ok:false", () => {
    const result = parseJudgeReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: -2, unverified: 0 },
    });
    expect(result.ok).toBe(false);
  });

  it("TC-003: non-integer unverified (0.5) → ok:false", () => {
    const result = parseJudgeReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0.5 },
    });
    expect(result.ok).toBe(false);
  });

  it("TC-003: negative unverified → ok:false", () => {
    const result = parseJudgeReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: -3 },
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-004: ok=false → evidence 不要
// Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
//         > Scenario: voluntary failure does not require evidence
// ---------------------------------------------------------------------------

describe("TC-004: voluntary failure does not require evidence", () => {
  it("TC-004: parseJudgeReportInput({ ok: false, reason: 'cannot verify' }) → ok:true", () => {
    const result = parseJudgeReportInput({ ok: false, reason: "cannot verify" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ok).toBe(false);
    }
  });

  it("TC-004: parseJudgeReportInput({ ok: false }) without reason → ok:true", () => {
    const result = parseJudgeReportInput({ ok: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-005: code-review / conformance も evidence 必須化を継承する
// Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
//         > Scenario: code-review and conformance inherit the requirement
// ---------------------------------------------------------------------------

describe("TC-005: code-review and conformance inherit the evidence requirement", () => {
  it("TC-005: parseCodeReviewReportInput({ ok: true, findings: [] }) with no evidence → ok:false with 'evidence' in missingFields", () => {
    const result = parseCodeReviewReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-005: parseConformanceReportInput({ ok: true, findings: [] }) with no evidence → ok:false with 'evidence' in missingFields", () => {
    const result = parseConformanceReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain("evidence");
    }
  });

  it("TC-005: parseCodeReviewReportInput with valid evidence → ok:true", () => {
    const result = parseCodeReviewReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 2, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(true);
  });

  it("TC-005: parseConformanceReportInput with valid evidence → ok:true", () => {
    const result = parseConformanceReportInput({
      ok: true,
      findings: [],
      evidence: { checked: 2, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(true);
  });

  it("TC-005: parseCodeReviewReportInput ok=false without evidence → ok:true (voluntary failure unaffected)", () => {
    const result = parseCodeReviewReportInput({ ok: false, reason: "cannot complete" });
    expect(result.ok).toBe(true);
  });

  it("TC-005: parseConformanceReportInput ok=false without evidence → ok:true (voluntary failure unaffected)", () => {
    const result = parseConformanceReportInput({ ok: false, reason: "scope too large" });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-006: request-review は evidence 必須化の対象外
// Source: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts
//         > Scenario: request-review is unaffected
// ---------------------------------------------------------------------------

describe("TC-006: request-review is unaffected by evidence requirement", () => {
  it("TC-006: parseRequestReviewReportInput({ ok: true }) with no evidence → ok:true", () => {
    const result = parseRequestReviewReportInput({ ok: true });
    expect(result.ok).toBe(true);
  });

  it("TC-006: parseRequestReviewReportInput({ ok: true, findings: [] }) with no evidence → ok:true", () => {
    const result = parseRequestReviewReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-019: parseEvidence に非オブジェクト値を渡すと失敗
// Source: tasks.md T-02
// ---------------------------------------------------------------------------

describe("TC-019: parseEvidence with non-object values returns { ok: false }", () => {
  it("TC-019: parseEvidence('string') → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence("string");
    expect(result.ok).toBe(false);
  });

  it("TC-019: parseEvidence(null) → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence(null);
    expect(result.ok).toBe(false);
  });

  it("TC-019: parseEvidence(42) → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence(42);
    expect(result.ok).toBe(false);
  });

  it("TC-019: parseEvidence(undefined) → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence(undefined);
    expect(result.ok).toBe(false);
  });

  it("TC-019: parseEvidence([]) → { ok: false } (array is not a plain object)", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence([]);
    expect(result.ok).toBe(false);
  });

  it("TC-019: parseEvidence(true) → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence(true);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-020: parseEvidence にフィールドが欠落した場合は失敗
// Source: tasks.md T-02
// ---------------------------------------------------------------------------

describe("TC-020: parseEvidence with missing field returns { ok: false }", () => {
  it("TC-020: parseEvidence({ checked: 1, skipped: 0 }) — unverified missing → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 1, skipped: 0 });
    expect(result.ok).toBe(false);
  });

  it("TC-020: parseEvidence({ skipped: 0, unverified: 0 }) — checked missing → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ skipped: 0, unverified: 0 });
    expect(result.ok).toBe(false);
  });

  it("TC-020: parseEvidence({ checked: 1, unverified: 0 }) — skipped missing → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 1, unverified: 0 });
    expect(result.ok).toBe(false);
  });

  it("TC-020: parseEvidence({}) — all fields missing → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({});
    expect(result.ok).toBe(false);
  });

  it("TC-020: parseEvidence with all valid fields → { ok: true } (control case)", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 3, skipped: 1, unverified: 0 });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-021: parseEvidence に浮動小数点数が含まれる場合は失敗
// Source: tasks.md T-02
// ---------------------------------------------------------------------------

describe("TC-021: parseEvidence with floating point numbers returns { ok: false }", () => {
  it("TC-021: parseEvidence({ checked: 1.5, skipped: 0, unverified: 0 }) → { ok: false } (Number.isInteger check fails)", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 1.5, skipped: 0, unverified: 0 });
    expect(result.ok).toBe(false);
  });

  it("TC-021: parseEvidence({ checked: 1, skipped: 0.3, unverified: 0 }) → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 1, skipped: 0.3, unverified: 0 });
    expect(result.ok).toBe(false);
  });

  it("TC-021: parseEvidence({ checked: 1, skipped: 0, unverified: 0.1 }) → { ok: false }", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 1, skipped: 0, unverified: 0.1 });
    expect(result.ok).toBe(false);
  });

  it("TC-021: parseEvidence with integer zero values → { ok: true } (control case)", () => {
    if (!parseEvidence) throw new Error("parseEvidence not yet implemented (T-02 pending)");
    const result = parseEvidence({ checked: 0, skipped: 0, unverified: 0 });
    expect(result.ok).toBe(true);
  });
});
