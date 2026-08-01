/**
 * Unit tests for the three new occupancy error factories.
 *
 * TC-008: SLUG_OCCUPIED factory — structured fields and exit code
 * TC-009: SLUG_STATE_UNREADABLE factory — includes reason and ARG_ERROR exit
 * TC-010: SLUG_OCCUPANCY_AMBIGUOUS factory — enumerates candidates and points to doctor
 *
 * Source: tasks.md > T-02
 */
import { describe, it, expect } from "vitest";
import {
  ERROR_CODES,
  SpecRunnerError,
  EXIT_CODE,
  slugOccupiedError,
  slugStateUnreadableError,
  slugOccupancyAmbiguousError,
} from "../../../../src/errors.js";

// ---------------------------------------------------------------------------
// TC-008: SLUG_OCCUPIED
// ---------------------------------------------------------------------------

describe("TC-008: slugOccupiedError — structured fields and exit code", () => {
  it("error.code === ERROR_CODES.SLUG_OCCUPIED", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err.code).toBe(ERROR_CODES.SLUG_OCCUPIED);
  });

  it("exit code maps to ARG_ERROR (2)", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err.exitCode).toBe(EXIT_CODE.ARG_ERROR);
    expect(err.exitCode).toBe(2);
  });

  it("exposes priorJobId as structured field", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err.priorJobId).toBe("abc-1234");
  });

  it("exposes priorStatus as structured field", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err.priorStatus).toBe("awaiting-resume");
  });

  it("message contains the prior jobId", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err.message).toContain("abc-1234");
  });

  it("message contains the prior status", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err.message).toContain("awaiting-resume");
  });

  it("is an instance of SpecRunnerError", () => {
    const err = slugOccupiedError("my-slug", {
      jobId: "abc-1234",
      status: "awaiting-resume",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pid: null,
      worktreePath: null,
    });
    expect(err).toBeInstanceOf(SpecRunnerError);
  });

  it("ERROR_CODES.SLUG_OCCUPIED is defined as a string", () => {
    expect(typeof ERROR_CODES.SLUG_OCCUPIED).toBe("string");
    expect(ERROR_CODES.SLUG_OCCUPIED).toBe("SLUG_OCCUPIED");
  });
});

// ---------------------------------------------------------------------------
// TC-009: SLUG_STATE_UNREADABLE
// ---------------------------------------------------------------------------

describe("TC-009: slugStateUnreadableError — includes reason and ARG_ERROR exit", () => {
  it("error.code === ERROR_CODES.SLUG_STATE_UNREADABLE", () => {
    const err = slugStateUnreadableError("my-slug", "journal corrupted");
    expect(err.code).toBe(ERROR_CODES.SLUG_STATE_UNREADABLE);
  });

  it("exit code maps to ARG_ERROR (2)", () => {
    const err = slugStateUnreadableError("my-slug", "journal corrupted");
    expect(err.exitCode).toBe(EXIT_CODE.ARG_ERROR);
    expect(err.exitCode).toBe(2);
  });

  it("message includes the provided reason", () => {
    const err = slugStateUnreadableError("my-slug", "journal corrupted");
    expect(err.message).toContain("journal corrupted");
  });

  it("is an instance of SpecRunnerError", () => {
    const err = slugStateUnreadableError("my-slug", "disk I/O failure");
    expect(err).toBeInstanceOf(SpecRunnerError);
  });

  it("ERROR_CODES.SLUG_STATE_UNREADABLE is defined as a string", () => {
    expect(typeof ERROR_CODES.SLUG_STATE_UNREADABLE).toBe("string");
    expect(ERROR_CODES.SLUG_STATE_UNREADABLE).toBe("SLUG_STATE_UNREADABLE");
  });
});

// ---------------------------------------------------------------------------
// TC-010: SLUG_OCCUPANCY_AMBIGUOUS
// ---------------------------------------------------------------------------

describe("TC-010: slugOccupancyAmbiguousError — enumerates candidates and points to doctor", () => {
  const t1 = "2026-01-01T10:00:00.000Z";
  const t2 = "2026-01-02T10:00:00.000Z";
  const candidates = [
    { jobId: "job-A", status: "running" as const, updatedAt: t1 },
    { jobId: "job-B", status: "awaiting-resume" as const, updatedAt: t2 },
  ];

  it("error.code === ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS", () => {
    const err = slugOccupancyAmbiguousError("my-slug", candidates);
    expect(err.code).toBe(ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS);
  });

  it("exit code maps to GENERAL_ERROR (1)", () => {
    const err = slugOccupancyAmbiguousError("my-slug", candidates);
    expect(err.exitCode).toBe(EXIT_CODE.GENERAL_ERROR);
    expect(err.exitCode).toBe(1);
  });

  it("message names both jobIds", () => {
    const err = slugOccupancyAmbiguousError("my-slug", candidates);
    expect(err.message).toContain("job-A");
    expect(err.message).toContain("job-B");
  });

  it("message names both statuses", () => {
    const err = slugOccupancyAmbiguousError("my-slug", candidates);
    expect(err.message).toContain("running");
    expect(err.message).toContain("awaiting-resume");
  });

  it("message references specrunner doctor", () => {
    const err = slugOccupancyAmbiguousError("my-slug", candidates);
    expect(err.message).toContain("specrunner doctor");
  });

  it("is an instance of SpecRunnerError", () => {
    const err = slugOccupancyAmbiguousError("my-slug", candidates);
    expect(err).toBeInstanceOf(SpecRunnerError);
  });

  it("ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS is defined as a string", () => {
    expect(typeof ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS).toBe("string");
    expect(ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS).toBe("SLUG_OCCUPANCY_AMBIGUOUS");
  });
});
