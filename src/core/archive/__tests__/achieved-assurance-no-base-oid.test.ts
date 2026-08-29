/**
 * TC-008: archive floor は test-materialize なしで判定に到達する
 * TC-015: scenario 凍結が intact なら testDerivation は frozen
 * TC-015a: no test-materialize でも testDerivation は frozen（D4 独立性）
 * TC-016: scenario がすり替えられたら testDerivation は absent
 *
 * After absorb-test-materialize and remove-bite-evidence:
 * - test-materialize is no longer a separate step (absorbed into implementer).
 * - testDerivation depends solely on scenario binding (test-cases.md hash intact).
 * - Runtime only requires readFileAtCommit (AssuranceProvenanceRuntime narrowed).
 */
import { describe, it, expect } from "vitest";
import { deriveAchievedAssurance } from "../achieved-assurance.js";
import type { JobState, StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    jobId: "assurance-no-base-test",
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

const TC_CONTENT_INTACT = "# Test Cases\n\n## TC-001: sample\nFixed content.\n";
const TC_CONTENT_CHANGED = "# Test Cases\n\n## TC-001: sample\nTAMPERED content!\n";

const TCG_OID = "tcg-oid-no-base-001";
const FINAL_HEAD_OID = "final-head-oid-no-base-001";

function makeFakeRuntime(opts: { tcAtAnchor: string; tcAtHead: string }) {
  return {
    async readFileAtCommit(oid: string, _path: string, _cwd: string) {
      if (oid === TCG_OID) {
        return { kind: "found" as const, path: _path, content: opts.tcAtAnchor };
      }
      if (oid === FINAL_HEAD_OID) {
        return { kind: "found" as const, path: _path, content: opts.tcAtHead };
      }
      return { kind: "unavailable" as const, reason: `unexpected oid: ${oid}` };
    },
  };
}

// ---------------------------------------------------------------------------
// TC-008: archive floor は test-materialize なしで判定に到達する
// ---------------------------------------------------------------------------

describe("TC-008: archive floor without test-materialize reaches judgment", () => {
  it("TC-008: forward-type job with NO test-materialize and intact scenario achieves testDerivation", async () => {
    const state = makeState({
      steps: {
        // No test-materialize step (absorbed into implementer)
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        "implementer": [makeRunAt("2026-01-01T00:02:00.000Z", "impl-sha-008")],
      },
    });

    const runtime = makeFakeRuntime({
      tcAtAnchor: TC_CONTENT_INTACT,
      tcAtHead: TC_CONTENT_INTACT, // same → scenario intact
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    // testDerivation should be achieved
    expect(output.achieved.testDerivation).toBe("frozen");
    // No baseOid-related early-return diagnostic
    expect(output.diagnostics.every((d) => !d.includes("baseOid is null"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-015: scenario 凍結が intact なら testDerivation は frozen
// ---------------------------------------------------------------------------

describe("TC-015: scenario intact → testDerivation frozen (no test-materialize run)", () => {
  it("TC-015: testDerivation=frozen when test-cases.md content matches at anchor and HEAD", async () => {
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    const runtime = makeFakeRuntime({
      tcAtAnchor: TC_CONTENT_INTACT,
      tcAtHead: TC_CONTENT_INTACT, // same → scenario intact
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    expect(output.achieved.testDerivation).toBe("frozen");
    // baseOid-related diagnostic must NOT appear
    expect(output.diagnostics.every((d) => !d.includes("baseOid"))).toBe(true);
  });

  it("TC-015: test-materialize absence does NOT block testDerivation judgment", async () => {
    // Regression guard: testDerivation must not be gated on test-materialize commitOid.
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
        // Explicitly no test-materialize
      },
    });

    const runtime = makeFakeRuntime({
      tcAtAnchor: TC_CONTENT_INTACT,
      tcAtHead: TC_CONTENT_INTACT,
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    expect(output.achieved.testDerivation).toBe("frozen");
  });
});

// ---------------------------------------------------------------------------
// TC-015a: testDerivation は scenario binding にのみ依存する（D4 独立性）
// ---------------------------------------------------------------------------

describe("TC-015a: testDerivation frozen is independent of materializedTestFiles (D4 independence)", () => {
  it("TC-015a: testDerivation=frozen even with no test files in diff", async () => {
    // After remove-bite-evidence: testDerivation depends only on scenario binding.
    // No runtime call for file listing is made.
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    const runtime = makeFakeRuntime({
      tcAtAnchor: TC_CONTENT_INTACT,
      tcAtHead: TC_CONTENT_INTACT, // scenario intact
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    // testDerivation must be "frozen" — D4 independence from file-set
    expect(output.achieved.testDerivation).toBe("frozen");
  });
});

// ---------------------------------------------------------------------------
// TC-016: scenario がすり替えられたら testDerivation は absent
// ---------------------------------------------------------------------------

describe("TC-016: scenario tampered → testDerivation absent (fail-closed)", () => {
  it("TC-016: testDerivation=absent when test-cases.md content differs at anchor and HEAD", async () => {
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    const runtime = makeFakeRuntime({
      tcAtAnchor: TC_CONTENT_INTACT,
      tcAtHead: TC_CONTENT_CHANGED, // MISMATCH: scenario was tampered
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    // testDerivation must be absent (fail-closed) when scenario is tampered
    expect(output.achieved.testDerivation).toBeUndefined();
  });

  it("TC-016: testDerivation absent when scenario completely changed", async () => {
    // Regression guard: scenario mismatch takes precedence.
    const state = makeState({
      steps: {
        "test-case-gen": [makeRunAt("2026-01-01T00:01:00.000Z", TCG_OID)],
      },
    });

    const runtime = makeFakeRuntime({
      tcAtAnchor: TC_CONTENT_INTACT,
      tcAtHead: "Completely different content that was tampered after test-case-gen",
    });

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/assurance-no-base-test",
      floor: { testDerivation: "frozen" },
      runtime,
    });

    expect(output.achieved.testDerivation).toBeUndefined();
  });
});
