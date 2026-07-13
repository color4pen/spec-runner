/**
 * Unit tests for buildAttestation pure function.
 *
 * TC-ATT-01: representative journal + usage → gates order, verdicts, step models, cost, journalHash
 * TC-ATT-02: journalHash matches independent sha256 of journalContent
 * TC-ATT-03: gates sorted by startedAt ascending across multiple steps
 * TC-ATT-04: outcome.toolResult.findings → FindingsSummary with correct severity/resolution counts
 * TC-ATT-05: unpriced model → step costUsd null, model in unpricedModels
 * TC-ATT-06: modelUsage === null invocation → model empty, cost null
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildAttestation } from "../../../../src/core/attestation/build-attestation.js";
import type { AttestationInput } from "../../../../src/core/attestation/types.js";
import type { UsageFile } from "../../../../src/core/usage/types.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeJournalLine(record: Record<string, unknown>): string {
  return JSON.stringify(record) + "\n";
}

function makeStepAttempt(opts: {
  step: string;
  startedAt: string;
  endedAt: string;
  verdict?: string | null;
  findings?: Array<{ severity: string; resolution: string; file: string; title: string; rationale: string }>;
}): string {
  return makeJournalLine({
    type: "step-attempt",
    step: opts.step,
    sessionId: "sess-1",
    outcome: {
      verdict: opts.verdict ?? "approved",
      findingsPath: null,
      error: null,
      ...(opts.findings !== undefined
        ? {
            toolResult: {
              ok: true,
              findings: opts.findings,
            },
          }
        : {}),
    },
    startedAt: opts.startedAt,
    endedAt: opts.endedAt,
  });
}

function emptyUsage(): UsageFile {
  return { commandInvocations: [] };
}

// ---------------------------------------------------------------------------
// TC-ATT-01: representative journal + usage
// ---------------------------------------------------------------------------

describe("TC-ATT-01: representative journal + usage → gates, verdicts, step models, cost, journalHash", () => {
  it("produces correct gates, stepModels, and cost from a representative journal", () => {
    const journal = [
      makeStepAttempt({ step: "design", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z", verdict: "approved" }),
      makeStepAttempt({ step: "implementer", startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:03:00Z", verdict: "approved" }),
      makeStepAttempt({ step: "conformance", startedAt: "2026-01-01T00:04:00Z", endedAt: "2026-01-01T00:05:00Z", verdict: "approved" }),
    ].join("");

    const usage: UsageFile = {
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T00:01:00Z",
          modelUsage: { "claude-sonnet-4-6": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 10, cacheCreationInputTokens: 5 } },
          jobId: "job-1",
          stepName: "design",
        },
        {
          command: "job",
          timestamp: "2026-01-01T00:03:00Z",
          modelUsage: { "claude-opus-4-6": { inputTokens: 200, outputTokens: 100, cacheReadInputTokens: 20, cacheCreationInputTokens: 10 } },
          jobId: "job-1",
          stepName: "implementer",
        },
        {
          command: "job",
          timestamp: "2026-01-01T00:05:00Z",
          modelUsage: { "claude-sonnet-4-6": { inputTokens: 50, outputTokens: 25, cacheReadInputTokens: 5, cacheCreationInputTokens: 2 } },
          jobId: "job-1",
          stepName: "conformance",
        },
      ],
    };

    const input: AttestationInput = { journalContent: journal, usage };
    const attestation = buildAttestation(input);

    // journalHash is non-empty hex string
    expect(attestation.journalHash).toMatch(/^[0-9a-f]{64}$/);

    // gates
    expect(attestation.gates).toHaveLength(3);
    expect(attestation.gates[0]?.step).toBe("design");
    expect(attestation.gates[0]?.verdict).toBe("approved");
    expect(attestation.gates[1]?.step).toBe("implementer");
    expect(attestation.gates[2]?.step).toBe("conformance");

    // stepModels
    const designModel = attestation.stepModels.find((sm) => sm.step === "design");
    expect(designModel?.models).toContain("claude-sonnet-4-6");

    // cost — totalCostUsd should be positive (priced models)
    expect(attestation.cost.totalCostUsd).toBeTypeOf("number");
    expect(attestation.cost.totalCostUsd).toBeGreaterThan(0);
    expect(attestation.cost.unpricedModels).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-02: journalHash matches independent sha256
// ---------------------------------------------------------------------------

describe("TC-ATT-02: journalHash matches independent sha256 of journalContent", () => {
  it("journalHash equals createHash('sha256').update(content).digest('hex')", () => {
    const journal = makeStepAttempt({
      step: "design",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const attestation = buildAttestation({ journalContent: journal, usage: emptyUsage() });

    const expected = createHash("sha256").update(journal).digest("hex");
    expect(attestation.journalHash).toBe(expected);
  });

  it("journalHash is deterministic for the same input", () => {
    const journal = makeStepAttempt({
      step: "spec-review",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const a1 = buildAttestation({ journalContent: journal, usage: emptyUsage() });
    const a2 = buildAttestation({ journalContent: journal, usage: emptyUsage() });
    expect(a1.journalHash).toBe(a2.journalHash);
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-03: gates sorted by startedAt ascending
// ---------------------------------------------------------------------------

describe("TC-ATT-03: gates sorted by startedAt ascending", () => {
  it("gates are in startedAt ascending order when steps appear out of order", () => {
    // Intentionally write conformance before design in the journal
    const journal = [
      makeStepAttempt({ step: "conformance", startedAt: "2026-01-01T00:04:00Z", endedAt: "2026-01-01T00:05:00Z" }),
      makeStepAttempt({ step: "design", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z" }),
      makeStepAttempt({ step: "implementer", startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:03:00Z" }),
    ].join("");

    const attestation = buildAttestation({ journalContent: journal, usage: emptyUsage() });

    expect(attestation.gates).toHaveLength(3);
    expect(attestation.gates[0]?.step).toBe("design");
    expect(attestation.gates[0]?.startedAt).toBe("2026-01-01T00:00:00Z");
    expect(attestation.gates[1]?.step).toBe("implementer");
    expect(attestation.gates[2]?.step).toBe("conformance");
  });

  it("multiple attempts of the same step maintain startedAt order", () => {
    const journal = [
      makeStepAttempt({ step: "code-fixer", startedAt: "2026-01-01T00:01:00Z", endedAt: "2026-01-01T00:02:00Z", verdict: "needs-fix" }),
      makeStepAttempt({ step: "code-fixer", startedAt: "2026-01-01T00:03:00Z", endedAt: "2026-01-01T00:04:00Z", verdict: "approved" }),
    ].join("");

    const attestation = buildAttestation({ journalContent: journal, usage: emptyUsage() });

    expect(attestation.gates).toHaveLength(2);
    expect(attestation.gates[0]?.attempt).toBe(1);
    expect(attestation.gates[0]?.verdict).toBe("needs-fix");
    expect(attestation.gates[1]?.attempt).toBe(2);
    expect(attestation.gates[1]?.verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-04: findings → FindingsSummary
// ---------------------------------------------------------------------------

describe("TC-ATT-04: findings → FindingsSummary with correct counts", () => {
  it("counts severity and resolution correctly", () => {
    const findings = [
      { severity: "critical", resolution: "fixable", file: "a.ts", title: "C1", rationale: "r" },
      { severity: "high", resolution: "decision-needed", file: "b.ts", title: "H1", rationale: "r" },
      { severity: "high", resolution: "fixable", file: "c.ts", title: "H2", rationale: "r" },
      { severity: "medium", resolution: "fixable", file: "d.ts", title: "M1", rationale: "r" },
      { severity: "low", resolution: "fixable", file: "e.ts", title: "L1", rationale: "r" },
    ];

    const journal = makeStepAttempt({
      step: "code-review",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
      verdict: "needs-fix",
      findings,
    });

    const attestation = buildAttestation({ journalContent: journal, usage: emptyUsage() });

    expect(attestation.gates).toHaveLength(1);
    const gate = attestation.gates[0]!;
    expect(gate.findings).toBeDefined();
    expect(gate.findings!.total).toBe(5);
    expect(gate.findings!.bySeverity.critical).toBe(1);
    expect(gate.findings!.bySeverity.high).toBe(2);
    expect(gate.findings!.bySeverity.medium).toBe(1);
    expect(gate.findings!.bySeverity.low).toBe(1);
    expect(gate.findings!.byResolution.fixable).toBe(4);
    expect(gate.findings!.byResolution.decisionNeeded).toBe(1);
  });

  it("finding title/rationale/file are NOT included in FindingsSummary", () => {
    const findings = [
      { severity: "critical", resolution: "fixable", file: "secret.ts", title: "DO NOT INCLUDE", rationale: "SECRET RATIONALE" },
    ];
    const journal = makeStepAttempt({
      step: "code-review",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
      verdict: "needs-fix",
      findings,
    });

    const attestation = buildAttestation({ journalContent: journal, usage: emptyUsage() });
    const summaryStr = JSON.stringify(attestation.gates[0]!.findings);
    expect(summaryStr).not.toContain("DO NOT INCLUDE");
    expect(summaryStr).not.toContain("SECRET RATIONALE");
    expect(summaryStr).not.toContain("secret.ts");
  });

  it("gate with no findings has no findings property", () => {
    const journal = makeStepAttempt({
      step: "design",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const attestation = buildAttestation({ journalContent: journal, usage: emptyUsage() });
    expect(attestation.gates[0]?.findings).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-05: unpriced model → stepCost null, unpricedModels populated
// ---------------------------------------------------------------------------

describe("TC-ATT-05: unpriced model → step costUsd null, model in unpricedModels", () => {
  it("unpriced model makes step costUsd null and appears in unpricedModels", () => {
    const journal = makeStepAttempt({
      step: "design",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const usage: UsageFile = {
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T00:01:00Z",
          modelUsage: {
            "unknown-future-model-xyz": {
              inputTokens: 1000,
              outputTokens: 500,
              cacheReadInputTokens: 100,
              cacheCreationInputTokens: 50,
            },
          },
          jobId: "job-1",
          stepName: "design",
        },
      ],
    };

    const attestation = buildAttestation({ journalContent: journal, usage });

    const stepCost = attestation.cost.perStep.find((ps) => ps.step === "design");
    expect(stepCost?.costUsd).toBeNull();
    expect(attestation.cost.unpricedModels).toContain("unknown-future-model-xyz");
    // totalCostUsd should be null since no priced invocations
    expect(attestation.cost.totalCostUsd).toBeNull();
  });

  it("mixed priced/unpriced: step with unpriced model gets null, but totalCostUsd includes priced steps", () => {
    const journal = [
      makeStepAttempt({ step: "design", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z" }),
      makeStepAttempt({ step: "implementer", startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:03:00Z" }),
    ].join("");

    const usage: UsageFile = {
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T00:01:00Z",
          modelUsage: {
            "claude-sonnet-4-6": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
          },
          jobId: "job-1",
          stepName: "design",
        },
        {
          command: "job",
          timestamp: "2026-01-01T00:03:00Z",
          modelUsage: {
            "unknown-model": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
          },
          jobId: "job-1",
          stepName: "implementer",
        },
      ],
    };

    const attestation = buildAttestation({ journalContent: journal, usage });

    const designCost = attestation.cost.perStep.find((ps) => ps.step === "design");
    const implCost = attestation.cost.perStep.find((ps) => ps.step === "implementer");
    expect(designCost?.costUsd).toBeTypeOf("number");
    expect(implCost?.costUsd).toBeNull();
    expect(attestation.cost.unpricedModels).toContain("unknown-model");
    // totalCostUsd is the sum of priced invocations only
    expect(attestation.cost.totalCostUsd).toBeTypeOf("number");
    expect(attestation.cost.totalCostUsd).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-06: modelUsage === null → model empty, cost null
// ---------------------------------------------------------------------------

describe("TC-ATT-06: modelUsage === null invocation → model empty, cost null", () => {
  it("step with modelUsage:null gets empty models and null costUsd", () => {
    const journal = makeStepAttempt({
      step: "design",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const usage: UsageFile = {
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T00:01:00Z",
          modelUsage: null,
          jobId: "job-1",
          stepName: "design",
        },
      ],
    };

    const attestation = buildAttestation({ journalContent: journal, usage });

    const stepModel = attestation.stepModels.find((sm) => sm.step === "design");
    const stepCost = attestation.cost.perStep.find((ps) => ps.step === "design");

    expect(stepModel?.models).toHaveLength(0);
    expect(stepCost?.costUsd).toBeNull();
    expect(attestation.cost.totalCostUsd).toBeNull();
  });

  it("invocations without stepName are excluded from per-step aggregation", () => {
    const journal = makeStepAttempt({
      step: "design",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const usage: UsageFile = {
      commandInvocations: [
        {
          // request-review invocation — no stepName
          command: "request-review",
          timestamp: "2026-01-01T00:00:30Z",
          modelUsage: {
            "claude-sonnet-4-6": { inputTokens: 999, outputTokens: 999, cacheReadInputTokens: 999, cacheCreationInputTokens: 999 },
          },
        },
        {
          command: "job",
          timestamp: "2026-01-01T00:01:00Z",
          modelUsage: {
            "claude-sonnet-4-6": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
          },
          jobId: "job-1",
          stepName: "design",
        },
      ],
    };

    const attestation = buildAttestation({ journalContent: journal, usage });

    // Only "design" step should appear in perStep
    expect(attestation.cost.perStep).toHaveLength(1);
    expect(attestation.cost.perStep[0]?.step).toBe("design");
    // Tokens should only reflect the "job" invocation, not the request-review
    expect(attestation.cost.perStep[0]?.tokens.input).toBe(100);
  });
});
