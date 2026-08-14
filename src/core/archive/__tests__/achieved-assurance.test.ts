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

describe("deriveAchievedAssurance — contaminated baseline (re-run shape)", () => {
  it("leaves biteEvidence/testDerivation absent and performs no provenance I/O", async () => {
    // Rerun shape: impl1@t1 → mat2@t2 (= base, contaminated) → impl2@t3 (= candidate)
    const state = makeState({
      steps: {
        "test-materialize": [
          makeRunAt("2026-01-01T00:00:30.000Z", undefined),
          makeRunAt("2026-01-01T00:02:00.000Z", "mat2-contaminated-base"),
        ],
        "implementer": [
          makeRunAt("2026-01-01T00:01:00.000Z", "impl1-before-base"),
          makeRunAt("2026-01-01T00:03:00.000Z", "impl2-candidate"),
        ],
      },
    });

    const neverCalled = (name: string) => () => {
      throw new Error(`runtime.${name} must not be called on a contaminated baseline`);
    };
    const runtime = {
      listCommitChangedFiles: neverCalled("listCommitChangedFiles"),
      runTestsAtCommit: neverCalled("runTestsAtCommit"),
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
      output.diagnostics.some((d) => d.includes("baseline unbuildable") && d.includes("impl1-before-base")),
    ).toBe(true);
  });
});
