/**
 * Unit tests for claimLivenessSidecar (src/core/occupancy/claim.ts).
 *
 * TC-023: stale (terminal) sidecar is claimed
 *   (spec.md > Requirement: liveness sidecar write is a check-and-claim > Scenario: stale sidecar)
 * TC-024: foreign non-terminal sidecar is not claimed
 *   (spec.md > Requirement: liveness sidecar write is a check-and-claim > Scenario: foreign sidecar)
 * TC-025: absent sidecar is claimed (tasks.md > T-04)
 * TC-026: same jobId sidecar is refreshed (tasks.md > T-04)
 *
 * Source: spec.md, tasks.md > T-04
 */
import { describe, it, expect, vi } from "vitest";
import { claimLivenessSidecar } from "../../../../src/core/occupancy/claim.js";
import type { ClaimLivenessSidecarDeps } from "../../../../src/core/occupancy/claim.js";
import { SpecRunnerError } from "../../../../src/errors.js";

const REPO_ROOT = "/fake/repo";
const SLUG = "S";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a sidecar record for the claiming job */
function makeRecord(jobId: string, pid?: number | null) {
  return {
    jobId,
    pid: pid ?? null,
    worktreePath: "/fake/wt",
    session: null,
  };
}

/** Build a deps object controlling the claim behavior */
function makeDeps(opts: {
  existingSidecarJobId?: string | null;    // null = sidecar absent
  existingJobStatus?: string | null;       // null = job not found in state
  writeSidecarResult?: "ok" | "error";
}): ClaimLivenessSidecarDeps {
  const { existingSidecarJobId, existingJobStatus, writeSidecarResult = "ok" } = opts;

  return {
    readSidecar: vi.fn().mockImplementation(async () => {
      if (existingSidecarJobId === null || existingSidecarJobId === undefined) return null;
      return { jobId: existingSidecarJobId };
    }),
    getJobStatus: vi.fn().mockImplementation(async (_repoRoot: string, _slug: string, _jobId: string) => {
      return existingJobStatus ?? null;
    }),
    writeSidecar: vi.fn().mockImplementation(async () => {
      if (writeSidecarResult === "error") {
        throw new Error("write failed");
      }
    }),
  };
}

// ---------------------------------------------------------------------------
// TC-023: stale (terminal) sidecar is claimed
// (spec.md Scenario: stale sidecar is claimed)
// ---------------------------------------------------------------------------

describe("TC-023: stale (terminal) sidecar is claimed", () => {
  it("overwrites the sidecar when it points to a canceled (terminal) job", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-B",
      existingJobStatus: "canceled",
    });
    const record = makeRecord("job-A");

    await claimLivenessSidecar(REPO_ROOT, SLUG, record, deps);

    expect(deps.writeSidecar).toHaveBeenCalledOnce();
  });

  it("overwrites the sidecar when it points to an archived (terminal) job", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-B",
      existingJobStatus: "archived",
    });
    const record = makeRecord("job-A");

    await claimLivenessSidecar(REPO_ROOT, SLUG, record, deps);

    expect(deps.writeSidecar).toHaveBeenCalledOnce();
  });

  it("overwrites the sidecar when it points to a job that no longer exists in state", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-stale",
      existingJobStatus: null, // job not in state → stale
    });
    const record = makeRecord("job-A");

    await claimLivenessSidecar(REPO_ROOT, SLUG, record, deps);

    expect(deps.writeSidecar).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-024: foreign non-terminal sidecar is not claimed
// (spec.md Scenario: foreign non-terminal sidecar is not claimed)
// ---------------------------------------------------------------------------

describe("TC-024: foreign non-terminal sidecar is not claimed", () => {
  it("throws when the sidecar points to a different running (non-terminal) job", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-B",    // different job
      existingJobStatus: "running",     // non-terminal
    });
    const record = makeRecord("job-A"); // claiming job

    await expect(claimLivenessSidecar(REPO_ROOT, SLUG, record, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("does not overwrite the sidecar when it belongs to a non-terminal foreign job", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-B",
      existingJobStatus: "awaiting-resume",
    });
    const record = makeRecord("job-A");

    try {
      await claimLivenessSidecar(REPO_ROOT, SLUG, record, deps);
    } catch {
      // expected to throw
    }

    expect(deps.writeSidecar).not.toHaveBeenCalled();
  });

  it("throws for an awaiting-archive foreign job", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-B",
      existingJobStatus: "awaiting-archive",
    });
    const record = makeRecord("job-A");

    await expect(claimLivenessSidecar(REPO_ROOT, SLUG, record, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("throws for a failed foreign job (non-terminal)", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-B",
      existingJobStatus: "failed",
    });
    const record = makeRecord("job-A");

    await expect(claimLivenessSidecar(REPO_ROOT, SLUG, record, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });
});

// ---------------------------------------------------------------------------
// TC-025: absent sidecar is claimed
// ---------------------------------------------------------------------------

describe("TC-025: absent sidecar is claimed (ENOENT)", () => {
  it("writes the sidecar when it does not exist", async () => {
    const deps = makeDeps({
      existingSidecarJobId: null, // sidecar absent
      existingJobStatus: null,
    });
    const record = makeRecord("job-A");

    await claimLivenessSidecar(REPO_ROOT, SLUG, record, deps);

    expect(deps.writeSidecar).toHaveBeenCalledOnce();
  });

  it("resolves without throwing when sidecar is absent", async () => {
    const deps = makeDeps({
      existingSidecarJobId: null,
      existingJobStatus: null,
    });
    const record = makeRecord("job-A");

    await expect(claimLivenessSidecar(REPO_ROOT, SLUG, record, deps)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-026: same jobId sidecar is refreshed (re-established)
// ---------------------------------------------------------------------------

describe("TC-026: same jobId sidecar is refreshed (re-established)", () => {
  it("overwrites the sidecar when it already points to the same jobId", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-A", // same as claimant
      existingJobStatus: "running",
    });
    const record = makeRecord("job-A");

    await claimLivenessSidecar(REPO_ROOT, SLUG, record, deps);

    expect(deps.writeSidecar).toHaveBeenCalledOnce();
  });

  it("resolves without throwing when same jobId re-establishes", async () => {
    const deps = makeDeps({
      existingSidecarJobId: "job-A",
      existingJobStatus: "running",
    });
    const record = makeRecord("job-A");

    await expect(claimLivenessSidecar(REPO_ROOT, SLUG, record, deps)).resolves.toBeUndefined();
  });
});
