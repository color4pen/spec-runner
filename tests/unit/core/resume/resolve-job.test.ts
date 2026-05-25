/**
 * Tests for resolveJobStateBySlug()
 *
 * TC-RJ-001: single match → returns that job
 * TC-RJ-002: multiple matches → returns latest updatedAt
 * TC-RJ-003: no match → returns null
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { vi } from "vitest";
import { JobStateStore } from "../../../../src/store/job-state-store.js";
import { resolveJobStateBySlug } from "../../../../src/core/resume/resolve-job.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-resolve-job-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJob(slug: string, updatedAt?: string) {
  const state = await JobStateStore.create(tempDir, {
    request: {
      path: `/specrunner/drafts/${slug}.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "user", name: "repo" },
  });

  if (updatedAt) {
    const store = new JobStateStore(state.jobId, tempDir);
    const current = await store.load();
    const updated = { ...current, updatedAt };
    await store.persist(updated);
    return updated;
  }

  return state;
}

describe("TC-RJ-001: single match → returns that job", () => {
  it("returns the matching job when exactly one slug matches", async () => {
    const job = await makeJob("my-feature");

    const result = await resolveJobStateBySlug("my-feature", tempDir);
    expect(result).not.toBeNull();
    expect(result!.jobId).toBe(job.jobId);
    expect(result!.request.slug).toBe("my-feature");
  });

  it("does not match jobs with different slug", async () => {
    await makeJob("other-feature");

    const result = await resolveJobStateBySlug("my-feature", tempDir);
    expect(result).toBeNull();
  });
});

describe("TC-RJ-002: multiple matches → returns latest updatedAt", () => {
  it("returns the job with the most recent updatedAt when multiple match", async () => {
    const older = await makeJob("shared-slug", "2026-01-01T10:00:00.000Z");
    const newer = await makeJob("shared-slug", "2026-01-02T10:00:00.000Z");

    const result = await resolveJobStateBySlug("shared-slug", tempDir);
    expect(result).not.toBeNull();
    expect(result!.jobId).toBe(newer.jobId);
    expect(result!.updatedAt).toBe("2026-01-02T10:00:00.000Z");

    // Verify older exists but wasn't selected
    expect(older.jobId).not.toBe(newer.jobId);
  });
});

describe("TC-RJ-003: no match → returns null", () => {
  it("returns null when no jobs exist", async () => {
    const result = await resolveJobStateBySlug("nonexistent-slug", tempDir);
    expect(result).toBeNull();
  });

  it("returns null when jobs exist but none match the slug", async () => {
    await makeJob("different-slug");

    const result = await resolveJobStateBySlug("target-slug", tempDir);
    expect(result).toBeNull();
  });
});
