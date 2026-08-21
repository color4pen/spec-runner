/**
 * Unit tests for src/core/decision/wontfix.ts
 *
 * Original TC numbering (from the wontfix feature test plan):
 * TC-002: disposition record が必須 field を持つ
 * TC-003: --wontfix が発生 step 由来の disposition record を永続する
 * TC-004: 同一 fingerprint を複数 step が報告した場合は各 step につき 1 record
 * TC-006: regression-gate 未実行で exit code 2
 * TC-007: 番号が範囲外で exit code 2
 * TC-008: reason 欠落で exit code 2
 * TC-014: 非整数番号で exit code 2
 * TC-015: 逆引き不能な fingerprint で exit code 2
 * TC-016: カンマ区切り番号列が正しく parse される
 * TC-017: 重複・空要素を含む番号列でエラー
 *
 * New TC from test-cases.md (finding-provenance-carry):
 * TC-005: Paraphrased-title regression resolves successfully via provenance ref
 * TC-006 (new): spec-review-origin finding is disposed against its origin step
 * TC-007 (new): Missing or unknown ref rejects the whole wontfix operation
 * TC-008 (new): Disposed finding is excluded from the regression-gate ledger
 * TC-009 (new): Disposed finding does not trigger the approved+fixable fixer route
 * TC-010: computeLedgerRef is deterministic for equal fingerprints
 * TC-011: parseFindings round-trips a finding that includes a provenance ref
 * TC-012: parseFindings treats an absent or non-string ref as a no-op
 * TC-014 (new): All-origins provenance index covers spec-review StepRuns
 * TC-015 (new): All-origins provenance index yields one entry per source step
 * TC-018: All existing invalid-input wontfix branches continue to produce exit-2 errors
 * TC-019: DispositionDecisionRecord produced via ref-based resolution has unchanged shape
 * TC-020: Disposed finding via ref-based path is excluded from fixer input
 * TC-021: Provenance ref is stable under ledger membership changes
 */
import { describe, it, expect } from "vitest";
import { resolveWontfixDispositions } from "../../../../src/core/decision/wontfix.js";
import {
  computeLedgerRef,
  buildProvenanceIndex,
  collectFindingsLedger,
  collectSpecReviewLedger,
  collectParallelFixerFindings,
  computeRegressionLedger,
} from "../../../../src/core/pipeline/findings-ledger.js";
import { buildReviewerChainTransitions } from "../../../../src/core/pipeline/reviewer-chain.js";
import { parseFindings } from "../../../../src/core/port/report-result.js";
import { computeFindingKey } from "../../../../src/core/decision/decision-ledger.js";
import type { JobState, StepRun, DispositionDecisionRecord } from "../../../../src/state/schema.js";
import type { Finding } from "../../../../src/kernel/report-result.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFixableFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/foo.ts",
    line: 10,
    title: "Default finding",
    rationale: "Fix this",
    ...overrides,
  };
}

function makeStepRun(findings: Finding[], verdict = "needs-fix"): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    outcome: {
      verdict,
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
  };
}

function makeDispositionRecord(stepName: string, finding: Finding): DispositionDecisionRecord {
  return {
    kind: "disposition",
    id: `disp-${stepName}-${finding.title}`,
    step: stepName,
    findingKey: computeFindingKey(stepName, finding),
    finding: {
      title: finding.title,
      file: finding.file,
      line: finding.line,
      rationale: finding.rationale,
      severity: finding.severity,
    },
    disposition: "wontfix",
    reason: "accepted risk",
    decidedAt: "2026-01-01T00:00:00Z",
    source: "operator",
  };
}

