/**
 * Tests for src/store/local-job-index.ts
 *
 * TC-014: listLocalSidecars — local liveness.json entry
 * TC-015: listLocalSidecars — managed marker.json entry
 * TC-016: listLocalSidecars — missing/corrupt jobId skipped
 * TC-017: listLocalSidecars — base dir absent → empty array
 * TC-018: resolveJobIdToSlug — matching entry returned
 * TC-019: resolveJobIdToSlug — unknown jobId returns null
 * TC-020: no src/core/ imports in local-job-index.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { listLocalSidecars, resolveJobIdToSlug } from "../src/store/local-job-index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-local-job-index-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeLiveness(slug: string, data: Record<string, unknown>): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "liveness.json"), JSON.stringify(data));
}

async function writeMarker(slug: string, data: Record<string, unknown>): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "marker.json"), JSON.stringify(data));
}

// TC-014: listLocalSidecars returns local liveness.json entries
describe("TC-014: listLocalSidecars — local liveness.json", () => {
  it("returns { slug, jobId, worktreePath, kind='local' } from liveness.json", async () => {
    const jobId = "aaaa1111-0000-0000-0000-000000000001";
    const worktreePath = "/tmp/my-worktree";
    await writeLiveness("my-slug", { jobId, worktreePath, pid: 1234 });

    const entries = await listLocalSidecars(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      slug: "my-slug",
      jobId,
      worktreePath,
      kind: "local",
    });
  });

  it("returns worktreePath=null when liveness.json has non-string worktreePath", async () => {
    const jobId = "aaaa2222-0000-0000-0000-000000000001";
    await writeLiveness("slug-no-wt", { jobId, worktreePath: null, pid: 1 });

    const entries = await listLocalSidecars(tempDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.worktreePath).toBeNull();
    expect(entries[0]!.kind).toBe("local");
  });
});

// TC-015: listLocalSidecars returns managed marker.json entries
describe("TC-015: listLocalSidecars — managed marker.json", () => {
  it("returns { slug, jobId, worktreePath=null, kind='managed' } from marker.json only", async () => {
    const jobId = "bbbb1111-0000-0000-0000-000000000001";
    await writeMarker("managed-slug", { slug: "managed-slug", jobId, status: "running" });

    const entries = await listLocalSidecars(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      slug: "managed-slug",
      jobId,
      worktreePath: null,
      kind: "managed",
    });
  });

  it("prefers liveness.json over marker.json when both exist", async () => {
    const jobIdLiveness = "cccc1111-0000-0000-0000-000000000001";
    const jobIdMarker = "cccc2222-0000-0000-0000-000000000001";
    await writeLiveness("both-slug", { jobId: jobIdLiveness, worktreePath: null, pid: 1 });
    await writeMarker("both-slug", { jobId: jobIdMarker });

    const entries = await listLocalSidecars(tempDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.jobId).toBe(jobIdLiveness);
    expect(entries[0]!.kind).toBe("local");
  });
});

// TC-016: corrupt or missing jobId sidecars are skipped
describe("TC-016: listLocalSidecars — invalid jobId skipped", () => {
  it("skips liveness.json without jobId field", async () => {
    await writeLiveness("no-jobid-slug", { pid: 1234, worktreePath: null });

    const entries = await listLocalSidecars(tempDir);
    expect(entries).toHaveLength(0);
  });

  it("skips broken JSON in liveness.json and falls through to missing marker.json", async () => {
    const dir = path.join(tempDir, ".specrunner", "local", "broken-slug");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "liveness.json"), "NOT JSON {{");

    const entries = await listLocalSidecars(tempDir);
    expect(entries).toHaveLength(0);
  });

  it("skips entirely when both liveness.json and marker.json are absent", async () => {
    // Directory exists but no sidecar files
    const dir = path.join(tempDir, ".specrunner", "local", "empty-slug");
    await fs.mkdir(dir, { recursive: true });

    const entries = await listLocalSidecars(tempDir);
    expect(entries).toHaveLength(0);
  });

  it("returns valid entries even when one slug dir is corrupt", async () => {
    const validJobId = "dddd1111-0000-0000-0000-000000000001";
    await writeLiveness("valid-slug", { jobId: validJobId, worktreePath: null, pid: 1 });

    const brokenDir = path.join(tempDir, ".specrunner", "local", "broken-slug");
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, "liveness.json"), "broken json");

    const entries = await listLocalSidecars(tempDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.jobId).toBe(validJobId);
  });
});

// TC-017: base dir absent → empty array
describe("TC-017: listLocalSidecars — base dir absent", () => {
  it("returns empty array when .specrunner/local does not exist", async () => {
    const entries = await listLocalSidecars(tempDir);
    expect(entries).toEqual([]);
  });

  it("does not throw when base dir is absent", async () => {
    await expect(listLocalSidecars(tempDir)).resolves.not.toThrow();
  });
});

// TC-018: resolveJobIdToSlug returns matching entry
describe("TC-018: resolveJobIdToSlug — matching entry returned", () => {
  it("returns the entry for the matching jobId", async () => {
    const jobId = "eeee1111-0000-0000-0000-000000000001";
    await writeLiveness("my-slug", { jobId, worktreePath: "/some/path", pid: 1 });

    const result = await resolveJobIdToSlug(tempDir, jobId);

    expect(result).not.toBeNull();
    expect(result!.slug).toBe("my-slug");
    expect(result!.jobId).toBe(jobId);
    expect(result!.worktreePath).toBe("/some/path");
    expect(result!.kind).toBe("local");
  });
});

// TC-019: resolveJobIdToSlug returns null for unknown jobId
describe("TC-019: resolveJobIdToSlug — unknown jobId returns null", () => {
  it("returns null when jobId is not in any sidecar", async () => {
    await writeLiveness("some-slug", { jobId: "ffff1111-0000-0000-0000-000000000001", worktreePath: null, pid: 1 });

    const result = await resolveJobIdToSlug(tempDir, "0000-unknown-job-id");
    expect(result).toBeNull();
  });

  it("returns null when .specrunner/local is absent", async () => {
    const result = await resolveJobIdToSlug(tempDir, "any-job-id");
    expect(result).toBeNull();
  });

  it("does not throw", async () => {
    await expect(resolveJobIdToSlug(tempDir, "nonexistent")).resolves.toBeNull();
  });
});

// TC-020: local-job-index.ts does not import from src/core/
describe("TC-020: no src/core/ imports in local-job-index.ts", () => {
  it("source file contains no import from src/core/", async () => {
    const srcPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "src",
      "store",
      "local-job-index.ts",
    );
    const source = await fs.readFile(srcPath, "utf-8");
    // Must not contain any import from ../core/ or ../../core/ etc.
    expect(source).not.toMatch(/from\s+["'][^"']*\/core\//);
    expect(source).not.toMatch(/require\([^)]*\/core\//);
  });
});
