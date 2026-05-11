/**
 * Unit tests for src/git/dynamic-context.ts
 *
 * TC-DC-001: collectDynamicContext returns correct types on success
 * TC-DC-002: collectDynamicContext falls back to empty strings/arrays on git failure
 * TC-DC-003: collectDynamicContext returns empty array when specrunner/changes/ doesn't exist
 * TC-DC-004: changesList excludes "archive" directory
 *
 * TC-001 (add-spec-review-baseline-check): DynamicContext has baselineSpecs field (optional)
 * TC-002 (add-spec-review-baseline-check): collectDynamicContext does not set baselineSpecs
 * TC-DC-015: collectSpecIndex — specrunner/specs/ が存在しない場合に specIndex が空配列
 * TC-DC-016: collectSpecIndex — 正常な spec.md から SpecIndexEntry を生成
 * TC-DC-017: collectSpecIndex — spec.md が読めないディレクトリはスキップ
 * TC-DC-018: collectSpecIndex — capability 名で昇順ソート
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { changesDirRel, specsDirRel } from "../../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dynamic-context-test-"));
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// TC-DC-001: Success path — git commands return data and dirs exist
// ---------------------------------------------------------------------------
describe("TC-DC-001: collectDynamicContext returns correct types on success", () => {
  it("returns correct interface shape (gitLog, diffStat, changesList)", async () => {
    // Use a real temp dir (no specrunner dirs) with real git — fallback to empty is fine
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx).toHaveProperty("gitLog");
    expect(ctx).toHaveProperty("diffStat");
    expect(ctx).not.toHaveProperty("specsList");
    expect(ctx).toHaveProperty("changesList");
    expect(typeof ctx.gitLog).toBe("string");
    expect(typeof ctx.diffStat).toBe("string");
    expect(Array.isArray(ctx.changesList)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002 (add-spec-review-baseline-check): collectDynamicContext does not set baselineSpecs
// ---------------------------------------------------------------------------
describe("TC-002: collectDynamicContext does not populate baselineSpecs", () => {
  it("baselineSpecs is undefined in result from collectDynamicContext", async () => {
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    // baselineSpecs is optional — collectDynamicContext never sets it
    expect(ctx.baselineSpecs).toBeUndefined();
    // Existing fields are still present
    expect(typeof ctx.gitLog).toBe("string");
    expect(typeof ctx.diffStat).toBe("string");
    expect(Array.isArray(ctx.changesList)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-DC-002: Git command failure — fall back to empty string
// ---------------------------------------------------------------------------
describe("TC-DC-002: collectDynamicContext falls back on git failure", () => {
  it("returns empty gitLog and diffStat when git commands fail (not a git repo)", async () => {
    // tempDir is not a git repo, so git commands will fail → fallback to ""
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "feat/test");

    // In a non-git directory, git log and diff will fail and return empty
    expect(ctx.gitLog).toBe("");
    expect(ctx.diffStat).toBe("");
  });

  it("does not throw even when git fails", async () => {
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    await expect(collectDynamicContext(tempDir, "feat/test")).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-DC-003: changesList falls back to empty when specrunner/changes/ doesn't exist
// ---------------------------------------------------------------------------
describe("TC-DC-003: changesList is empty when specrunner/changes/ does not exist", () => {
  it("returns empty changesList when specrunner/changes/ does not exist", async () => {
    // tempDir has no specrunner directory
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.changesList).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-DC-004: changesList excludes "archive" directory
// ---------------------------------------------------------------------------
describe("TC-DC-004: changesList excludes archive directory", () => {
  it("filters out the 'archive' directory from changesList", async () => {
    const changesDir = path.join(tempDir, changesDirRel());
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(path.join(changesDir, "archive"));
    await fs.mkdir(path.join(changesDir, "my-feature"));
    await fs.mkdir(path.join(changesDir, "another-feature"));

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "feat/my-feature");

    expect(ctx.changesList).not.toContain("archive");
    expect(ctx.changesList).toContain("my-feature");
    expect(ctx.changesList).toContain("another-feature");
  });

  it("returns only non-archive directories sorted alphabetically", async () => {
    const changesDir = path.join(tempDir, changesDirRel());
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(path.join(changesDir, "archive"));
    await fs.mkdir(path.join(changesDir, "z-feature"));
    await fs.mkdir(path.join(changesDir, "a-feature"));

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "feat/a-feature");

    expect(ctx.changesList).toEqual(["a-feature", "z-feature"]);
  });
});

// ---------------------------------------------------------------------------
// TC-DC-015: specIndex is empty when specrunner/specs/ does not exist
// ---------------------------------------------------------------------------
describe("TC-DC-015: specIndex is empty when specrunner/specs/ does not exist", () => {
  it("returns empty specIndex when specrunner/specs/ does not exist", async () => {
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specIndex).toEqual([]);
  });

  it("does not throw when specrunner/specs/ does not exist", async () => {
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    await expect(collectDynamicContext(tempDir, "main")).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-DC-016: collectSpecIndex builds SpecIndexEntry from a valid spec.md
// ---------------------------------------------------------------------------
describe("TC-DC-016: collectSpecIndex builds SpecIndexEntry from a valid spec.md", () => {
  it("returns correct SpecIndexEntry for a spec.md with Purpose and Requirements", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    const capDir = path.join(specsDir, "foo");
    await fs.mkdir(capDir, { recursive: true });
    await fs.writeFile(
      path.join(capDir, "spec.md"),
      "## Purpose\n\nManage foo lifecycle\n\n## Requirements\n\n### Requirement: REQ-001\n\n### Requirement: REQ-002",
    );

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specIndex).toEqual([
      { capability: "foo", purpose: "Manage foo lifecycle", requirementCount: 2 },
    ]);
  });

  it("returns empty purpose string when ## Purpose section is missing", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    const capDir = path.join(specsDir, "no-purpose");
    await fs.mkdir(capDir, { recursive: true });
    await fs.writeFile(
      path.join(capDir, "spec.md"),
      "## Requirements\n\n### Requirement: REQ-001",
    );

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specIndex).toHaveLength(1);
    expect(ctx.specIndex[0]).toMatchObject({ capability: "no-purpose", purpose: "", requirementCount: 1 });
  });

  it("returns requirementCount 0 when no Requirement sections exist", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    const capDir = path.join(specsDir, "empty-reqs");
    await fs.mkdir(capDir, { recursive: true });
    await fs.writeFile(
      path.join(capDir, "spec.md"),
      "## Purpose\n\nSome purpose text\n",
    );

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specIndex).toHaveLength(1);
    expect(ctx.specIndex[0]).toMatchObject({ capability: "empty-reqs", purpose: "Some purpose text", requirementCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// TC-DC-017: spec.md が読めないディレクトリはスキップ
// ---------------------------------------------------------------------------
describe("TC-DC-017: unreadable spec.md directories are skipped", () => {
  it("skips a capability dir without spec.md and includes the valid one", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    // bad-cap: directory exists but no spec.md
    await fs.mkdir(path.join(specsDir, "bad-cap"), { recursive: true });
    // good-cap: directory with a valid spec.md
    const goodDir = path.join(specsDir, "good-cap");
    await fs.mkdir(goodDir, { recursive: true });
    await fs.writeFile(
      path.join(goodDir, "spec.md"),
      "## Purpose\n\nGood purpose\n\n### Requirement: R-001",
    );

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specIndex.map((e) => e.capability)).toContain("good-cap");
    expect(ctx.specIndex.map((e) => e.capability)).not.toContain("bad-cap");
  });

  it("does not throw when a spec.md is unreadable", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    await fs.mkdir(path.join(specsDir, "bad-cap"), { recursive: true });

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    await expect(collectDynamicContext(tempDir, "main")).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-DC-018: specIndex is sorted by capability name ascending
// ---------------------------------------------------------------------------
describe("TC-DC-018: specIndex is sorted by capability name ascending", () => {
  it("returns specIndex sorted alphabetically by capability", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    const specContent = "## Purpose\n\nSome purpose\n\n### Requirement: R-001";
    for (const cap of ["zebra-cap", "alpha-cap", "middle-cap"]) {
      const dir = path.join(specsDir, cap);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "spec.md"), specContent);
    }

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specIndex.map((e) => e.capability)).toEqual([
      "alpha-cap",
      "middle-cap",
      "zebra-cap",
    ]);
  });
});

