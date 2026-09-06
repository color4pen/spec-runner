/**
 * T-10: Fail-closed drift guard.
 *
 * Guards against regressions in the remediation-required enforcement:
 * - A fixable finding without remediation MUST NOT produce ok:true from parseJudgeReportInput.
 *   If it did, the executor could derive "approved" from that result.
 * - An empty findings array MUST produce ok:true and verdict "approved"
 *   (the happy path must not be broken by the enforcement).
 *
 * This test is intentionally structured so that if the fail-closed enforcement regresses
 * (e.g. requireRemediation is accidentally dropped from parseJudgeReportInput), the test fails.
 */
import { describe, it, expect } from "vitest";
import { parseJudgeReportInput } from "../../port/report-result.js";
import { deriveJudgeVerdict } from "../judge-verdict.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_FIXABLE_NO_REMEDIATION = {
  severity: "high" as const,
  resolution: "fixable" as const,
  file: "src/foo.ts",
  title: "Missing invariant guard",
  rationale: "The guard is absent",
};

const BASE_FIXABLE_WITH_REMEDIATION = {
  ...BASE_FIXABLE_NO_REMEDIATION,
  remediation: {
    invariant: "Guard must be present at src/foo.ts",
    sites: [{ file: "src/foo.ts" }],
    approach: "Add the guard before assignment",
  },
};

// ---------------------------------------------------------------------------
// Fail-closed: fixable without remediation → never approved
// ---------------------------------------------------------------------------

describe("fail-closed drift guard — fixable without remediation", () => {
  it("parseJudgeReportInput with fixable+no-remediation returns ok:false (not ok:true)", () => {
    // CRITICAL GUARD: if this assertion fails, the fail-closed enforcement has regressed.
    // A fixable finding without remediation MUST NOT parse successfully in judge context.
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [BASE_FIXABLE_NO_REMEDIATION],
    });
    expect(result.ok).toBe(false);
  });

  it("parseJudgeReportInput with fixable+no-remediation → missingFields includes 'findings.remediation'", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [BASE_FIXABLE_NO_REMEDIATION],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Guard: should have been ok:false — fail-closed enforcement regressed");
    expect(result.missingFields).toContain("findings.remediation");
  });

  it("approved verdict is impossible when fixable-without-remediation is the only finding", () => {
    // Simulate what the executor would do: parse → derive verdict
    // If parseJudgeReportInput returns ok:false, the executor never derives "approved"
    const parsed = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [BASE_FIXABLE_NO_REMEDIATION],
    });
    // The parse MUST fail — executor never sees findings
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      // Hypothetical: if parse succeeded (regression), derive what verdict would be
      // This should not be reached, but shows what would go wrong if it were
      const findings = parsed.value.findings ?? [];
      const verdict = deriveJudgeVerdict(findings, parsed.value.ok);
      // A fixable high finding would give needs-fix, not approved — but we never get here
      expect(verdict).not.toBe("approved");
    }
  });
});

// ---------------------------------------------------------------------------
// Happy path: findings: [] → approved (must not be broken by enforcement)
// ---------------------------------------------------------------------------

describe("fail-closed drift guard — empty findings → approved (not broken)", () => {
  it("parseJudgeReportInput with findings:[] → ok:true", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [],
    });
    expect(result.ok).toBe(true);
  });

  it("findings:[] → deriveJudgeVerdict returns 'approved'", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const verdict = deriveJudgeVerdict(result.value.findings ?? [], result.value.ok);
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Happy path: fixable WITH remediation → ok:true
// ---------------------------------------------------------------------------

describe("fail-closed drift guard — fixable WITH remediation → ok:true", () => {
  it("parseJudgeReportInput with fixable+remediation → ok:true", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [BASE_FIXABLE_WITH_REMEDIATION],
    });
    expect(result.ok).toBe(true);
  });

  it("fixable+remediation → verdict is needs-fix (finding drives routing)", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [BASE_FIXABLE_WITH_REMEDIATION],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const verdict = deriveJudgeVerdict(result.value.findings ?? [], result.value.ok);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// Identity invariance: remediation does not affect findingFingerprint / computeLedgerRef
// ---------------------------------------------------------------------------

describe("identity invariance — remediation has no effect on fingerprint", () => {
  it("computeLedgerRef is same with and without remediation", async () => {
    const { computeLedgerRef } = await import("../../pipeline/findings-ledger.js");
    const withoutRem = {
      severity: "high" as const,
      resolution: "fixable" as const,
      file: "src/foo.ts",
      line: 42,
      title: "Bug",
      rationale: "R",
    };
    const withRem = {
      ...withoutRem,
      remediation: {
        invariant: "Invariant",
        sites: [{ file: "src/foo.ts", line: 42 }],
        approach: "Fix",
      },
    };
    const refWithout = computeLedgerRef(withoutRem);
    const refWith = computeLedgerRef(withRem);
    expect(refWith).toBe(refWithout);
  });
});
