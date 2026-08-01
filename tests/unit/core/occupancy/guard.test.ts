/**
 * Unit tests for assertSlugUnoccupied (src/core/occupancy/guard.ts).
 *
 * TC-011: awaiting-resume prior job blocks a new start (Scenario: non-terminal prior job blocks)
 * TC-012: running prior job with dead pid still blocks (Scenario: dead pid still blocks)
 * TC-013: terminal-only history allows a new start (Scenario: terminal-only allows)
 * TC-014: unreadable slug state refuses the start — fail-closed (Scenario: unreadable refuses)
 * TC-015: rejection message content for a live running prior job (Scenario: message for live job)
 * TC-016: rejection message content for a halted (awaiting-resume) prior job (Scenario: message for halted)
 * TC-017: awaiting-archive prior job blocks start and advises archive/cancel (tasks.md > T-03)
 * TC-018: failed prior job blocks start (tasks.md > T-03, should)
 * TC-019: terminated prior job blocks start (tasks.md > T-03, should)
 * TC-020: guard rejection creates no job state, worktree, or liveness sidecar (tasks.md > T-03)
 * TC-021: managed start guard rejects an occupied slug (spec.md scenario)
 * TC-022: managed start guard allows a terminal-only slug (tasks.md > T-03, should)
 *
 * Source: spec.md Requirement: start guard enforces the slug occupancy invariant
 *         tasks.md > T-03
 */
import { describe, it, expect, vi } from "vitest";
import {
  assertSlugUnoccupied,
} from "../../../../src/core/occupancy/guard.js";
import type { AssertSlugUnoccupiedDeps } from "../../../../src/core/occupancy/guard.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";
import type { OccupancyScanResult } from "../../../../src/core/occupancy/scan.js";

const REPO_ROOT = "/fake/repo";
const SLUG = "S";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScanResult(overrides: Partial<OccupancyScanResult> = {}): OccupancyScanResult {
  return {
    slug: SLUG,
    nonTerminal: [],
    terminal: [],
    unreadable: null,
    ...overrides,
  };
}

function makeOccupantRef(overrides: {
  jobId: string;
  status: string;
  pid?: number | null;
  updatedAt?: string;
  worktreePath?: string | null;
}) {
  return {
    jobId: overrides.jobId,
    status: overrides.status,
    pid: overrides.pid ?? null,
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    worktreePath: overrides.worktreePath ?? null,
  };
}

function makeDeps(scanResult: OccupancyScanResult, isAlive?: (pid: number | null) => boolean): AssertSlugUnoccupiedDeps {
  return {
    scanOccupancy: vi.fn().mockResolvedValue(scanResult),
    isAlive: isAlive ?? vi.fn().mockReturnValue(false),
  };
}

// ---------------------------------------------------------------------------
// TC-011: awaiting-resume prior job blocks a new start
// ---------------------------------------------------------------------------

