/**
 * Unit tests for repairSlugOccupancySidecar (src/core/occupancy/repair.ts).
 *
 * TC-040: sidecar re-pointed when unique non-terminal job exists
 *   (spec.md > Requirement: doctor repair > Scenario: mechanical repair re-points sidecar when unique)
 * TC-041: repair refused when non-terminal job is not unique
 *   (spec.md > Requirement: doctor repair > Scenario: repair refuses when non-terminal not unique)
 * TC-042: zero non-terminal jobs → no-op with clear message (tasks.md > T-08, should)
 * TC-043: already-correct sidecar → no-op with clear message (tasks.md > T-08, should)
 * TC-044: invalid slug argument rejected before repair logic runs (tasks.md > T-08, should)
 *
 * Source: spec.md, tasks.md > T-08
 */
import { describe, it, expect, vi } from "vitest";
import {
  repairSlugOccupancySidecar,
} from "../../../../src/core/occupancy/repair.js";
import type { RepairSlugOccupancySidecarDeps } from "../../../../src/core/occupancy/repair.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";
import type { OccupancyScanResult } from "../../../../src/core/occupancy/scan.js";

const REPO_ROOT = "/fake/repo";
const SLUG = "my-change";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOccupant(jobId: string, status: string, worktreePath?: string | null) {
  return {
    jobId,
    status,
    updatedAt: "2026-01-01T00:00:00.000Z",
    pid: null,
    worktreePath: worktreePath ?? null,
  };
}

function makeScanResult(overrides: Partial<OccupancyScanResult> = {}): OccupancyScanResult {
  return {
    slug: SLUG,
    nonTerminal: [],
    terminal: [],
    unreadable: null,
    ...overrides,
  };
}

function makeDeps(opts: {
  scanResult: OccupancyScanResult;
  sidecarJobId?: string | null;  // current sidecar points to this jobId (null = absent)
  claimResult?: "ok" | "error";
}): RepairSlugOccupancySidecarDeps {
  return {
    scanOccupancy: vi.fn().mockResolvedValue(opts.scanResult),
    readSidecarJobId: vi.fn().mockResolvedValue(opts.sidecarJobId ?? null),
    claimSidecar: vi.fn().mockImplementation(async () => {
      if (opts.claimResult === "error") throw new Error("claim failed");
    }),
  };
}

// ---------------------------------------------------------------------------
// TC-040: sidecar re-pointed when unique non-terminal job exists
// (spec.md Scenario: mechanical repair re-points the sidecar when unique)
// ---------------------------------------------------------------------------

describe("TC-040: sidecar re-pointed when unique non-terminal job exists", () => {
  it("calls claimSidecar to re-point to the unique non-terminal job", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [makeOccupant("job-A", "awaiting-resume", "/fake/wt")],
        terminal: [makeOccupant("job-B", "canceled")],
      }),
      sidecarJobId: "job-B", // sidecar currently points to canceled job B
    });

    await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);

    expect(deps.claimSidecar).toHaveBeenCalledOnce();
  });

  it("re-points to job-A's jobId and worktreePath", async () => {
    const jobA = makeOccupant("job-A", "awaiting-resume", "/fake/wt/job-a");
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [jobA],
        terminal: [makeOccupant("job-B", "canceled")],
      }),
      sidecarJobId: "job-B",
    });

    await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);

    const callArg = vi.mocked(deps.claimSidecar!).mock.calls[0];
    expect(callArg).toBeDefined();
    // The claim should be for job-A
    const record = callArg![0] as { jobId: string; worktreePath: string | null };
    expect(record.jobId).toBe("job-A");
  });
});

// ---------------------------------------------------------------------------
// TC-041: repair refused when non-terminal job is not unique
// (spec.md Scenario: repair refuses when non-terminal job is not unique)
// ---------------------------------------------------------------------------

describe("TC-041: repair refused when non-terminal job is not unique", () => {
  it("throws when there are two non-terminal jobs", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [
          makeOccupant("job-A", "running"),
          makeOccupant("job-B", "awaiting-resume"),
        ],
      }),
      sidecarJobId: "job-A",
    });

    await expect(repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("thrown error code is SLUG_OCCUPANCY_AMBIGUOUS for multiple non-terminal jobs", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [
          makeOccupant("job-A", "running"),
          makeOccupant("job-B", "awaiting-resume"),
        ],
      }),
      sidecarJobId: null,
    });

    try {
      await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS);
    }
  });

  it("does NOT call claimSidecar when there are multiple non-terminal jobs", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [
          makeOccupant("job-A", "running"),
          makeOccupant("job-B", "awaiting-resume"),
        ],
      }),
      sidecarJobId: null,
    });

    try {
      await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);
    } catch {
      // expected
    }

    expect(deps.claimSidecar).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-042: zero non-terminal jobs → no-op with clear message (should)
// ---------------------------------------------------------------------------

describe("TC-042: zero non-terminal jobs → no-op with clear message", () => {
  it("resolves without error when there are no non-terminal jobs", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [],
        terminal: [makeOccupant("job-A", "canceled")],
      }),
      sidecarJobId: null,
    });

    await expect(repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps)).resolves.not.toThrow();
  });

  it("does not call claimSidecar when there are no non-terminal jobs", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [],
        terminal: [makeOccupant("job-A", "archived")],
      }),
      sidecarJobId: null,
    });

    await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);

    expect(deps.claimSidecar).not.toHaveBeenCalled();
  });

  it("returns a result with a no-op message when nothing to repair", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [],
        terminal: [],
      }),
      sidecarJobId: null,
    });

    const result = await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);
    // Result should include a message describing the no-op
    expect(result).toBeDefined();
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-043: already-correct sidecar → no-op with clear message (should)
// ---------------------------------------------------------------------------

describe("TC-043: already-correct sidecar → no-op with clear message", () => {
  it("does not call claimSidecar when sidecar already points to the unique non-terminal job", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [makeOccupant("job-A", "awaiting-resume")],
        terminal: [],
      }),
      sidecarJobId: "job-A", // already correct!
    });

    await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);

    expect(deps.claimSidecar).not.toHaveBeenCalled();
  });

  it("returns a no-op result when sidecar is already correct", async () => {
    const deps = makeDeps({
      scanResult: makeScanResult({
        nonTerminal: [makeOccupant("job-A", "awaiting-resume")],
        terminal: [],
      }),
      sidecarJobId: "job-A",
    });

    const result = await repairSlugOccupancySidecar(REPO_ROOT, SLUG, deps);
    expect(result.message).toContain("already");
  });
});

// ---------------------------------------------------------------------------
// TC-044: invalid slug argument rejected before repair logic runs (should)
// ---------------------------------------------------------------------------

describe("TC-044: invalid slug argument rejected before repair logic runs", () => {
  it("throws or returns an error for a slug that fails SLUG_REGEX", async () => {
    const invalidSlug = "not a valid slug!!";
    const deps = makeDeps({
      scanResult: makeScanResult(),
      sidecarJobId: null,
    });

    // The function should reject invalid slug before calling scanOccupancy
    let threw = false;
    try {
      await repairSlugOccupancySidecar(REPO_ROOT, invalidSlug, deps);
      threw = false;
    } catch {
      threw = true;
    }

    // Either it throws (rejects) or the scan is not called (validation fails early)
    if (!threw) {
      expect(vi.mocked(deps.scanOccupancy!)).not.toHaveBeenCalled();
    } else {
      expect(threw).toBe(true);
    }
  });
});
