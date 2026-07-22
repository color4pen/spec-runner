/**
 * Unit tests for observations channel in report-result port.
 *
 * Covers:
 * - parseObservations: valid array / empty / non-array / invalid elements / line absent or null
 * - parseJudgeReportInput / parseCodeReviewReportInput / parseRequestReviewReportInput:
 *   observations valid → set, invalid → silent drop (missingFields clean, ok=true), absent → undefined
 * - Backward compat: observations-less input parses the same as before
 * - parse → derive integration: critical observation does not change verdict when findings empty
 */
import { describe, it, expect } from "vitest";
import {
  parseObservations,
  parseJudgeReportInput,
  parseCodeReviewReportInput,
  parseRequestReviewReportInput,
} from "../../../../src/core/port/report-result.js";
import { deriveJudgeVerdict } from "../../../../src/core/step/judge-verdict.js";

// ---------------------------------------------------------------------------
// parseObservations
// ---------------------------------------------------------------------------

describe("parseObservations — valid inputs", () => {
  it("parses a valid observations array", () => {
    const raw = [
      {
        severity: "low",
        file: "src/foo.ts",
        title: "Known risk",
        rationale: "Documented in design.md",
      },
    ];
    const result = parseObservations(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.title).toBe("Known risk");
    expect(result.value[0]).not.toHaveProperty("resolution");
  });

  it("parses an empty observations array", () => {
    const result = parseObservations([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("parses observation with optional line number", () => {
    const raw = [
      {
        severity: "medium",
        file: "src/bar.ts",
        line: 42,
        title: "Note",
        rationale: "See design",
      },
    ];
    const result = parseObservations(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.line).toBe(42);
  });

  it("parses observation without line (absent)", () => {
    const raw = [
      {
        severity: "high",
        file: "src/baz.ts",
        title: "Risk",
        rationale: "Noted",
      },
    ];
    const result = parseObservations(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).not.toHaveProperty("line");
  });

  it("parses observation with line: null (treated as absent)", () => {
    const raw = [{ severity: "low", file: "a.ts", title: "t", rationale: "r", line: null }];
    const result = parseObservations(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).not.toHaveProperty("line");
  });

  it("accepts all 4 severity values", () => {
    for (const sev of ["critical", "high", "medium", "low"] as const) {
      const raw = [{ severity: sev, file: "a.ts", title: "t", rationale: "r" }];
      const result = parseObservations(raw);
      expect(result.ok).toBe(true);
    }
  });
});

describe("parseObservations — invalid inputs", () => {
  it("returns ok:false for non-array input", () => {
    expect(parseObservations("bad")).toEqual({ ok: false });
    expect(parseObservations(null)).toEqual({ ok: false });
    expect(parseObservations(42)).toEqual({ ok: false });
    expect(parseObservations({})).toEqual({ ok: false });
  });

  it("returns ok:false for element with invalid severity", () => {
    const raw = [{ severity: "unknown", file: "a.ts", title: "t", rationale: "r" }];
    expect(parseObservations(raw)).toEqual({ ok: false });
  });

  it("returns ok:false for element missing file", () => {
    const raw = [{ severity: "low", title: "t", rationale: "r" }];
    expect(parseObservations(raw)).toEqual({ ok: false });
  });

  it("returns ok:false for element missing title", () => {
    const raw = [{ severity: "low", file: "a.ts", rationale: "r" }];
    expect(parseObservations(raw)).toEqual({ ok: false });
  });

  it("returns ok:false for element missing rationale", () => {
    const raw = [{ severity: "low", file: "a.ts", title: "t" }];
    expect(parseObservations(raw)).toEqual({ ok: false });
  });

  it("returns ok:false for element where line is non-number (and non-undefined)", () => {
    const raw = [{ severity: "low", file: "a.ts", title: "t", rationale: "r", line: "10" }];
    expect(parseObservations(raw)).toEqual({ ok: false });
  });

  it("returns ok:false for non-object element", () => {
    expect(parseObservations([null])).toEqual({ ok: false });
    expect(parseObservations(["string"])).toEqual({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// parseJudgeReportInput — observations handling
// ---------------------------------------------------------------------------

describe("parseJudgeReportInput — observations valid → set", () => {
  it("sets observations when valid array provided", () => {
    const raw = {
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      observations: [
        { severity: "low", file: "src/a.ts", title: "Note", rationale: "FYI" },
      ],
    };
    const result = parseJudgeReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeDefined();
    expect(result.value.observations).toHaveLength(1);
    expect(result.value.observations![0]!.title).toBe("Note");
  });

  it("sets observations to empty array when empty observations provided", () => {
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 }, observations: [] };
    const result = parseJudgeReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toEqual([]);
  });
});

describe("parseJudgeReportInput — observations invalid → silent drop", () => {
  it("silently drops invalid observations (string), ok=true, missingFields clean", () => {
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 }, observations: "bad" };
    const result = parseJudgeReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Should not reach here, but if it does:
      expect(result.missingFields).not.toContain("observations");
      return;
    }
    expect(result.value.observations).toBeUndefined();
  });

  it("silently drops invalid observations (bad element), ok=true", () => {
    const raw = {
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      observations: [{ severity: "invalid", file: "a.ts", title: "t", rationale: "r" }],
    };
    const result = parseJudgeReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });

  it("does not include 'observations' in missingFields on invalid input", () => {
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 }, observations: 42 };
    const result = parseJudgeReportInput(raw);
    // ok should still be true since findings are valid
    expect(result.ok).toBe(true);
  });
});

describe("parseJudgeReportInput — observations absent → undefined", () => {
  it("leaves observations undefined when field absent", () => {
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } };
    const result = parseJudgeReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseCodeReviewReportInput — observations handling
// ---------------------------------------------------------------------------

describe("parseCodeReviewReportInput — observations", () => {
  it("sets observations when valid", () => {
    const raw = {
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      observations: [{ severity: "low", file: "a.ts", title: "Note", rationale: "FYI" }],
    };
    const result = parseCodeReviewReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeDefined();
    expect(result.value.observations).toHaveLength(1);
  });

  it("silently drops invalid observations, ok=true", () => {
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 }, observations: "invalid" };
    const result = parseCodeReviewReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });

  it("leaves observations undefined when absent", () => {
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } };
    const result = parseCodeReviewReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseRequestReviewReportInput — observations handling
// ---------------------------------------------------------------------------

describe("parseRequestReviewReportInput — observations", () => {
  it("sets observations when valid", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const raw = {
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      observations: [{ severity: "medium", file: "req.md", title: "Risk noted", rationale: "FYI" }],
    };
    const result = parseRequestReviewReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeDefined();
    expect(result.value.observations![0]!.title).toBe("Risk noted");
  });

  it("silently drops invalid observations, ok=true", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 }, observations: [{ bad: "object" }] };
    const result = parseRequestReviewReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });

  it("leaves observations undefined when absent", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const raw = { ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } };
    const result = parseRequestReviewReportInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Backward compat: old toolResult without observations field
// ---------------------------------------------------------------------------

describe("backward compat — old toolResult without observations field", () => {
  it("parseJudgeReportInput parses old format (no observations field)", () => {
    const oldFormat = {
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [
        {
          severity: "high",
          resolution: "fixable",
          file: "src/old.ts",
          title: "Old finding",
          rationale: "From before observations channel",
        },
      ],
    };
    const result = parseJudgeReportInput(oldFormat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings).toHaveLength(1);
    expect(result.value.findings![0]!.title).toBe("Old finding");
    expect(result.value.observations).toBeUndefined();
  });

  it("parseCodeReviewReportInput parses old format", () => {
    const oldFormat = {
      ok: true,
      approved: true,
      fixableCount: 1,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [
        { severity: "low", resolution: "fixable", file: "a.ts", title: "Old", rationale: "r" },
      ],
    };
    const result = parseCodeReviewReportInput(oldFormat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });

  it("parseRequestReviewReportInput parses old format", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const oldFormat = {
      ok: true,
      verdict: "approve",
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
    };
    const result = parseRequestReviewReportInput(oldFormat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parse → derive integration: critical observation does not change verdict
// ---------------------------------------------------------------------------

describe("parse → derive integration: observations do not affect verdict", () => {
  it("verdict is approved when findings is empty, even with critical observation", () => {
    const raw = {
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      observations: [
        {
          severity: "critical",
          file: "src/arch.ts",
          title: "Known architectural risk",
          rationale: "Documented; no action needed",
        },
      ],
    };
    const parsed = parseJudgeReportInput(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const findings = parsed.value.findings ?? [];
    const verdict = deriveJudgeVerdict(findings, parsed.value.ok);
    expect(verdict).toBe("approved");
  });

  it("observations do not appear in findings array after parse", () => {
    const raw = {
      ok: true,
      findings: [],
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      observations: [
        { severity: "high", file: "src/x.ts", title: "Obs title", rationale: "r" },
      ],
    };
    const parsed = parseJudgeReportInput(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // findings should be empty — observations are in their own channel
    expect(parsed.value.findings).toHaveLength(0);
    expect(parsed.value.observations).toHaveLength(1);
  });
});