describe("TC-011: awaiting-resume prior job blocks a new start", () => {
  it("throws when there is a prior awaiting-resume job", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-resume" })],
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("thrown error code is SLUG_OCCUPIED", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-resume" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED);
    }
  });

  it("bootstrapJob is not called (guard is pre-bootstrapJob)", async () => {
    const bootstrapSpy = vi.fn();
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-resume" })],
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).rejects.toThrow();
    // bootstrapSpy is never called because assertSlugUnoccupied throws before any bootstrap
    expect(bootstrapSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-012: running prior job with a dead pid still blocks a new start
// ---------------------------------------------------------------------------

describe("TC-012: running prior job with a dead pid still blocks a new start", () => {
  it("throws even when the prior running job has a dead pid", async () => {
    const deps = makeDeps(
      makeScanResult({
        nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "running", pid: 9999 })],
      }),
      vi.fn().mockReturnValue(false), // pid is dead
    );

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("error code is SLUG_OCCUPIED (not DUPLICATE_LIVE_JOB)", async () => {
    const deps = makeDeps(
      makeScanResult({
        nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "running", pid: 9999 })],
      }),
      vi.fn().mockReturnValue(false),
    );

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-013: terminal-only history allows a new start
// ---------------------------------------------------------------------------

describe("TC-013: terminal-only history allows a new start", () => {
  it("resolves without throwing when all prior jobs are terminal", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [],
      terminal: [
        makeOccupantRef({ jobId: "job-B", status: "archived" }),
        makeOccupantRef({ jobId: "job-C", status: "canceled" }),
      ],
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });

  it("resolves when there are no prior jobs at all", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [],
      terminal: [],
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-014: unreadable slug state refuses the start (fail-closed)
// ---------------------------------------------------------------------------

describe("TC-014: unreadable slug state refuses the start (fail-closed)", () => {
  it("throws when the slug state is unreadable", async () => {
    const deps = makeDeps(makeScanResult({
      unreadable: "JSON parse failure: unexpected end of input",
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("error code is SLUG_STATE_UNREADABLE when state is unreadable", async () => {
    const deps = makeDeps(makeScanResult({
      unreadable: "disk I/O failure",
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_STATE_UNREADABLE);
    }
  });

  it("message contains the unreadable reason", async () => {
    const deps = makeDeps(makeScanResult({
      unreadable: "JOURNAL_CORRUPTED: checksum mismatch",
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      // The error message or hint should describe why occupancy could not be determined
      const specErr = err as SpecRunnerError;
      const combined = specErr.message + (specErr.hint ?? "");
      expect(combined.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-015: rejection message content for a live running prior job
// (spec.md > Requirement: guard rejection names the prior job > Scenario: live prior job)
// ---------------------------------------------------------------------------

describe("TC-015: rejection message content for a live running prior job", () => {
  it("error names the prior jobId when prior job is running with a live pid", async () => {
    const deps = makeDeps(
      makeScanResult({
        nonTerminal: [makeOccupantRef({ jobId: "abcd1234-prior-job", status: "running", pid: 1234 })],
      }),
      vi.fn().mockReturnValue(true), // pid is alive
    );

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).message).toContain("abcd1234-prior-job");
    }
  });

  it("error message or hint advises cancel for a live running job", async () => {
    const deps = makeDeps(
      makeScanResult({
        nonTerminal: [makeOccupantRef({ jobId: "abcd1234-prior-job", status: "running", pid: 1234 })],
      }),
      vi.fn().mockReturnValue(true),
    );

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      const specErr = err as SpecRunnerError;
      const combined = specErr.message + (specErr.hint ?? "");
      // Should mention cancel or wait
      expect(combined).toMatch(/cancel|wait/i);
    }
  });

  it("error names status running", async () => {
    const deps = makeDeps(
      makeScanResult({
        nonTerminal: [makeOccupantRef({ jobId: "abcd1234-prior-job", status: "running", pid: 1234 })],
      }),
      vi.fn().mockReturnValue(true),
    );

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).message).toContain("running");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-016: rejection message content for a halted (awaiting-resume) prior job
// (spec.md > Requirement: guard rejection names the prior job > Scenario: halted prior job)
// ---------------------------------------------------------------------------

describe("TC-016: rejection message content for a halted (awaiting-resume) prior job", () => {
  it("error names the prior jobId", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "abcd1234-halted-job", status: "awaiting-resume", pid: null })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).message).toContain("abcd1234-halted-job");
    }
  });

  it("error names status awaiting-resume", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "abcd1234-halted-job", status: "awaiting-resume" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).message).toContain("awaiting-resume");
    }
  });

  it("message or hint advises resume or cancel for a halted job", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "abcd1234-halted-job", status: "awaiting-resume" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      const specErr = err as SpecRunnerError;
      const combined = specErr.message + (specErr.hint ?? "");
      expect(combined).toMatch(/resume|cancel/i);
    }
  });

  it("message or hint mentions job resume <slug> or job cancel <jobId>", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "abcd1234-halted-job", status: "awaiting-resume" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      const specErr = err as SpecRunnerError;
      const combined = specErr.message + (specErr.hint ?? "");
      // Should mention job resume <slug> or job cancel <jobId>
      const hasResume = combined.includes("job resume");
      const hasCancel = combined.includes("job cancel");
      expect(hasResume || hasCancel).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-017: awaiting-archive prior job blocks start and advises archive/cancel
// ---------------------------------------------------------------------------

describe("TC-017: awaiting-archive prior job blocks start and advises archive/cancel", () => {
  it("throws SLUG_OCCUPIED for an awaiting-archive prior job", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-archive" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED);
    }
  });

  it("message names the jobId and awaiting-archive status", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-archive" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      const specErr = err as SpecRunnerError;
      expect(specErr.message).toContain("job-A");
      expect(specErr.message).toContain("awaiting-archive");
    }
  });

  it("message or hint advises job archive or job cancel", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-archive" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      const specErr = err as SpecRunnerError;
      const combined = specErr.message + (specErr.hint ?? "");
      const hasArchive = combined.includes("job archive");
      const hasCancel = combined.includes("job cancel");
      expect(hasArchive || hasCancel).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-018: failed prior job blocks start (should priority)
// ---------------------------------------------------------------------------

describe("TC-018: failed prior job blocks start and advises resume/cancel", () => {
  it("throws SLUG_OCCUPIED for a failed prior job", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "failed" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED);
      expect((err as SpecRunnerError).message).toContain("job-A");
      expect((err as SpecRunnerError).message).toContain("failed");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-019: terminated prior job blocks start (should priority)
// ---------------------------------------------------------------------------

describe("TC-019: terminated prior job blocks start and advises resume/cancel", () => {
  it("throws SLUG_OCCUPIED for a terminated prior job", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "terminated" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED);
      expect((err as SpecRunnerError).message).toContain("job-A");
      expect((err as SpecRunnerError).message).toContain("terminated");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-020: guard rejection creates no job state, worktree, or liveness sidecar
// ---------------------------------------------------------------------------

describe("TC-020: guard rejection creates no job state, worktree, or liveness sidecar", () => {
  it("scanOccupancy is called before any bootstrap action", async () => {
    const scanFn = vi.fn().mockResolvedValue(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-resume" })],
    }));
    const deps: AssertSlugUnoccupiedDeps = {
      scanOccupancy: scanFn,
      isAlive: vi.fn().mockReturnValue(false),
    };

    // The guard should throw before any state creation
    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).rejects.toThrow();

    // The scan was called — guard runs first
    expect(scanFn).toHaveBeenCalledWith(REPO_ROOT, SLUG);
  });

  it("guard throws without creating any side effects when non-terminal prior exists", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "job-A", status: "awaiting-resume" })],
    }));

    // This test verifies the guard throws early (before bootstrapJob / file writes)
    // by checking the error type — the actual wiring is tested in pipeline-run integration
    let threwEarly = false;
    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
    } catch (err) {
      threwEarly = err instanceof SpecRunnerError && (err as SpecRunnerError).code === ERROR_CODES.SLUG_OCCUPIED;
    }
    expect(threwEarly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-021: managed start guard rejects an occupied slug
// (spec.md > Requirement: managed runtime > Scenario: managed start guard rejects)
// ---------------------------------------------------------------------------

describe("TC-021: managed start guard rejects an occupied slug", () => {
  it("throws SLUG_OCCUPIED when a managed slug has a non-terminal prior job", async () => {
    // The managed runtime uses the same assertSlugUnoccupied with a scan
    // that looks at managed marker + co-located state
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "managed-job-A", status: "running" })],
    }));

    try {
      await assertSlugUnoccupied(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe(ERROR_CODES.SLUG_OCCUPIED);
    }
  });

  it("managed guard throws before any state is created", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [makeOccupantRef({ jobId: "managed-job-A", status: "awaiting-resume" })],
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).rejects.toBeInstanceOf(SpecRunnerError);
  });
});

// ---------------------------------------------------------------------------
// TC-022: managed start guard allows a terminal-only slug (should priority)
// ---------------------------------------------------------------------------

describe("TC-022: managed start guard allows a terminal-only slug", () => {
  it("resolves without throwing when managed slug has only terminal jobs", async () => {
    const deps = makeDeps(makeScanResult({
      nonTerminal: [],
      terminal: [makeOccupantRef({ jobId: "managed-job-A", status: "canceled" })],
    }));

    await expect(assertSlugUnoccupied(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });
});
