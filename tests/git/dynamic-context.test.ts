/**
 * Unit tests for src/git/dynamic-context.ts
 *
 * TC-DC-001: collectDynamicContext returns correct types on success
 * TC-DC-002: collectDynamicContext falls back to empty strings/arrays on git failure
 * TC-DC-003: collectDynamicContext returns empty arrays when openspec dirs don't exist
 * TC-DC-004: changesList excludes "archive" directory
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
  it("returns correct interface shape (all 4 fields)", async () => {
    // Use a real temp dir (no openspec dirs) with real git — fallback to empty is fine
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx).toHaveProperty("gitLog");
    expect(ctx).toHaveProperty("diffStat");
    expect(ctx).toHaveProperty("specsList");
    expect(ctx).toHaveProperty("changesList");
    expect(typeof ctx.gitLog).toBe("string");
    expect(typeof ctx.diffStat).toBe("string");
    expect(Array.isArray(ctx.specsList)).toBe(true);
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
// TC-DC-003: specsList always returns empty array (baseline spec deprecated)
// ---------------------------------------------------------------------------
describe("TC-DC-003: specsList is always empty (baseline spec deprecated)", () => {
  it("returns empty specsList always", async () => {
    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    expect(ctx.specsList).toEqual([]);
  });

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
// Additional: specsList always returns [] (baseline spec is deprecated)
// ---------------------------------------------------------------------------
describe("specsList always returns [] regardless of openspec/specs/ content", () => {
  it("returns empty array even when openspec/specs/ directories exist", async () => {
    const specsDir = path.join(tempDir, specsDirRel());
    await fs.mkdir(specsDir, { recursive: true });
    await fs.mkdir(path.join(specsDir, "pipeline-orchestrator"));
    await fs.writeFile(path.join(specsDir, "pipeline-orchestrator", "spec.md"), "# Pipeline");
    await fs.mkdir(path.join(specsDir, "agent-definition"));
    await fs.writeFile(path.join(specsDir, "agent-definition", "spec.md"), "# Agent");

    const { collectDynamicContext } = await import("../../src/git/dynamic-context.js");
    const ctx = await collectDynamicContext(tempDir, "main");

    // specsList is always empty — baseline spec is deprecated
    expect(ctx.specsList).toEqual([]);
  });
});
