/**
 * Unit tests for resolveCanonicalStateDir (T-02).
 *
 * TC-RCSD-001: active changes/<slug>/state.json → returns active dir
 * TC-RCSD-002: active absent, archive/<dated-slug>/state.json → returns archive dir
 * TC-RCSD-003: both absent → returns null
 * TC-RCSD-004: active takes priority over archive when both exist
 * TC-RCSD-005: archive dir without state.json is skipped
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveCanonicalStateDir } from "../../../../src/core/finish/resolve-canonical-state-dir.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-rcsd-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function touchStateJson(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify({ jobId: "test", status: "awaiting-archive" }), "utf-8");
}

// TC-RCSD-001
describe("TC-RCSD-001: active changes/<slug>/state.json → active dir", () => {
  it("returns active dir absolute path", async () => {
    const slug = "my-change";
    const activeDir = path.join(tempDir, "specrunner", "changes", slug);
    await touchStateJson(activeDir);

    const result = await resolveCanonicalStateDir(slug, tempDir);
    expect(result).toBe(activeDir);
  });
});

// TC-RCSD-002
describe("TC-RCSD-002: active absent, archive dir with state.json → archive dir", () => {
  it("returns archive dir when active is absent", async () => {
    const slug = "my-change";
    const datedSlug = "2026-01-15-" + slug;
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", datedSlug);
    await touchStateJson(archiveDir);

    const result = await resolveCanonicalStateDir(slug, tempDir);
    expect(result).toBe(archiveDir);
  });

  it("resolves slug regardless of date prefix", async () => {
    const slug = "no-date-slug";
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", slug);
    await touchStateJson(archiveDir);

    const result = await resolveCanonicalStateDir(slug, tempDir);
    expect(result).toBe(archiveDir);
  });
});

// TC-RCSD-003
describe("TC-RCSD-003: both absent → null", () => {
  it("returns null when no state.json exists anywhere", async () => {
    const result = await resolveCanonicalStateDir("nonexistent-slug", tempDir);
    expect(result).toBeNull();
  });

  it("returns null when changes dir does not exist", async () => {
    const result = await resolveCanonicalStateDir("any-slug", tempDir);
    expect(result).toBeNull();
  });
});

// TC-RCSD-004
describe("TC-RCSD-004: active takes priority over archive", () => {
  it("returns active dir when both active and archive have state.json", async () => {
    const slug = "priority-slug";
    const activeDir = path.join(tempDir, "specrunner", "changes", slug);
    await touchStateJson(activeDir);

    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", `2026-01-10-${slug}`);
    await touchStateJson(archiveDir);

    const result = await resolveCanonicalStateDir(slug, tempDir);
    expect(result).toBe(activeDir);
  });
});

// TC-RCSD-005
describe("TC-RCSD-005: archive dir without state.json is skipped", () => {
  it("skips archive dir that has no state.json", async () => {
    const slug = "partial-archive";
    // Archive dir exists but has no state.json
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", `2026-01-01-${slug}`);
    await fs.mkdir(archiveDir, { recursive: true });
    // No state.json created

    const result = await resolveCanonicalStateDir(slug, tempDir);
    expect(result).toBeNull();
  });

  it("finds the one archive dir that does have state.json among multiple", async () => {
    const slug = "multi-archive";
    // First archive dir: no state.json
    const archiveDir1 = path.join(tempDir, "specrunner", "changes", "archive", `2026-01-01-${slug}`);
    await fs.mkdir(archiveDir1, { recursive: true });

    // Second archive dir: has state.json
    const archiveDir2 = path.join(tempDir, "specrunner", "changes", "archive", `2026-01-15-${slug}`);
    await touchStateJson(archiveDir2);

    const result = await resolveCanonicalStateDir(slug, tempDir);
    expect(result).toBe(archiveDir2);
  });
});
