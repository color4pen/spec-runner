/**
 * Unit tests for step-class typed parse functions in report-result.ts (T-06)
 *
 * Tests:
 * - parseProducerReportInput: status field (success / error / invalid / absent)
 * - parseJudgeReportInput: approved field (true / false / absent)
 * - parseCodeReviewReportInput: approved + fixableCount fields
 * - All three functions: ok missing → missingFields: ["ok"]
 */
import { describe, it, expect } from "vitest";
import {
  parseProducerReportInput,
  parseJudgeReportInput,
  parseCodeReviewReportInput,
} from "../../../../src/core/port/report-result.js";

// ---------------------------------------------------------------------------
// parseProducerReportInput
// ---------------------------------------------------------------------------

describe("parseProducerReportInput", () => {
  it('{ok:true, status:"success"} → value has status:"success"', () => {
    const result = parseProducerReportInput({ ok: true, status: "success" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(true);
    expect(result.value.status).toBe("success");
  });

  it('{ok:true, status:"error"} → value has status:"error"', () => {
    const result = parseProducerReportInput({ ok: true, status: "error" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(true);
    expect(result.value.status).toBe("error");
  });

  it("{ok:true} (no status) → value has status undefined", () => {
    const result = parseProducerReportInput({ ok: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(true);
    expect(result.value.status).toBeUndefined();
  });

  it('{ok:true, status:"invalid"} → status undefined (invalid value silently ignored)', () => {
    const result = parseProducerReportInput({ ok: true, status: "invalid" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.status).toBeUndefined();
  });

  it("{} (no ok) → ok:false, missingFields:['ok']", () => {
    const result = parseProducerReportInput({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toEqual(["ok"]);
  });

  it("non-object input → ok:false, missingFields:['ok']", () => {
    const result = parseProducerReportInput("not-an-object");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toEqual(["ok"]);
  });

  it("reason is propagated from base parse", () => {
    const result = parseProducerReportInput({ ok: false, reason: "something failed", status: "error" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.reason).toBe("something failed");
    expect(result.value.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// parseJudgeReportInput
// ---------------------------------------------------------------------------

describe("parseJudgeReportInput", () => {
  it("{ok:true, approved:true, findings:[]} → value has approved:true", () => {
    const result = parseJudgeReportInput({ ok: true, approved: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(true);
    expect(result.value.approved).toBe(true);
  });

  it("{ok:true, approved:false, findings:[]} → value has approved:false", () => {
    const result = parseJudgeReportInput({ ok: true, approved: false, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.approved).toBe(false);
  });

  it("{ok:true, findings:[]} (no approved) → approved undefined", () => {
    const result = parseJudgeReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.approved).toBeUndefined();
  });

  it("{} → ok:false, missingFields:['ok']", () => {
    const result = parseJudgeReportInput({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toEqual(["ok"]);
  });

  it('{ok:true, approved:"yes", findings:[]} (non-boolean approved) → approved undefined', () => {
    const result = parseJudgeReportInput({ ok: true, approved: "yes", evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.approved).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseCodeReviewReportInput
// ---------------------------------------------------------------------------

describe("parseCodeReviewReportInput", () => {
  it("{ok:true, approved:true, fixableCount:3, findings:[]} → value has approved:true, fixableCount:3", () => {
    const result = parseCodeReviewReportInput({ ok: true, approved: true, fixableCount: 3, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(true);
    expect(result.value.approved).toBe(true);
    expect(result.value.fixableCount).toBe(3);
  });

  it("{ok:true, approved:false, fixableCount:0, findings:[]} → value has approved:false, fixableCount:0", () => {
    const result = parseCodeReviewReportInput({ ok: true, approved: false, fixableCount: 0, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.approved).toBe(false);
    expect(result.value.fixableCount).toBe(0);
  });

  it("{ok:true, findings:[]} (no approved, no fixableCount) → both undefined", () => {
    const result = parseCodeReviewReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.approved).toBeUndefined();
    expect(result.value.fixableCount).toBeUndefined();
  });

  it("{} → ok:false, missingFields:['ok']", () => {
    const result = parseCodeReviewReportInput({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toEqual(["ok"]);
  });

  it('{ok:true, fixableCount:"5", findings:[]} (non-number fixableCount) → fixableCount undefined', () => {
    const result = parseCodeReviewReportInput({ ok: true, fixableCount: "5", evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.fixableCount).toBeUndefined();
  });

  it("{ok:true, approved:true, findings:[]} (fixableCount absent) → fixableCount undefined, approved set", () => {
    const result = parseCodeReviewReportInput({ ok: true, approved: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.approved).toBe(true);
    expect(result.value.fixableCount).toBeUndefined();
  });
});
