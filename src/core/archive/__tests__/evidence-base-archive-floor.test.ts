/**
 * Evidence Base archive floor tests.
 *
 * Verifies the new archive floor behavior after the Evidence Base refactoring:
 *   TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape.
 *   TC-005: Archive floor is fail-closed when the Evidence Base reference is absent.
 *
 * Source (TC-004): spec.md > Requirement: The chronology-based contamination machinery
 *   SHALL be removed > Scenario: Archive floor derives base-red on the Evidence Base
 *   for a re-run shape.
 * Source (TC-005): spec.md > Requirement: The chronology-based contamination machinery
 *   SHALL be removed > Scenario: Archive floor is fail-closed when the Evidence Base
 *   reference is absent.
 *
 * TC-004 is RED now: the current code (P2.5 contamination check) leaves biteEvidence
 *   absent for re-run shapes. The new code runs runTestsOnSynthesizedTree instead.
 * TC-005 is RED now: the current code does not check synthesizedCommits for an EB ref
 *   and will call runtime methods. The new code bails before any I/O when EB ref is null.
 */

import { describe, it, expect } from "vitest";
import { deriveAchievedAssurance } from "../achieved-assurance.js";
import type { JobState, StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStepRun(commitOid: string, startedAt = "2026-01-01T00:01:00.000Z"): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt,
    endedAt: startedAt,
    commitOid,
  } as StepRun & { commitOid: string };
}

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "eb-floor-test-job",
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

// ---------------------------------------------------------------------------
// TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape
// ---------------------------------------------------------------------------

