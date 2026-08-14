/**
 * TC-002: Job base is identical on first run and on resume.
 *
 * Verifies that resolveEvidenceBaseRev(state) returns the same git revision
 * expression for a first-run state and a resumed/re-run state that share the
 * same synthesizedCommits[0] (the bootstrap commit).
 *
 * Source: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base
 *         > Scenario: Job base is identical on first run and on resume
 *
 * This file also covers the null-return branch (empty/absent ledger).
 */

import { describe, it, expect } from "vitest";
// TC-002: resolveEvidenceBaseRev is the new helper to be added by the implementer.
// Importing it as a named export; it will be `undefined` until T-02 is implemented,
// causing the tests below to fail with TypeError — correctly red.
import { resolveEvidenceBaseRev } from "../oids.js";
import type { JobState } from "../../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "oids-test-job",
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
    step: "bite-evidence",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  } as JobState;
}

// ---------------------------------------------------------------------------
// TC-002: resolveEvidenceBaseRev is identical for first-run and resume states
// ---------------------------------------------------------------------------

describe("TC-002: Job base is identical on first run and on resume", () => {
  const BOOTSTRAP_OID = "bootstrap-sha-abc1234";

  it("TC-002: first-run state with synthesizedCommits = [bootstrapOid] → returns 'bootstrapOid^'", () => {
    const state = makeState({ synthesizedCommits: [BOOTSTRAP_OID] });
    const ref = resolveEvidenceBaseRev(state);
    expect(ref).toBe(`${BOOTSTRAP_OID}^`);
  });

  it("TC-002: resume/re-run state with extra commits appended returns the same ref as first run", () => {
    // After resume: materialize, implementer, and operator commits are appended
    // to the ledger, but synthesizedCommits[0] remains the same bootstrap commit.
    const resumeState = makeState({
      synthesizedCommits: [
        BOOTSTRAP_OID,              // unchanged bootstrap (index 0)
        "materialize-run2-sha",     // appended by second test-materialize
        "implementer-run2-sha",     // appended by implementer re-run
        "operator-adopted-sha",     // appended by --adopt-commits
      ],
    });
    const ref = resolveEvidenceBaseRev(resumeState);
    // Must resolve to the same revision as the first-run state — only [0] matters.
    expect(ref).toBe(`${BOOTSTRAP_OID}^`);
  });

  it("TC-002: both states resolve to the same string (ref equality check)", () => {
    const firstRun = makeState({ synthesizedCommits: [BOOTSTRAP_OID] });
    const resumeRun = makeState({
      synthesizedCommits: [
        BOOTSTRAP_OID,
        "extra-1",
        "extra-2",
      ],
    });
    expect(resolveEvidenceBaseRev(firstRun)).toBe(resolveEvidenceBaseRev(resumeRun));
  });

  it("TC-002: empty synthesizedCommits returns null (no bootstrap commit yet)", () => {
    const state = makeState({ synthesizedCommits: [] });
    expect(resolveEvidenceBaseRev(state)).toBeNull();
  });

  it("TC-002: absent synthesizedCommits field returns null (legacy/pre-ledger state)", () => {
    const state = makeState(); // no synthesizedCommits field
    expect(resolveEvidenceBaseRev(state)).toBeNull();
  });
});
