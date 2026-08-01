/**
 * Unit tests for scanSlugOccupancy (src/core/occupancy/scan.ts).
 *
 * TC-001: single non-terminal + N terminal → nonTerminal.length === 1
 * TC-002: terminal-only history → nonTerminal empty
 * TC-003: two non-terminal jobs → nonTerminal.length === 2
 * TC-004: present-but-corrupted state → unreadable !== null
 * TC-005: absent slug → all arrays empty, unreadable null
 * TC-006: dedup by jobId — same jobId in multiple locations, newest updatedAt kept
 * TC-007: non-terminal set includes awaiting-archive, failed, terminated
 *
 * Source: tasks.md > T-01 and design.md > D3
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { scanSlugOccupancy } from "../../../../src/core/occupancy/scan.js";
import type { ScanSlugOccupancyDeps } from "../../../../src/core/occupancy/scan.js";
import type { JobStatus } from "../../../../src/state/schema.js";

const REPO_ROOT = "/fake/repo";
const SLUG = "S";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake state entry for injection. */
function fakeEntry(overrides: {
  jobId: string;
  status: JobStatus;
  updatedAt?: string;
  pid?: number | null;
  worktreePath?: string | null;
}) {
  return {
    jobId: overrides.jobId,
    status: overrides.status,
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    pid: overrides.pid ?? null,
    worktreePath: overrides.worktreePath ?? null,
  };
}

/**
 * Build a ScanSlugOccupancyDeps that returns the given entries.
 * readState returns the matching entry by jobId (by order of calls via mockImplementation).
 */
function makeDepsWithEntries(
  entries: Array<{ jobId: string; status: JobStatus; updatedAt?: string; pid?: number | null; worktreePath?: string | null }>,
  unreadableReason?: string,
): ScanSlugOccupancyDeps {
  // Inject the entries directly via the overrideEntries dep
  return {
    overrideEntries: unreadableReason
      ? { entries: entries.map(fakeEntry), unreadable: unreadableReason }
      : { entries: entries.map(fakeEntry), unreadable: null },
  };
}

// ---------------------------------------------------------------------------
// TC-001: single non-terminal + N terminal → nonTerminal.length === 1
// ---------------------------------------------------------------------------

describe("TC-001: single non-terminal + N terminal → nonTerminal.length === 1", () => {
  it("nonTerminal contains the awaiting-resume job, terminal contains the archived jobs", async () => {
    const deps = makeDepsWithEntries([
      { jobId: "job-A", status: "awaiting-resume" },
      { jobId: "job-B", status: "archived" },
      { jobId: "job-C", status: "archived" },
    ]);

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    expect(result.nonTerminal.length).toBe(1);
    expect(result.nonTerminal[0]!.jobId).toBe("job-A");
    expect(result.nonTerminal[0]!.status).toBe("awaiting-resume");
    expect(result.terminal.length).toBe(2);
    expect(result.unreadable).toBeNull();
  });

  it("slug field in result matches the requested slug", async () => {
    const deps = makeDepsWithEntries([
      { jobId: "job-A", status: "awaiting-resume" },
    ]);
    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);
    expect(result.slug).toBe(SLUG);
  });
});

// ---------------------------------------------------------------------------
// TC-002: terminal-only history → nonTerminal empty
// ---------------------------------------------------------------------------

