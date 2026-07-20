/**
 * Unit tests for checkDuplicateLiveJob (duplicate-slug-guard.ts).
 *
 * All tests use injected deps (readFile / isAlive) so no real fs or process
 * interaction is required — fully deterministic.
 */
import { describe, it, expect, vi } from "vitest";
import { checkDuplicateLiveJob } from "../../../../src/core/runtime/duplicate-slug-guard.js";
import { SpecRunnerError } from "../../../../src/errors.js";

const REPO_ROOT = "/fake/repo";
const SLUG = "S";

// ---------------------------------------------------------------------------
// TC-01: live pid → rejected
// ---------------------------------------------------------------------------

describe("TC-01: live pid → DUPLICATE_LIVE_JOB thrown", () => {
  it("throws SpecRunnerError with code DUPLICATE_LIVE_JOB", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ pid: 4242, jobId: "job-A", worktreePath: "/wt", session: null }),
      ),
      isAlive: vi.fn().mockReturnValue(true),
    };

    await expect(checkDuplicateLiveJob(REPO_ROOT, SLUG, deps)).rejects.toBeInstanceOf(
      SpecRunnerError,
    );
  });

  it("error code is DUPLICATE_LIVE_JOB", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ pid: 4242, jobId: "job-A", worktreePath: "/wt", session: null }),
      ),
      isAlive: vi.fn().mockReturnValue(true),
    };

    try {
      await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecRunnerError);
      expect((err as SpecRunnerError).code).toBe("DUPLICATE_LIVE_JOB");
    }
  });

  it("error message contains slug and prior jobId", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ pid: 4242, jobId: "job-A", worktreePath: "/wt", session: null }),
      ),
      isAlive: vi.fn().mockReturnValue(true),
    };

    try {
      await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).message).toContain("S");
      expect((err as SpecRunnerError).message).toContain("job-A");
    }
  });

  it("hint contains 'specrunner job cancel job-A' and wait/re-running instruction", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ pid: 4242, jobId: "job-A", worktreePath: "/wt", session: null }),
      ),
      isAlive: vi.fn().mockReturnValue(true),
    };

    try {
      await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).hint).toContain("specrunner job cancel job-A");
      expect((err as SpecRunnerError).hint).toMatch(/wait|re-running/);
    }
  });

  it("exitCode is 2 (ARG_ERROR)", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ pid: 4242, jobId: "job-A", worktreePath: "/wt", session: null }),
      ),
      isAlive: vi.fn().mockReturnValue(true),
    };

    try {
      await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).exitCode).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-02: dead pid → allowed (resolve without throw)
// ---------------------------------------------------------------------------

describe("TC-02: dead pid → allowed", () => {
  it("resolves without throwing", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ pid: 4242, jobId: "job-A", worktreePath: "/wt", session: null }),
      ),
      isAlive: vi.fn().mockReturnValue(false),
    };

    await expect(checkDuplicateLiveJob(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-03: sidecar absent → allowed (isAlive never called)
// ---------------------------------------------------------------------------

describe("TC-03: sidecar absent → allowed", () => {
  it("resolves without throwing", async () => {
    const deps = {
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      isAlive: vi.fn().mockReturnValue(true),
    };

    await expect(checkDuplicateLiveJob(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });

  it("isAlive is never called when sidecar is absent", async () => {
    const isAlive = vi.fn().mockReturnValue(true);
    const deps = {
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      isAlive,
    };

    await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);

    expect(isAlive).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-04: JSON corrupted → allowed
// ---------------------------------------------------------------------------

describe("TC-04: corrupted JSON → allowed", () => {
  it("resolves without throwing", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue("{ not json"),
      isAlive: vi.fn().mockReturnValue(true),
    };

    await expect(checkDuplicateLiveJob(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-05: pid field absent → allowed (pid is not a number)
// ---------------------------------------------------------------------------

describe("TC-05: pid missing → allowed", () => {
  it("resolves without throwing when pid field is absent", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ jobId: "job-A" })),
      isAlive: vi.fn().mockReturnValue(true),
    };

    await expect(checkDuplicateLiveJob(REPO_ROOT, SLUG, deps)).resolves.toBeUndefined();
  });

  it("isAlive is never called when pid is absent", async () => {
    const isAlive = vi.fn().mockReturnValue(true);
    const deps = {
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ jobId: "job-A" })),
      isAlive,
    };

    await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);

    expect(isAlive).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-06: live pid but jobId absent → rejected (null jobId path)
// ---------------------------------------------------------------------------

describe("TC-06: live pid but jobId absent → DUPLICATE_LIVE_JOB (null jobId path)", () => {
  it("throws DUPLICATE_LIVE_JOB", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 4242 })),
      isAlive: vi.fn().mockReturnValue(true),
    };

    try {
      await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecRunnerError);
      expect((err as SpecRunnerError).code).toBe("DUPLICATE_LIVE_JOB");
    }
  });

  it("hint contains 'specrunner job ls' guidance", async () => {
    const deps = {
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 4242 })),
      isAlive: vi.fn().mockReturnValue(true),
    };

    try {
      await checkDuplicateLiveJob(REPO_ROOT, SLUG, deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).hint).toContain("specrunner job ls");
    }
  });
});
