/**
 * Tests for resolveArchivedSlugByJobId and isArchiveRecordDir (job-context.ts).
 *
 * TC-001 (spec: record with a mismatched jobId is not resolved) — jobId mismatch → null
 * TC-002 (spec: record with a mismatched issueNumber is not resolved) — issueNumber mismatch → null
 * TC-003 (spec: record with a mismatched issueNumber is not resolved) — issueNumber absent → null
 * TC-004 (spec: an active change folder is not treated as an archive record) — active folder → null
 * TC-005 (tasks T-05) — archive dir absent → null
 * TC-006 (tasks T-05) — jobId + issueNumber match → slug returned
 * TC-007 (spec: fallback-resolved slug is seen as archive-recorded) — same fixture archiveRecorded === true
 */

import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";

import { resolveArchivedSlugByJobId } from "../job-context.js";
import { resolveArchiveJobContext } from "../job-context.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStateJson(opts: {
  jobId: string;
  slug: string;
  issueNumber?: number | null;
  status?: string;
}): string {
  const { jobId, slug, issueNumber, status = "awaiting-archive" } = opts;
  const base: Record<string, unknown> = {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    request: {
      path: `/repo/specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status,
    branch: `feat/${slug}`,
    history: [],
    error: null,
    pipelineId: "standard-v1",
    steps: {},
    pullRequest: { number: 99 },
  };
  // Only include issueNumber if explicitly passed (undefined = omit field entirely)
  if (issueNumber !== undefined) {
    base.issueNumber = issueNumber;
  }
  return JSON.stringify(base);
}

async function createArchiveRecord(
  tmpDir: string,
  opts: { jobId: string; slug: string; issueNumber?: number | null; datedSlug?: string },
): Promise<string> {
  const { jobId, slug, issueNumber, datedSlug = `2026-01-01-${slug}` } = opts;
  const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive", datedSlug);
  await fs.mkdir(archiveDir, { recursive: true });
  await fs.writeFile(path.join(archiveDir, "state.json"), makeStateJson({ jobId, slug, issueNumber }));
  return archiveDir;
}

async function createActiveRecord(
  tmpDir: string,
  opts: { jobId: string; slug: string; issueNumber?: number | null },
): Promise<string> {
  const { jobId, slug, issueNumber } = opts;
  const activeDir = path.join(tmpDir, "specrunner", "changes", slug);
  await fs.mkdir(activeDir, { recursive: true });
  await fs.writeFile(path.join(activeDir, "state.json"), makeStateJson({ jobId, slug, issueNumber }));
  return activeDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe("resolveArchivedSlugByJobId", () => {
  it("TC-006: jobId + issueNumber match → returns the slug", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-06-"));
    await createArchiveRecord(tmpDir, { jobId: "job-aaa", slug: "my-feature", issueNumber: 42 });

    const result = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-aaa", issueNumber: 42 });

    expect(result).toBe("my-feature");
  });

  it("TC-001: jobId mismatch → null", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-01-"));
    await createArchiveRecord(tmpDir, { jobId: "job-bbb", slug: "my-feature", issueNumber: 42 });

    const result = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-DIFFERENT", issueNumber: 42 });

    expect(result).toBeNull();
  });

  it("TC-002: issueNumber mismatch → null", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-02-"));
    await createArchiveRecord(tmpDir, { jobId: "job-ccc", slug: "my-feature", issueNumber: 99 });

    const result = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-ccc", issueNumber: 42 });

    expect(result).toBeNull();
  });

  it("TC-003: record has no issueNumber field → null", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-03-"));
    // issueNumber: undefined means the field is omitted from state.json
    await createArchiveRecord(tmpDir, { jobId: "job-ddd", slug: "my-feature" });

    const result = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-ddd", issueNumber: 42 });

    expect(result).toBeNull();
  });

  it("TC-004: active change folder (not archive/) → null even with matching jobId + issueNumber", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-04-"));
    await createActiveRecord(tmpDir, { jobId: "job-eee", slug: "active-feature", issueNumber: 42 });

    const result = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-eee", issueNumber: 42 });

    expect(result).toBeNull();
  });

  it("TC-005: archive directory does not exist → null (no throw)", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-05-"));
    // No specrunner/changes/archive/ created

    const result = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-fff", issueNumber: 42 });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-007: fallback-resolved slug yields archiveRecorded === true
// ---------------------------------------------------------------------------

describe("TC-007: fallback slug and archiveRecorded are consistent", () => {
  it("same archive record → resolveArchivedSlugByJobId returns slug AND resolveArchiveJobContext sets archiveRecorded: true", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archived-slug-07-"));
    await createArchiveRecord(tmpDir, { jobId: "job-ggg", slug: "consistent-feature", issueNumber: 55 });

    const slug = await resolveArchivedSlugByJobId({ cwd: tmpDir, jobId: "job-ggg", issueNumber: 55 });
    expect(slug).toBe("consistent-feature");

    const ctx = await resolveArchiveJobContext({ cwd: tmpDir, slug: slug! });
    expect(ctx.found).toBe(true);
    if (ctx.found) {
      expect(ctx.archiveRecorded).toBe(true);
    }
  });
});
