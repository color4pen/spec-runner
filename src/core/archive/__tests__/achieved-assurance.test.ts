/**
 * Achieved-assurance archive-floor tests.
 *
 * Verifies testDerivation derivation:
 *   - testDerivation absent when test-case-gen commitOid is absent
 *   - testDerivation "frozen" when scenario is intact
 *   - testDerivation absent when scenario is tampered
 *   - The narrowed runtime only needs readFileAtCommit
 */

import { describe, it, expect } from "vitest";
import { deriveAchievedAssurance } from "../achieved-assurance.js";
import type { JobState, StepRun } from "../../../state/schema.js";

function makeRunAt(startedAt: string, commitOid: string | undefined, attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt,
    endedAt: startedAt,
    ...(commitOid !== undefined ? { commitOid } : {}),
  } as StepRun;
}

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "assurance-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "archive",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as JobState;
}

const TC_CONTENT = "# Test Cases\n\n## TC-001: sample\nFixed content.\n";
const TC_CONTENT_TAMPERED = "# Test Cases\n\n## TC-001: sample\nTAMPERED content!\n";
const TCG_OID = "tcg-oid-001";
const FINAL_HEAD_OID = "final-head-oid-001";

describe("deriveAchievedAssurance — testDerivation derivation", () => {
  it("leaves testDerivation absent when test-case-gen commitOid is absent", async () => {
    const state = makeState({
      steps: {
        "implementer": [makeRunAt("2026-01-01T00:03:00.000Z", "impl-oid")],
        // no test-case-gen step
      },
    });

    const runtime = {
      async readFileAtCommit(_oid: string, _path: string, _cwd: string) {
        throw new Error("readFileAtCommit must not be called without testCaseGenOid");
      },
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-test-cwd",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    expect(output.achieved.testDerivation).toBeUndefined();
    expect(output.diagnostics.some((d) => d.includes("testCaseGenOid") || d.includes("test-case-gen"))).toBe(true);
  });

  it("achieves testDerivation=frozen when scenario is intact", async () => {
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        "implementer": [makeRunAt("2026-01-01T00:03:00.000Z", "impl-oid")],
      },
    });

    const runtime = {
      async readFileAtCommit(oid: string, _path: string, _cwd: string) {
        // Same content at both anchor and HEAD → scenario freeze intact
        if (oid === TCG_OID || oid === FINAL_HEAD_OID) {
          return { kind: "found" as const, path: _path, content: TC_CONTENT };
        }
        return { kind: "unavailable" as const, reason: `unexpected oid: ${oid}` };
      },
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-test-cwd",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    expect(output.achieved.testDerivation).toBe("frozen");
  });

  it("leaves testDerivation absent when scenario is tampered", async () => {
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        "implementer": [makeRunAt("2026-01-01T00:03:00.000Z", "impl-oid")],
      },
    });

    const runtime = {
      async readFileAtCommit(oid: string, _path: string, _cwd: string) {
        if (oid === TCG_OID) return { kind: "found" as const, path: _path, content: TC_CONTENT };
        if (oid === FINAL_HEAD_OID) return { kind: "found" as const, path: _path, content: TC_CONTENT_TAMPERED };
        return { kind: "unavailable" as const, reason: `unexpected oid: ${oid}` };
      },
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-test-cwd",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    expect(output.achieved.testDerivation).toBeUndefined();
    expect(output.diagnostics.some((d) => d.includes("mismatch") || d.includes("tampered"))).toBe(true);
  });

  it("runtime only needs readFileAtCommit (narrowed AssuranceProvenanceRuntime)", async () => {
    // The AssuranceProvenanceRuntime is narrowed to Pick<RuntimeStrategy, "readFileAtCommit">.
    // This test verifies that no other runtime method is called.
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    // Minimal runtime with only readFileAtCommit
    const minimalRuntime = {
      async readFileAtCommit(oid: string, _path: string, _cwd: string) {
        if (oid === TCG_OID || oid === FINAL_HEAD_OID) {
          return { kind: "found" as const, path: _path, content: TC_CONTENT };
        }
        return { kind: "unavailable" as const, reason: "not found" };
      },
    };

    // Should not throw even with a minimal runtime
    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-test-cwd",
      floor: { testDerivation: "frozen" },
      runtime: minimalRuntime,
    });

    expect(output.achieved.testDerivation).toBe("frozen");
  });
});

// ---------------------------------------------------------------------------
// T-13: deriveAchievedAssurance returns exactly testDerivation and specReview
//       (no biteEvidence) with a minimal readFileAtCommit runtime
// ---------------------------------------------------------------------------

describe("T-13: deriveAchievedAssurance — runtime with readFileAtCommit only; result has testDerivation + specReview (no biteEvidence)", () => {
  const SPEC_CONTENT = "# Spec\n\nSame content at anchor and HEAD.\n";
  const SPEC_REVIEW_OID = "spec-review-oid-001";

  it("returns testDerivation and specReview; biteEvidence absent from achieved", async () => {
    const state = makeState({
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:30.000Z",
            endedAt: "2026-01-01T00:01:00.000Z",
            commitOid: SPEC_REVIEW_OID,
          } as StepRun,
        ],
        "test-case-gen": [makeRunAt("2026-01-01T00:01:30.000Z", TCG_OID)],
        "implementer": [makeRunAt("2026-01-01T00:03:00.000Z", "impl-oid")],
      },
    });

    // Runtime exposes ONLY readFileAtCommit (T-13: narrowed type verification)
    const readFileAtCommit = async (oid: string, path: string, _cwd: string) => {
      if (path.endsWith("/spec.md") && (oid === SPEC_REVIEW_OID || oid === FINAL_HEAD_OID)) {
        return { kind: "found" as const, path, content: SPEC_CONTENT };
      }
      if (path.endsWith("/test-cases.md") && (oid === TCG_OID || oid === FINAL_HEAD_OID)) {
        return { kind: "found" as const, path, content: TC_CONTENT };
      }
      return { kind: "unavailable" as const, reason: `unexpected: ${oid} ${path}` };
    };

    const minimalRuntime = { readFileAtCommit };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-test-cwd",
      floor: { testDerivation: "frozen", specReview: "required" },
      runtime: minimalRuntime,
    });

    // Both live dimensions must be achieved
    expect(output.achieved.testDerivation).toBe("frozen");
    expect(output.achieved.specReview).toBe("required");

    // biteEvidence must be absent from result (removed dimension)
    expect(output.achieved.biteEvidence).toBeUndefined();
    expect("biteEvidence" in output.achieved).toBe(false);

    expect(output.diagnostics).toHaveLength(0);
  });

  it("achieved object has no biteEvidence key even when floor is unconstrained", async () => {
    const state = makeState({ steps: {} });

    const minimalRuntime = {
      async readFileAtCommit(_oid: string, _path: string, _cwd: string) {
        return { kind: "unavailable" as const, reason: "no data" };
      },
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-test-cwd",
      floor: {},
      runtime: minimalRuntime,
    });

    expect("biteEvidence" in output.achieved).toBe(false);
  });
});