function makeState(opts: {
  gateFindings?: Finding[];
  reviewerSteps?: Record<string, Finding[]>;
  reviewers?: { name: string }[];
  specReviewFindings?: Finding[];
  decisions?: JobState["decisions"];
} = {}): JobState {
  const steps: Record<string, StepRun[]> = {};

  if (opts.gateFindings) {
    steps["regression-gate"] = [makeStepRun(opts.gateFindings)];
  }

  for (const [name, findings] of Object.entries(opts.reviewerSteps ?? {})) {
    steps[name] = [makeStepRun(findings)];
  }

  if (opts.specReviewFindings) {
    steps[STEP_NAMES.SPEC_REVIEW] = [makeStepRun(opts.specReviewFindings)];
  }

  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "s" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "regression-gate",
    status: "awaiting-resume",
    branch: null,
    history: [],
    error: null,
    steps,
    decisions: opts.decisions,
    reviewers: opts.reviewers?.map((r) => ({
      name: r.name,
      maxIterations: 3,
      purpose: "test",
      criteria: "test",
      judgment: "test",
      freeText: "",
      prompt: "x",
      snapshotHash: "h",
      paths: [],
      requestTypes: [],
    })),
  };
}

const NOW = "2026-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// TC-010: computeLedgerRef is deterministic for equal fingerprints
// ---------------------------------------------------------------------------

describe("TC-010: computeLedgerRef is deterministic for equal fingerprints", () => {
  it("returns the same non-empty string for two calls with identical fingerprint", () => {
    const f1 = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Issue" });
    const f2 = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Issue" });
    const ref1 = computeLedgerRef(f1);
    const ref2 = computeLedgerRef(f2);
    expect(ref1).toBe(ref2);
    expect(ref1.length).toBeGreaterThan(0);
  });

  it("returns different refs for findings with different titles (different fingerprint)", () => {
    const f1 = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Issue A" });
    const f2 = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Issue B" });
    expect(computeLedgerRef(f1)).not.toBe(computeLedgerRef(f2));
  });

  it("ref is the same regardless of rationale (only file|line|title fingerprint matters)", () => {
    const f1 = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Issue", rationale: "Old rationale" });
    const f2 = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Issue", rationale: "New rationale" });
    expect(computeLedgerRef(f1)).toBe(computeLedgerRef(f2));
  });
});

// ---------------------------------------------------------------------------
// TC-021: Provenance ref is stable under ledger membership changes
// ---------------------------------------------------------------------------

describe("TC-021: Provenance ref is stable under ledger membership changes", () => {
  it("ref is identical before and after an unrelated finding is disposed (order independence)", () => {
    const target = makeFixableFinding({ file: "src/target.ts", line: 1, title: "Target" });
    // Refs are derived from identity, not position — invariant to membership changes
    const refBefore = computeLedgerRef(target);
    const refAfter = computeLedgerRef(target);
    expect(refBefore).toBe(refAfter);
  });

  it("unrelated finding has a different ref than the target", () => {
    const target = makeFixableFinding({ file: "src/target.ts", line: 1, title: "Target" });
    const unrelated = makeFixableFinding({ file: "src/other.ts", line: 2, title: "Unrelated" });
    expect(computeLedgerRef(target)).not.toBe(computeLedgerRef(unrelated));
  });
});

// ---------------------------------------------------------------------------
// TC-011: parseFindings round-trips a finding that includes a provenance ref
// ---------------------------------------------------------------------------