describe("TC-002: terminal-only history → nonTerminal empty", () => {
  it("nonTerminal is empty when all jobs are terminal", async () => {
    const deps = makeDepsWithEntries([
      { jobId: "job-A", status: "canceled" },
      { jobId: "job-B", status: "archived" },
    ]);

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    expect(result.nonTerminal.length).toBe(0);
    expect(result.terminal.length).toBe(2);
    expect(result.unreadable).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-003: two non-terminal jobs → nonTerminal.length === 2
// ---------------------------------------------------------------------------

describe("TC-003: two non-terminal jobs → nonTerminal.length === 2", () => {
  it("both running and awaiting-resume appear in nonTerminal", async () => {
    const deps = makeDepsWithEntries([
      { jobId: "job-A", status: "running" },
      { jobId: "job-B", status: "awaiting-resume" },
    ]);

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    expect(result.nonTerminal.length).toBe(2);
    const ids = result.nonTerminal.map((e) => e.jobId);
    expect(ids).toContain("job-A");
    expect(ids).toContain("job-B");
  });
});

// ---------------------------------------------------------------------------
// TC-004: present-but-corrupted state → unreadable !== null
// ---------------------------------------------------------------------------

describe("TC-004: present-but-corrupted state → unreadable !== null", () => {
  it("returns unreadable with a reason when state is corrupted", async () => {
    const deps: ScanSlugOccupancyDeps = {
      overrideEntries: {
        entries: [],
        unreadable: "JSON parse failure: unexpected token",
      },
    };

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    expect(result.unreadable).not.toBeNull();
    expect(result.unreadable).toContain("parse");
    expect(result.nonTerminal.length).toBe(0);
    expect(result.terminal.length).toBe(0);
  });

  it("real corrupted file at main-checkout path sets unreadable", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-scan-test-"));
    try {
      const slugDir = path.join(tmpDir, "specrunner", "changes", SLUG);
      await fs.mkdir(slugDir, { recursive: true });
      await fs.writeFile(path.join(slugDir, "state.json"), "{ not valid json @@");
      await fs.writeFile(path.join(slugDir, "events.jsonl"), "");

      const result = await scanSlugOccupancy(tmpDir, SLUG);

      expect(result.unreadable).not.toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// TC-005: absent slug → all arrays empty, unreadable null
// ---------------------------------------------------------------------------

describe("TC-005: absent slug → all arrays empty, unreadable null", () => {
  it("returns empty arrays and null unreadable when slug has no state files", async () => {
    const deps = makeDepsWithEntries([]); // no entries, no unreadable

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    expect(result.nonTerminal.length).toBe(0);
    expect(result.terminal.length).toBe(0);
    expect(result.unreadable).toBeNull();
  });

  it("real ENOENT (no slug dir) returns empty and null unreadable", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-scan-test-"));
    try {
      // Do NOT create the slug dir — should be ENOENT
      const result = await scanSlugOccupancy(tmpDir, SLUG);

      expect(result.nonTerminal.length).toBe(0);
      expect(result.terminal.length).toBe(0);
      expect(result.unreadable).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// TC-006: dedup by jobId — same jobId in multiple locations, newest updatedAt kept
// ---------------------------------------------------------------------------

describe("TC-006: dedup by jobId — same jobId appears exactly once, newest updatedAt kept", () => {
  it("deduplicates entries with the same jobId, retaining the one with the newer updatedAt", async () => {
    // Same jobId A in two candidate locations with different updatedAt values
    const deps: ScanSlugOccupancyDeps = {
      overrideEntries: {
        entries: [
          fakeEntry({ jobId: "job-A", status: "awaiting-resume", updatedAt: "2026-01-01T10:00:00.000Z" }),
          fakeEntry({ jobId: "job-A", status: "awaiting-resume", updatedAt: "2026-01-01T12:00:00.000Z" }),
        ],
        unreadable: null,
      },
    };

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    const allEntries = [...result.nonTerminal, ...result.terminal];
    const jobAEntries = allEntries.filter((e) => e.jobId === "job-A");
    expect(jobAEntries.length).toBe(1);
    expect(jobAEntries[0]!.updatedAt).toBe("2026-01-01T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// TC-007: non-terminal set includes awaiting-archive, failed, terminated
// ---------------------------------------------------------------------------

describe("TC-007: non-terminal set includes awaiting-archive, failed, terminated", () => {
  it("awaiting-archive, failed, and terminated are all classified as non-terminal", async () => {
    const deps = makeDepsWithEntries([
      { jobId: "job-A", status: "awaiting-archive" },
      { jobId: "job-B", status: "failed" },
      { jobId: "job-C", status: "terminated" },
    ]);

    const result = await scanSlugOccupancy(REPO_ROOT, SLUG, deps);

    expect(result.nonTerminal.length).toBe(3);
    expect(result.terminal.length).toBe(0);

    const statuses = result.nonTerminal.map((e) => e.status);
    expect(statuses).toContain("awaiting-archive");
    expect(statuses).toContain("failed");
    expect(statuses).toContain("terminated");
  });
});
