/**
 * Unit tests for renderAttestationMarkdown pure function.
 *
 * TC-050: attestation.md rendering is correct for a GitHub-disabled job
 *   (spec.md > PRが無くても完了成果と証跡の所在が得られる > attestationがbranchに載る)
 *
 * Verifies:
 *   - Document title and preamble are present
 *   - Summary table contains gates count, cost, and journal hash
 *   - Gate history table is rendered when gates exist
 *   - Gate history is omitted when there are no gates
 *   - Step models section is rendered when stepModels exist
 *   - Cost breakdown section is always present
 *   - Machine-readable JSON block is present and parseable
 *   - No GitHub-specific content in the output
 */
import { describe, it, expect } from "vitest";
import { renderAttestationMarkdown } from "../../../../src/core/attestation/render-markdown.js";
import type { Attestation } from "../../../../src/core/attestation/types.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeAttestation(overrides: Partial<Attestation> = {}): Attestation {
  return {
    journalHash: "a".repeat(64),
    gates: [],
    stepModels: [],
    cost: {
      totalCostUsd: 0.05,
      unpricedModels: [],
      totalTokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5 },
      perStep: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-RM-001: Minimal attestation renders without error
// ---------------------------------------------------------------------------

describe("TC-RM-001: minimal attestation renders without error", () => {
  it("returns a non-empty string for a minimal attestation", () => {
    const result = renderAttestationMarkdown(makeAttestation());
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("output starts with the document title", () => {
    const result = renderAttestationMarkdown(makeAttestation());
    expect(result).toMatch(/^# SpecRunner Attestation/);
  });

  it("output contains summary section heading", () => {
    const result = renderAttestationMarkdown(makeAttestation());
    expect(result).toContain("## Summary");
  });

  it("output contains cost breakdown section", () => {
    const result = renderAttestationMarkdown(makeAttestation());
    expect(result).toContain("## Cost Breakdown");
  });

  it("output contains machine-readable JSON block", () => {
    const result = renderAttestationMarkdown(makeAttestation());
    expect(result).toContain("## Machine-Readable Attestation");
    expect(result).toContain("```json");
  });
});

// ---------------------------------------------------------------------------
// TC-RM-002: Summary table contains correct fields
// ---------------------------------------------------------------------------

describe("TC-RM-002: summary table contains journal hash, cost, and gate count", () => {
  it("summary table shows the journal hash", () => {
    const hash = "b".repeat(64);
    const result = renderAttestationMarkdown(makeAttestation({ journalHash: hash }));
    expect(result).toContain(hash);
  });

  it("summary table shows the number of gates", () => {
    const gates = [
      { step: "design", attempt: 1, verdict: "approved", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z" },
      { step: "implementer", attempt: 1, verdict: "approved", startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:03:00Z" },
    ];
    const result = renderAttestationMarkdown(makeAttestation({ gates }));
    // Summary table row: | Gates | 2 |
    expect(result).toContain("| Gates | 2 |");
  });

  it("summary table shows zero when no gates", () => {
    const result = renderAttestationMarkdown(makeAttestation({ gates: [] }));
    expect(result).toContain("| Gates | 0 |");
  });
});

// ---------------------------------------------------------------------------
// TC-RM-003: Gate history section
// ---------------------------------------------------------------------------

describe("TC-RM-003: gate history section is included when gates exist", () => {
  it("includes Gate History heading and table when gates present", () => {
    const gates = [
      { step: "design", attempt: 1, verdict: "approved", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z" },
    ];
    const result = renderAttestationMarkdown(makeAttestation({ gates }));
    expect(result).toContain("## Gate History");
    expect(result).toContain("| Step | Attempt | Verdict | Findings |");
    expect(result).toContain("design");
    expect(result).toContain("approved");
  });

  it("omits Gate History section when there are no gates", () => {
    const result = renderAttestationMarkdown(makeAttestation({ gates: [] }));
    expect(result).not.toContain("## Gate History");
  });

  it("shows findings summary when gate has findings", () => {
    const gates = [
      {
        step: "code-review",
        attempt: 1,
        verdict: "needs-fix",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:01:00Z",
        findings: {
          total: 3,
          bySeverity: { critical: 1, high: 1, medium: 1, low: 0 },
          byResolution: { fixable: 2, decisionNeeded: 1 },
        },
      },
    ];
    const result = renderAttestationMarkdown(makeAttestation({ gates }));
    expect(result).toContain("3 (crit:1 high:1 med:1 low:0)");
  });

  it("shows dash when gate has no findings", () => {
    const gates = [
      { step: "design", attempt: 1, verdict: "approved", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z" },
    ];
    const result = renderAttestationMarkdown(makeAttestation({ gates }));
    // The findings cell should be "—"
    expect(result).toContain("| design | 1 | approved | — |");
  });
});

// ---------------------------------------------------------------------------
// TC-RM-004: Step models section
// ---------------------------------------------------------------------------

describe("TC-RM-004: step models section is included when stepModels exist", () => {
  it("includes Step Models heading and table when stepModels present", () => {
    const stepModels = [
      { step: "design", models: ["claude-sonnet-4-6"] },
      { step: "implementer", models: ["claude-opus-4-6"] },
    ];
    const result = renderAttestationMarkdown(makeAttestation({ stepModels }));
    expect(result).toContain("## Step Models");
    expect(result).toContain("| Step | Models |");
    expect(result).toContain("design");
    expect(result).toContain("claude-sonnet-4-6");
  });

  it("omits Step Models section when stepModels is empty", () => {
    const result = renderAttestationMarkdown(makeAttestation({ stepModels: [] }));
    expect(result).not.toContain("## Step Models");
  });

  it("multiple models for a step are joined with comma", () => {
    const stepModels = [
      { step: "implementer", models: ["claude-sonnet-4-6", "claude-opus-4-6"] },
    ];
    const result = renderAttestationMarkdown(makeAttestation({ stepModels }));
    expect(result).toContain("claude-sonnet-4-6, claude-opus-4-6");
  });
});

// ---------------------------------------------------------------------------
// TC-RM-005: Machine-readable JSON block is valid JSON
// ---------------------------------------------------------------------------

describe("TC-RM-005: machine-readable JSON block is valid and parseable", () => {
  it("JSON block parses to the original attestation object", () => {
    const attestation = makeAttestation({
      journalHash: "c".repeat(64),
      gates: [
        { step: "design", attempt: 1, verdict: "approved", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z" },
      ],
      stepModels: [{ step: "design", models: ["claude-sonnet-4-6"] }],
    });
    const result = renderAttestationMarkdown(attestation);

    // Extract JSON block
    const jsonStart = result.indexOf("```json\n") + "```json\n".length;
    const jsonEnd = result.indexOf("\n```", jsonStart);
    const jsonStr = result.slice(jsonStart, jsonEnd);

    const parsed = JSON.parse(jsonStr);
    expect(parsed.journalHash).toBe(attestation.journalHash);
    expect(parsed.gates).toHaveLength(1);
    expect(parsed.gates[0].step).toBe("design");
  });

  it("output does not contain any GitHub-specific URLs or labels", () => {
    const result = renderAttestationMarkdown(makeAttestation());
    expect(result).not.toContain("github.com");
    expect(result).not.toContain("pull request");
    expect(result).not.toContain("PR #");
  });
});

// ---------------------------------------------------------------------------
// TC-RM-006: Cost breakdown section
// ---------------------------------------------------------------------------

describe("TC-RM-006: cost breakdown section shows token counts", () => {
  it("shows input, output, cacheRead tokens in cost breakdown", () => {
    const attestation = makeAttestation({
      cost: {
        totalCostUsd: 0.01,
        unpricedModels: [],
        totalTokens: { input: 1234, output: 567, cacheRead: 89, cacheWrite: 12 },
        perStep: [],
      },
    });
    const result = renderAttestationMarkdown(attestation);
    expect(result).toContain("## Cost Breakdown");
    expect(result).toContain("1,234"); // input tokens formatted with toLocaleString
    expect(result).toContain("567");   // output tokens
    expect(result).toContain("89");    // cache read tokens
  });

  it("null totalCostUsd renders without throwing", () => {
    const attestation = makeAttestation({
      cost: {
        totalCostUsd: null,
        unpricedModels: ["unknown-model"],
        totalTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        perStep: [],
      },
    });
    expect(() => renderAttestationMarkdown(attestation)).not.toThrow();
    const result = renderAttestationMarkdown(attestation);
    expect(result).toContain("## Cost Breakdown");
  });
});