describe("TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape", () => {
  it("TC-004: re-run shape job achieves biteEvidence when base-red via Evidence Base and HEAD-green", async () => {
    // Re-run shape: impl1 started BEFORE base test-materialize (mat2)
    // In old code (P2.5), this → baseline unbuildable → absent.
    // In new code: Evidence Base is used (job base = bootstrap^), so no contamination issue.

    const BOOTSTRAP_OID = "bootstrap-sha-tc004";
    const BASE_OID = "mat2-sha-tc004";           // latest test-materialize OID (for file-set)
    const IMPL_OID = "impl1-sha-tc004";           // implementer before mat2 → re-run shape
    const TEST_CASE_GEN_OID = "tcg-sha-tc004";
    const FINAL_HEAD_OID = "head-sha-tc004";
    const TEST_FILE = "src/__tests__/feature.test.ts";
    const EVIDENCE_BASE_REV = `${BOOTSTRAP_OID}^`;   // resolveEvidenceBaseRev returns this
    const SCENARIO_CONTENT = "# Test Cases\n\n## TC-001\nAnchor content.\n";

    const state = makeState({
      synthesizedCommits: [BOOTSTRAP_OID],          // EB ref source
      steps: {
        "test-case-gen": [makeStepRun(TEST_CASE_GEN_OID)],
        "test-materialize": [
          makeStepRun("mat1-sha", "2026-01-01T00:01:00.000Z"),
          makeStepRun(BASE_OID, "2026-01-01T00:03:00.000Z"),   // mat2 = latest, started at T3
        ],
        "implementer": [
          makeStepRun(IMPL_OID, "2026-01-01T00:02:00.000Z"),   // impl1 started at T2 < T3 → re-run shape
        ],
      },
    });

    let synthesizedTreeCalled = false;

    const runtime = {
      listChangedFilesBetweenCommits: async (_baseOid: string, _headOid: string, _cwd: string) => {
        return { kind: "success" as const, files: [TEST_FILE] };
      },
      readFileAtCommit: async (oid: string, _filePath: string, _cwd: string) => {
        // Scenario freeze: test-cases.md unchanged between testCaseGenOid and HEAD
        if (oid === TEST_CASE_GEN_OID || oid === FINAL_HEAD_OID) {
          return { kind: "found" as const, path: "specrunner/changes/example/test-cases.md", content: SCENARIO_CONTENT };
        }
        return { kind: "unavailable" as const, reason: `unexpected oid ${oid}` };
      },
      // NEW method: Evidence Base base-red check
      runTestsOnSynthesizedTree: async (
        baseRev: string,
        _overlayFiles: string[],
        _overlayFromOid: string,
        _cwd: string,
        _config: unknown,
      ) => {
        synthesizedTreeCalled = true;
        // Evidence Base = job base (bootstrap^) + test overlay → impl absent → RED
        if (baseRev === EVIDENCE_BASE_REV) {
          return { kind: "ran" as const, results: [{ file: TEST_FILE, passed: false }] };
        }
        return { kind: "unavailable" as const, reason: `unexpected baseRev ${baseRev}` };
      },
      // HEAD-green check: unchanged from existing contract
      runTestsAtCommit: async (oid: string, _files: string[], _cwd: string, _config: unknown) => {
        if (oid === FINAL_HEAD_OID) {
          return { kind: "ran" as const, results: [{ file: TEST_FILE, passed: true }] };
        }
        // If called with the old baseOid or implOid, return unavailable (should not happen)
        return { kind: "unavailable" as const, reason: `unexpected oid ${oid}` };
      },
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/eb-floor-test",
      config: { version: 1, agents: {}, verification: { scopedTestCommand: "bun test" } } as never,
      floor: { biteEvidence: "required" },
      runtime: runtime as never,
    });

    // THEN: biteEvidence is achieved (no baseline unbuildable)
    expect(output.achieved.biteEvidence).toBe("required");

    // AND: no "baseline unbuildable" diagnostic
    const hasContaminationDiag = output.diagnostics.some(
      (d) => d.includes("baseline unbuildable") || d.includes("contamination"),
    );
    expect(hasContaminationDiag).toBe(false);

    // AND: runTestsOnSynthesizedTree was actually called (not the old runTestsAtCommit(baseOid))
    expect(synthesizedTreeCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-005: Archive floor is fail-closed when the Evidence Base reference is absent
// ---------------------------------------------------------------------------

describe("TC-005: Archive floor is fail-closed when the Evidence Base reference is absent", () => {
  it("TC-005: empty synthesizedCommits → biteEvidence absent, no I/O, no throw", async () => {
    const BASE_OID = "mat-sha-tc005";
    const TEST_FILE = "src/__tests__/feature.test.ts";
    const FINAL_HEAD_OID = "head-sha-tc005";

    // State with a test-materialize commit (so baseOid is resolvable via old code)
    // but synthesizedCommits is EMPTY → resolveEvidenceBaseRev returns null
    const state = makeState({
      synthesizedCommits: [],   // EMPTY: EB ref cannot be resolved
      steps: {
        "test-materialize": [makeStepRun(BASE_OID)],
        "implementer": [makeStepRun("impl-sha-tc005")],
      },
    });

    const ioCalls: string[] = [];

    // Runtime that tracks any calls — the new code should not call ANY method
    // when the EB ref is null (fails-closed before I/O).
    const runtime = {
      listChangedFilesBetweenCommits: async () => {
        ioCalls.push("listChangedFilesBetweenCommits");
        return { kind: "success" as const, files: [TEST_FILE] };
      },
      readFileAtCommit: async () => {
        ioCalls.push("readFileAtCommit");
        return { kind: "unavailable" as const, reason: "should not be called" };
      },
      runTestsOnSynthesizedTree: async () => {
        ioCalls.push("runTestsOnSynthesizedTree");
        return { kind: "unavailable" as const, reason: "should not be called" };
      },
      runTestsAtCommit: async () => {
        ioCalls.push("runTestsAtCommit");
        return { kind: "unavailable" as const, reason: "should not be called" };
      },
    };

    // Must not throw
    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: "/tmp/eb-floor-test",
      config: { version: 1, agents: {} } as never,
      floor: { biteEvidence: "required" },
      runtime: runtime as never,
    });

    // THEN: biteEvidence is absent (fail-closed)
    expect(output.achieved.biteEvidence).toBeUndefined();

    // AND: no runtime I/O was performed (bailed before any I/O)
    expect(ioCalls).toHaveLength(0);

    // AND: diagnostic mentions absent EB ref / synthesizedCommits
    expect(output.diagnostics.length).toBeGreaterThan(0);
  });

  it("TC-005: absent synthesizedCommits field → biteEvidence absent (legacy state)", async () => {
    const state = makeState({
      // synthesizedCommits absent entirely
      steps: {
        "test-materialize": [makeStepRun("mat-sha-tc005b")],
      },
    });

    const ioCalls: string[] = [];
    const runtime = {
      listChangedFilesBetweenCommits: async () => { ioCalls.push("listChangedFilesBetweenCommits"); return { kind: "success" as const, files: [] }; },
      readFileAtCommit: async () => { ioCalls.push("readFileAtCommit"); return { kind: "unavailable" as const, reason: "nope" }; },
      runTestsOnSynthesizedTree: async () => { ioCalls.push("runTestsOnSynthesizedTree"); return { kind: "unavailable" as const, reason: "nope" }; },
      runTestsAtCommit: async () => { ioCalls.push("runTestsAtCommit"); return { kind: "unavailable" as const, reason: "nope" }; },
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: "head-sha-tc005b",
      cwd: "/tmp/eb-floor-test",
      config: { version: 1, agents: {} } as never,
      floor: { biteEvidence: "required" },
      runtime: runtime as never,
    });

    expect(output.achieved.biteEvidence).toBeUndefined();
    expect(ioCalls).toHaveLength(0);
  });
});
