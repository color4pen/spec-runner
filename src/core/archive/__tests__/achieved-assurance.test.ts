/**
 * Achieved-assurance archive-floor tests.
 *
 * Verifies:
 *   - Contaminated baseline (re-run shape: an implementer commit predates the base
 *     test-materialize commit) leaves biteEvidence/testDerivation absent without
 *     running any provenance I/O — the archive floor must not grant assurance on
 *     a base with implementation mixed in. Mirrors the bite-evidence gate check.
 *
 * The clean-shape counterpart (biteEvidence achieved on a normal run) is covered by
 * src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts (TC-010 floor).
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

describe("deriveAchievedAssurance — Evidence Base reference absent", () => {
  it("leaves biteEvidence absent and performs no provenance I/O when synthesizedCommits is absent and floor requires biteEvidence", async () => {
    // synthesizedCommits absent → resolveEvidenceBaseRev returns null → early return at P2.5
    // (P2.5 is guarded by floorConstrainsBite, so it short-circuits before any I/O).
    const state = makeState({
      steps: {
        "test-materialize": [
          makeRunAt("2026-01-01T00:02:00.000Z", "mat-oid"),
        ],
        "implementer": [
          makeRunAt("2026-01-01T00:03:00.000Z", "impl-oid"),
        ],
      },
      // synthesizedCommits absent → resolveEvidenceBaseRev → null → fail-closed (biteEvidence only)
    });

    const neverCalled = (name: string) => () => {
      throw new Error(`runtime.${name} must not be called when EB ref is absent`);
    };
    const runtime = {
      listCommitChangedFiles: neverCalled("listCommitChangedFiles"),
      runTestsAtCommit: neverCalled("runTestsAtCommit"),
      runTestsOnSynthesizedTree: neverCalled("runTestsOnSynthesizedTree"),
      diffPathsBetweenCommits: neverCalled("diffPathsBetweenCommits"),
      readFileAtCommit: neverCalled("readFileAtCommit"),
    };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid: "final-head-oid",
      cwd: "/tmp/assurance-test-cwd",
      config: {} as never,
      floor: { biteEvidence: "required" } as never,
      runtime: runtime as never,
    });

    expect(output.achieved.biteEvidence).toBeUndefined();
    expect(output.achieved.testDerivation).toBeUndefined();
    expect(
      output.diagnostics.some((d) => d.includes("Evidence Base reference absent")),
    ).toBe(true);
  });
});