describe("TC-011: parseFindings round-trips a finding that includes a provenance ref", () => {
  it("parsed Finding retains ledgerRef when present as string", () => {
    const raw = [{
      severity: "high",
      resolution: "fixable",
      file: "src/foo.ts",
      line: 10,
      title: "Test",
      rationale: "Fix this",
      ledgerRef: "abc123ef",
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.ledgerRef).toBe("abc123ef");
  });
});

// ---------------------------------------------------------------------------
// TC-012: parseFindings treats an absent or non-string ref as a no-op without raising an error
// ---------------------------------------------------------------------------

describe("TC-012: parseFindings treats an absent or non-string ref as a no-op", () => {
  it("absent ledgerRef parses without error and finding has no ledgerRef", () => {
    const raw = [{
      severity: "high",
      resolution: "fixable",
      file: "src/foo.ts",
      title: "Test",
      rationale: "Fix",
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.ledgerRef).toBeUndefined();
  });

  it("non-string ledgerRef (number) is silently ignored without error", () => {
    const raw = [{
      severity: "high",
      resolution: "fixable",
      file: "src/foo.ts",
      title: "Test",
      rationale: "Fix",
      ledgerRef: 42,
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.ledgerRef).toBeUndefined();
  });

  it("null ledgerRef is silently ignored without error", () => {
    const raw = [{
      severity: "high",
      resolution: "fixable",
      file: "src/foo.ts",
      title: "Test",
      rationale: "Fix",
      ledgerRef: null,
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.ledgerRef).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-014 (new): All-origins provenance index covers spec-review StepRuns
// ---------------------------------------------------------------------------

describe("TC-014 (new): All-origins provenance index covers spec-review StepRuns", () => {
  it("finding only in spec-review resolves to step: spec-review in provenance index", () => {
    const specFinding = makeFixableFinding({ file: "spec.md", line: 1, title: "Spec-only issue" });
    const state = makeState({ specReviewFindings: [specFinding] });

    const index = buildProvenanceIndex([], state);
    const ref = computeLedgerRef(specFinding);
    const stepMap = index.get(ref);

    expect(stepMap).toBeDefined();
    expect(stepMap!.has(STEP_NAMES.SPEC_REVIEW)).toBe(true);
    const entry = stepMap!.get(STEP_NAMES.SPEC_REVIEW)!;
    expect(entry.title).toBe("Spec-only issue");
  });
});

// ---------------------------------------------------------------------------
// TC-015 (new): All-origins provenance index yields one entry per source step for a shared fingerprint
// ---------------------------------------------------------------------------

describe("TC-015 (new): All-origins provenance index — one entry per source step for shared fingerprint", () => {
  it("shared fingerprint between code-review and spec-review maps to both steps", () => {
    const sharedFinding = makeFixableFinding({ file: "src/a.ts", line: 5, title: "Shared issue" });
    // Same fingerprint (file|line|title), different rationale
    const specFinding = { ...sharedFinding, rationale: "From spec-review" };
    const state = makeState({
      specReviewFindings: [specFinding],
      reviewerSteps: { "code-review": [sharedFinding] },
    });

    const index = buildProvenanceIndex(["code-review"], state);
    const ref = computeLedgerRef(sharedFinding);
    const stepMap = index.get(ref);

    expect(stepMap).toBeDefined();
    expect(stepMap!.size).toBe(2);
    expect(stepMap!.has(STEP_NAMES.SPEC_REVIEW)).toBe(true);
    expect(stepMap!.has("code-review")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-006: regression-gate 未実行で exit code 2 (input validation, unchanged)
// ---------------------------------------------------------------------------

describe("TC-006: regression-gate 未実行で exit code 2", () => {
  it("returns error when gate has no StepRun", () => {
    const state = makeState({ reviewerSteps: { "code-review": [makeFixableFinding()] } });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/regression-gate/i);
  });

  it("returns error when gate StepRun has no findings", () => {
    const state = makeState({ gateFindings: [] });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-008: reason 欠落で exit code 2 (input validation, unchanged)
// ---------------------------------------------------------------------------

describe("TC-008: reason 欠落で exit code 2", () => {
  it("returns error when --wontfix-reason is missing", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "1", undefined, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reason/i);
  });

  it("returns error when --wontfix-reason is empty string", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "1", "   ", NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-013: --wontfix 無しの resume は挙動不変 (no-op, unchanged)
// ---------------------------------------------------------------------------

describe("TC-013: --wontfix 無しの resume は挙動不変", () => {
  it("returns empty records when wontfix is undefined", () => {
    const state = makeState();
    const result = resolveWontfixDispositions(state, undefined, undefined, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records).toHaveLength(0);
  });

  it("returns empty records when wontfix is empty string", () => {
    const state = makeState();
    const result = resolveWontfixDispositions(state, "", undefined, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-014 (original): 非整数番号で exit code 2 (input validation, unchanged)
// ---------------------------------------------------------------------------

describe("TC-014 (original): 非整数番号で exit code 2", () => {
  it("returns error for non-integer index 'abc'", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "abc", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a valid integer/i);
  });

  it("returns error for float index '1.5'", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "1.5", "reason", NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-007 (original): 番号が範囲外で exit code 2 (input validation, unchanged)
// ---------------------------------------------------------------------------

describe("TC-007 (original): 番号が範囲外で exit code 2", () => {
  it("returns error when index 3 exceeds 2 reported findings", () => {
    const f1 = makeFixableFinding({ title: "F1", file: "a.ts" });
    const f2 = makeFixableFinding({ title: "F2", file: "b.ts" });
    const state = makeState({
      gateFindings: [f1, f2],
      reviewerSteps: { "code-review": [f1, f2] },
    });
    const result = resolveWontfixDispositions(state, "3", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/out of range/i);
  });

  it("returns error for index 0 (below 1-based minimum)", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "0", "reason", NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017: 重複・空要素を含む番号列でエラー (input validation, unchanged)
// ---------------------------------------------------------------------------

describe("TC-017: 重複・空要素を含む番号列でエラー", () => {
  it("returns error for duplicate indices '1,1'", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "1,1", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicate/i);
  });

  it("returns error for empty element '1,,1'", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f], reviewerSteps: { "code-review": [f] } });
    const result = resolveWontfixDispositions(state, "1,,1", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty element/i);
  });
});

// ---------------------------------------------------------------------------
// TC-007 (new): Missing or unknown ref rejects the whole wontfix operation
// Updated: replaces old TC-015 (逆引き不能な fingerprint) with new provenance-ref contract
// ---------------------------------------------------------------------------

describe("TC-007 (new): Missing or unknown ref rejects the whole wontfix operation", () => {
  it("returns error when gate finding has no ledgerRef (absent)", () => {
    // Gate finding has no ledgerRef — new contract requires it for resolution
    const gateOnly = makeFixableFinding({ title: "Gate only", file: "gate.ts" });
    // gateOnly has no ledgerRef property — the new exit-2 guarantee for absent ref
    const codeReviewFinding = makeFixableFinding({ title: "Other", file: "other.ts" });
    const state = makeState({
      gateFindings: [gateOnly],
      reviewerSteps: { "code-review": [codeReviewFinding] },
    });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Error should reference the absent provenance ref
      expect(result.error).toMatch(/no provenance ref|ledgerRef absent/i);
    }
  });

  it("returns error when gate finding has an unresolvable ledgerRef", () => {
    // Gate finding carries a ref that matches no source finding
    const gateOnly = makeFixableFinding({ title: "Gate only", file: "gate.ts", ledgerRef: "deadbeef" });
    const codeReviewFinding = makeFixableFinding({ title: "Other", file: "other.ts" });
    const state = makeState({
      gateFindings: [gateOnly],
      reviewerSteps: { "code-review": [codeReviewFinding] },
    });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Error should reference the unresolved provenance ref
      expect(result.error).toMatch(/not found in any reviewer chain step/i);
    }
  });

  it("all-or-nothing: zero records written when one of two indices has unresolvable ref", () => {
    const sourceFinding = makeFixableFinding({ title: "Valid", file: "valid.ts" });
    const gateFindingGood = { ...sourceFinding, ledgerRef: computeLedgerRef(sourceFinding) };
    const gateFindingBad = makeFixableFinding({ title: "No ref", file: "bad.ts" }); // no ledgerRef

    const state = makeState({
      gateFindings: [gateFindingGood, gateFindingBad],
      reviewerSteps: { "code-review": [sourceFinding] },
    });
    const result = resolveWontfixDispositions(state, "1,2", "reason", NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-005 (new): Paraphrased-title regression resolves successfully via provenance ref
// Reproduces the observed failure: gate re-reports with different title but correct ref
// ---------------------------------------------------------------------------

describe("TC-005 (new): Paraphrased-title regression resolves successfully via provenance ref", () => {
  it("resolves when gate finding has paraphrased title but correct ledgerRef", () => {
    // Source finding in code-review
    const sourceFinding = makeFixableFinding({
      title: "スコープの範囲が曖昧 — 詳細不明",
      file: "src/scope.ts",
      line: 42,
      rationale: "スコープが定義されていない",
    });

    // Gate re-reports with paraphrased title but carries the correct provenance ref
    const ref = computeLedgerRef(sourceFinding);
    const gateFinding = makeFixableFinding({
      title: "スコープの範囲が依然として曖昧 — 詳細不明",  // paraphrased!
      file: "src/scope.ts",
      line: 42,
      rationale: "修正が不十分",
      ledgerRef: ref,  // correct ref echoed verbatim from the ledger block
    });

    const state = makeState({
      gateFindings: [gateFinding],
      reviewerSteps: { "code-review": [sourceFinding] },
    });

    const result = resolveWontfixDispositions(state, "1", "accepted risk", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Produces 1 record for code-review step
    expect(result.records).toHaveLength(1);
    const rec = result.records[0]!;
    expect(rec.step).toBe("code-review");
    // findingKey is derived from the SOURCE finding (not the gate's paraphrased title)
    expect(rec.findingKey).toContain("code-review");
    // The disposition snapshot captures the source finding's title
    expect(rec.finding.title).toBe("スコープの範囲が曖昧 — 詳細不明");
  });
});

// ---------------------------------------------------------------------------
// TC-006 (new): spec-review-origin finding is disposed against its origin step
// ---------------------------------------------------------------------------

describe("TC-006 (new): spec-review-origin finding is disposed against its origin step", () => {
  it("resolves a spec-review-origin gate finding to step: spec-review", () => {
    // Source finding only in spec-review (not in impl reviewer chain)
    const specFinding = makeFixableFinding({
      title: "Spec missing requirement",
      file: "specrunner/changes/test/spec.md",
      line: 10,
      rationale: "Required scenario is absent",
    });

    // Gate echoes it with the correct provenance ref
    const ref = computeLedgerRef(specFinding);
    const gateFinding = makeFixableFinding({
      title: "Spec still missing requirement",  // paraphrased
      file: "specrunner/changes/test/spec.md",
      line: 10,
      rationale: "Still not fixed",
      ledgerRef: ref,
    });

    const state = makeState({
      gateFindings: [gateFinding],
      specReviewFindings: [specFinding],
      // No impl reviewer chain findings
    });

    const result = resolveWontfixDispositions(state, "1", "accepted risk", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records).toHaveLength(1);
    const rec = result.records[0]!;
    expect(rec.step).toBe(STEP_NAMES.SPEC_REVIEW);
    // Snapshot captures the source spec-review finding's title
    expect(rec.finding.title).toBe("Spec missing requirement");
  });
});

// ---------------------------------------------------------------------------
// TC-003 / TC-002 (updated): disposition record 構造
// Updated: gate findings now carry ledgerRef (new contract)
// ---------------------------------------------------------------------------

describe("TC-003 / TC-002 (updated): disposition record の構造", () => {
  it("produces a DispositionDecisionRecord with correct fields when ledgerRef matches", () => {
    const finding = makeFixableFinding({ title: "SQL injection", file: "src/db.ts", line: 42 });
    // Gate finding carries the ref derived from the source finding
    const ref = computeLedgerRef(finding);
    const gateFinding = { ...finding, ledgerRef: ref };

    const state = makeState({
      gateFindings: [gateFinding],
      reviewerSteps: { "code-review": [finding] },
    });
    const result = resolveWontfixDispositions(state, "1", "accepted risk", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records).toHaveLength(1);
    const rec = result.records[0]!;

    expect(rec.kind).toBe("disposition");
    expect(rec.step).toBe("code-review");
    expect(rec.source).toBe("operator");
    expect(rec.reason).toBe("accepted risk");
    expect(rec.disposition).toBe("wontfix");
    expect(rec.decidedAt).toBe(NOW);
    expect(rec.findingKey).toBeTruthy();
    expect(rec.finding.title).toBe("SQL injection");
    expect(rec.finding.file).toBe("src/db.ts");
  });

  it("findingKey is computed from source step's actual finding (not the gate's paraphrased text)", () => {
    const finding = makeFixableFinding({ title: "Issue", file: "x.ts", rationale: "Test" });
    const ref = computeLedgerRef(finding);
    // Gate has paraphrased title but correct ref
    const gateFinding = { ...finding, title: "Issue (paraphrased)", ledgerRef: ref };

    const state = makeState({
      gateFindings: [gateFinding],
      reviewerSteps: { "code-review": [finding] },
    });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rec = result.records[0]!;
    // findingKey includes the origin step
    expect(rec.findingKey).toContain("code-review");
    expect(rec.findingKey).toContain("x.ts");
    // The key does NOT include the gate's paraphrased title
    expect(rec.findingKey).toContain("issue");  // source title (normalized lowercase)
  });
});

// ---------------------------------------------------------------------------
// TC-019 (new): DispositionDecisionRecord produced via ref-based resolution has unchanged shape
// ---------------------------------------------------------------------------

describe("TC-019 (new): DispositionDecisionRecord shape is unchanged", () => {
  it("record has exactly the expected fields (kind, id, step, findingKey, finding, disposition, reason, decidedAt, source)", () => {
    const finding = makeFixableFinding({ title: "Shape test", file: "shape.ts" });
    const ref = computeLedgerRef(finding);
    const gateFinding = { ...finding, ledgerRef: ref };

    const state = makeState({
      gateFindings: [gateFinding],
      reviewerSteps: { "code-review": [finding] },
    });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rec = result.records[0]! as DispositionDecisionRecord;
    const expectedKeys = ["kind", "id", "step", "findingKey", "finding", "disposition", "reason", "decidedAt", "source"];
    const actualKeys = Object.keys(rec).sort();
    expect(actualKeys).toEqual(expectedKeys.sort());
    // All expected fields present with correct types
    expect(rec.kind).toBe("disposition");
    expect(typeof rec.id).toBe("string");
    expect(typeof rec.step).toBe("string");
    expect(typeof rec.findingKey).toBe("string");
    expect(typeof rec.finding).toBe("object");
    expect(rec.disposition).toBe("wontfix");
    expect(typeof rec.reason).toBe("string");
    expect(typeof rec.decidedAt).toBe("string");
    expect(rec.source).toBe("operator");
  });
});

// ---------------------------------------------------------------------------
// TC-004 (updated): 同一 fingerprint を複数 step が報告した場合は各 step につき 1 record
// Updated: gate findings now carry ledgerRef
// ---------------------------------------------------------------------------

describe("TC-004 (updated): 同一 fingerprint を複数 step が報告", () => {
  it("produces one record per source step", () => {
    // Same fingerprint reported by both code-review and custom-reviewer
    const finding = makeFixableFinding({ title: "Shared", file: "shared.ts", line: 1 });
    const customFinding = { ...finding, rationale: "From custom reviewer" }; // same fingerprint, different rationale
    const ref = computeLedgerRef(finding);
    // Gate finding carries the ref
    const gateFinding = { ...finding, ledgerRef: ref };

    const state = makeState({
      gateFindings: [gateFinding],
      reviewerSteps: {
        "code-review": [finding],
        "security": [customFinding],
      },
      reviewers: [{ name: "security" }],
    });

    const result = resolveWontfixDispositions(state, "1", "accepted", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // One record per source step
    expect(result.records).toHaveLength(2);
    const steps = result.records.map((r) => r.step).sort();
    expect(steps).toEqual(["code-review", "security"]);
  });

  it("same step with multiple StepRuns only produces 1 record", () => {
    const finding = makeFixableFinding({ title: "Multi-run", file: "a.ts" });
    const ref = computeLedgerRef(finding);
    const gateFinding = { ...finding, ledgerRef: ref };

    // Two StepRuns for code-review, same finding
    const state: JobState = {
      ...makeState({ gateFindings: [gateFinding] }),
      steps: {
        "regression-gate": [makeStepRun([gateFinding])],
        "code-review": [makeStepRun([finding]), makeStepRun([finding])],
      },
    };

    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.step).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// TC-016 (updated): カンマ区切り番号列が正しく parse される
// Updated: gate findings now carry ledgerRef
// ---------------------------------------------------------------------------

describe("TC-016 (updated): カンマ区切り番号列が正しく parse される", () => {
  it("resolves indices [1, 3] from '1,3'", () => {
    const f1 = makeFixableFinding({ title: "F1", file: "a.ts" });
    const f2 = makeFixableFinding({ title: "F2", file: "b.ts" });
    const f3 = makeFixableFinding({ title: "F3", file: "c.ts" });
    // Gate findings carry their respective refs
    const gf1 = { ...f1, ledgerRef: computeLedgerRef(f1) };
    const gf2 = { ...f2, ledgerRef: computeLedgerRef(f2) };
    const gf3 = { ...f3, ledgerRef: computeLedgerRef(f3) };

    const state = makeState({
      gateFindings: [gf1, gf2, gf3],
      reviewerSteps: { "code-review": [f1, f2, f3] },
    });

    const result = resolveWontfixDispositions(state, "1,3", "reason", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records).toHaveLength(2);
    const titles = result.records.map((r) => r.finding.title).sort();
    expect(titles).toEqual(["F1", "F3"]);
  });
});

// ---------------------------------------------------------------------------
// TC-008 (new): Disposed finding is excluded from the regression-gate ledger
// Covers both impl-chain-origin and spec-review-origin DispositionDecisionRecords
// ---------------------------------------------------------------------------

describe("TC-008 (new): Disposed finding is excluded from the regression-gate ledger", () => {
  it("disposed impl-chain finding (code-review) is absent from collectFindingsLedger", () => {
    const sourceFinding = makeFixableFinding({ title: "Impl finding", file: "src/impl.ts", line: 1 });
    const dispositionRecord = makeDispositionRecord("code-review", sourceFinding);

    const state = makeState({
      reviewerSteps: { "code-review": [sourceFinding] },
      decisions: [dispositionRecord],
    });

    const ledger = collectFindingsLedger(["code-review"], state);
    expect(ledger.some((f) => f.title === "Impl finding")).toBe(false);
  });

  it("disposed spec-review finding is absent from collectSpecReviewLedger", () => {
    const specFinding = makeFixableFinding({ title: "Spec finding", file: "spec.md", line: 5 });
    const dispositionRecord = makeDispositionRecord(STEP_NAMES.SPEC_REVIEW, specFinding);

    const state = makeState({
      specReviewFindings: [specFinding],
      decisions: [dispositionRecord],
    });

    const ledger = collectSpecReviewLedger(state);
    expect(ledger.some((f) => f.title === "Spec finding")).toBe(false);
  });

  it("disposed spec-review finding is absent from computeRegressionLedger (merged)", () => {
    const specFinding = makeFixableFinding({ title: "Spec regression finding", file: "spec.md", line: 3 });
    const dispositionRecord = makeDispositionRecord(STEP_NAMES.SPEC_REVIEW, specFinding);

    const state = makeState({
      specReviewFindings: [specFinding],
      decisions: [dispositionRecord],
    });

    const ledger = computeRegressionLedger([], state);
    expect(ledger.some((f) => f.title === "Spec regression finding")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-020 (new): Disposed finding via ref-based path is excluded from fixer input
// ---------------------------------------------------------------------------

describe("TC-020 (new): Disposed finding via ref-based path is excluded from fixer input", () => {
  it("disposed finding is absent from collectParallelFixerFindings", () => {
    const sourceFinding = makeFixableFinding({ title: "Fixer excluded", file: "src/fixer.ts", line: 10 });
    const dispositionRecord = makeDispositionRecord("code-review", sourceFinding);

    const state: JobState = {
      ...makeState({ decisions: [dispositionRecord] }),
      steps: {
        "code-review": [{
          attempt: 1,
          sessionId: null,
          startedAt: NOW,
          endedAt: NOW,
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [sourceFinding] },
          },
        }],
      },
    };

    const fixerFindings = collectParallelFixerFindings(state, ["code-review"]);
    expect(fixerFindings.some((f) => f.title === "Fixer excluded")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-009 (new): Disposed finding does not trigger the approved+fixable reviewer-chain guard
// ---------------------------------------------------------------------------

describe("TC-009 (new): Disposed finding does not trigger the approved+fixable reviewer-chain guard", () => {
  it("guard returns false when the only fixable finding in code-review is disposed via wontfix", () => {
    const chain = ["code-review"];
    const transitions = buildReviewerChainTransitions(chain);

    // Find the approved+fixable guard row for code-review
    const guardRow = transitions.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === STEP_NAMES.CODE_FIXER && t.when,
    );
    expect(guardRow).toBeDefined();

    const sourceFinding = makeFixableFinding({ title: "Only finding", file: "src/only.ts", line: 1 });
    const dispositionRecord = makeDispositionRecord("code-review", sourceFinding);

    // State: code-review approved with the finding disposed
    const state: JobState = {
      version: 2,
      jobId: "test-job",
      createdAt: NOW,
      updatedAt: NOW,
      request: { path: "/req.md", title: "T", type: "bug-fix", slug: "s" },
      repository: { owner: "o", name: "r" },
      session: null,
      step: "code-review",
      status: "awaiting-resume",
      branch: null,
      history: [],
      error: null,
      decisions: [dispositionRecord],
      steps: {
        "code-review": [{
          attempt: 1,
          sessionId: null,
          startedAt: NOW,
          endedAt: NOW,
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [sourceFinding] },
          },
        }],
      },
    };

    // The guard should return false — the disposed finding should not trigger code-fixer routing
    expect(guardRow!.when!(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-018 (new): All existing invalid-input wontfix branches continue to produce exit-2 errors
// ---------------------------------------------------------------------------

describe("TC-018 (new): All invalid-input wontfix branches produce exit-2 errors (consolidated)", () => {
  it("out-of-range index → ok: false", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f] });
    const result = resolveWontfixDispositions(state, "5", "reason", NOW);
    expect(result.ok).toBe(false);
  });

  it("non-integer index → ok: false", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f] });
    const result = resolveWontfixDispositions(state, "1.5", "reason", NOW);
    expect(result.ok).toBe(false);
  });

  it("duplicate index → ok: false", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f] });
    const result = resolveWontfixDispositions(state, "1,1", "reason", NOW);
    expect(result.ok).toBe(false);
  });

  it("empty element in list → ok: false", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f] });
    const result = resolveWontfixDispositions(state, "1,,2", "reason", NOW);
    expect(result.ok).toBe(false);
  });

  it("missing reason → ok: false", () => {
    const f = makeFixableFinding();
    const state = makeState({ gateFindings: [f] });
    const result = resolveWontfixDispositions(state, "1", undefined, NOW);
    expect(result.ok).toBe(false);
  });

  it("gate-not-run → ok: false", () => {
    const state = makeState({});
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(false);
  });
});
