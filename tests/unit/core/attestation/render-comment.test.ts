/**
 * Unit tests for renderAttestationComment pure function.
 *
 * TC-RC-01: output contains json fence block that parses to the original attestation
 * TC-RC-02: human-readable summary contains journal hash and gate count
 */
import { describe, it, expect } from "vitest";
import { renderAttestationComment } from "../../../../src/core/attestation/render-comment.js";
import type { Attestation } from "../../../../src/core/attestation/types.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeAttestation(): Attestation {
  return {
    journalHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
    gates: [
      {
        step: "design",
        attempt: 1,
        verdict: "approved",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:01:00Z",
      },
      {
        step: "code-review",
        attempt: 1,
        verdict: "needs-fix",
        startedAt: "2026-01-01T00:02:00Z",
        endedAt: "2026-01-01T00:03:00Z",
        findings: {
          total: 3,
          bySeverity: { critical: 1, high: 1, medium: 1, low: 0 },
          byResolution: { fixable: 2, decisionNeeded: 1 },
        },
      },
      {
        step: "conformance",
        attempt: 1,
        verdict: "approved",
        startedAt: "2026-01-01T00:04:00Z",
        endedAt: "2026-01-01T00:05:00Z",
      },
    ],
    stepModels: [
      { step: "design", models: ["claude-sonnet-4-6"] },
      { step: "code-review", models: ["claude-opus-4-6"] },
      { step: "conformance", models: ["claude-sonnet-4-6"] },
    ],
    cost: {
      totalCostUsd: 0.0025,
      unpricedModels: [],
      totalTokens: { input: 350, output: 175, cacheRead: 35, cacheWrite: 17 },
      perStep: [
        { step: "design", costUsd: 0.001, tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5 } },
        { step: "code-review", costUsd: null, tokens: { input: 200, output: 100, cacheRead: 20, cacheWrite: 10 } },
        { step: "conformance", costUsd: 0.0015, tokens: { input: 50, output: 25, cacheRead: 5, cacheWrite: 2 } },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// TC-RC-01: json fence block parses back to original attestation
// ---------------------------------------------------------------------------

describe("TC-RC-01: json fence block parses to original attestation", () => {
  it("output contains a ```json fence block that JSON.parses to the attestation", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    // Extract the JSON fence block
    const match = /```json\n([\s\S]*?)\n```/.exec(comment);
    expect(match).not.toBeNull();

    const parsed = JSON.parse(match![1]!) as unknown;
    expect(parsed).toEqual(attestation);
  });

  it("the JSON block contains journalHash field", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    const match = /```json\n([\s\S]*?)\n```/.exec(comment);
    const parsed = JSON.parse(match![1]!) as Record<string, unknown>;
    expect(parsed["journalHash"]).toBe(attestation.journalHash);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-02: human-readable summary contains journalHash and gate count
// ---------------------------------------------------------------------------

describe("TC-RC-02: human-readable summary contains journalHash and gate count", () => {
  it("comment body contains the journal hash string", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    expect(comment).toContain(attestation.journalHash);
  });

  it("comment body mentions the number of gates", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    // The gate count (3) should appear somewhere in the comment
    expect(comment).toContain("3");
  });

  it("comment body contains the SpecRunner Attestation heading", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    expect(comment).toContain("SpecRunner Attestation");
  });

  it("comment body contains step names from gates", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    expect(comment).toContain("design");
    expect(comment).toContain("code-review");
    expect(comment).toContain("conformance");
  });

  it("findings summary is rendered in the gate table", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    // code-review gate has findings with 3 total
    expect(comment).toContain("crit:1");
    expect(comment).toContain("high:1");
  });

  it("null costUsd is rendered as $?", () => {
    const attestation = makeAttestation();
    const comment = renderAttestationComment(attestation);

    // code-review perStep costUsd is null
    expect(comment).toContain("$?");
  });
});
