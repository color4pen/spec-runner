/**
 * Unit tests for src/core/decision/wontfix.ts
 *
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
 */
import { describe, it, expect } from "vitest";
import { resolveWontfixDispositions } from "../../../../src/core/decision/wontfix.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { Finding } from "../../../../src/kernel/report-result.js";

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

function makeStepRun(findings: Finding[]): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
  };
}

function makeState(opts: {
  gateFindings?: Finding[];
  reviewerSteps?: Record<string, Finding[]>;
  reviewers?: { name: string }[];
} = {}): JobState {
  const steps: Record<string, StepRun[]> = {};

  if (opts.gateFindings) {
    steps["regression-gate"] = [makeStepRun(opts.gateFindings)];
  }

  for (const [name, findings] of Object.entries(opts.reviewerSteps ?? {})) {
    steps[name] = [makeStepRun(findings)];
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
// TC-006: regression-gate 未実行
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
// TC-008: reason 欠落
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
// TC-013: --wontfix 無しの resume は挙動不変 (no-op)
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
// TC-014: 非整数番号で exit code 2
// ---------------------------------------------------------------------------

describe("TC-014: 非整数番号で exit code 2", () => {
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
// TC-007: 番号が範囲外
// ---------------------------------------------------------------------------

describe("TC-007: 番号が範囲外で exit code 2", () => {
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
// TC-017: 重複・空要素を含む番号列でエラー
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
// TC-015: 逆引き不能な fingerprint で exit code 2
// ---------------------------------------------------------------------------

describe("TC-015: 逆引き不能な fingerprint で exit code 2", () => {
  it("returns error when gate finding fingerprint matches no reviewer chain step", () => {
    const gateOnly = makeFixableFinding({ title: "Gate only", file: "gate.ts" });
    const codeReviewFinding = makeFixableFinding({ title: "Other", file: "other.ts" });
    const state = makeState({
      gateFindings: [gateOnly],
      reviewerSteps: { "code-review": [codeReviewFinding] },
    });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found in any reviewer chain step/i);
  });
});

// ---------------------------------------------------------------------------
// TC-003: --wontfix が発生 step 由来の disposition record を永続する
// TC-002: disposition record が必須 field を持つ
// ---------------------------------------------------------------------------

describe("TC-003 / TC-002: disposition record の構造", () => {
  it("produces a DispositionDecisionRecord with correct fields", () => {
    const finding = makeFixableFinding({ title: "SQL injection", file: "src/db.ts", line: 42 });
    const state = makeState({
      gateFindings: [finding],
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

  it("findingKey is computed from source step's actual finding", () => {
    const finding = makeFixableFinding({ title: "Issue", file: "x.ts", rationale: "Test" });
    const state = makeState({
      gateFindings: [finding],
      reviewerSteps: { "code-review": [finding] },
    });
    const result = resolveWontfixDispositions(state, "1", "reason", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rec = result.records[0]!;
    // findingKey format: step|file|line|title|rationale (normalized)
    expect(rec.findingKey).toContain("code-review");
    expect(rec.findingKey).toContain("x.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-004: 同一 fingerprint を複数 step が報告した場合は各 step につき 1 record
// ---------------------------------------------------------------------------

describe("TC-004: 同一 fingerprint を複数 step が報告", () => {
  it("produces one record per source step", () => {
    // Same fingerprint reported by both code-review and custom-reviewer
    const finding = makeFixableFinding({ title: "Shared", file: "shared.ts", line: 1 });
    const customFinding = { ...finding, rationale: "From custom reviewer" }; // same fp, different rationale
    const state = makeState({
      gateFindings: [finding],
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
    // Two StepRuns for code-review, same finding
    const state: JobState = {
      ...makeState({ gateFindings: [finding] }),
      steps: {
        "regression-gate": [makeStepRun([finding])],
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
// TC-016: カンマ区切り番号列が正しく parse される
// ---------------------------------------------------------------------------

describe("TC-016: カンマ区切り番号列が正しく parse される", () => {
  it("resolves indices [1, 3] from '1,3'", () => {
    const f1 = makeFixableFinding({ title: "F1", file: "a.ts" });
    const f2 = makeFixableFinding({ title: "F2", file: "b.ts" });
    const f3 = makeFixableFinding({ title: "F3", file: "c.ts" });
    const state = makeState({
      gateFindings: [f1, f2, f3],
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
