/**
 * Tests for writeOutputTemplates() and cleanupOutputTemplates() in src/util/copy-artifacts.ts
 *
 * TC-CA001: writeOutputTemplates writes template files to the change folder
 * TC-CA002: cleanupOutputTemplates deletes cleanup: true files only
 * TC-CA003: cleanupOutputTemplates ignores ENOENT (idempotent)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { writeOutputTemplates, cleanupOutputTemplates } from "../../src/core/artifact/copy-artifacts.js";
import type { JobState } from "../../src/state/schema.js";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "my-slug" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "copy-artifacts-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-CA001: writeOutputTemplates writes template files
// ---------------------------------------------------------------------------
describe("TC-CA001: writeOutputTemplates writes template files", () => {
  it("design step writes design.md, tasks.md, spec.md", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "design", state);

    const changeFolder = path.join(tempDir, "specrunner", "changes", slug);
    const designExists = await fs.access(path.join(changeFolder, "design.md")).then(() => true).catch(() => false);
    const tasksExists = await fs.access(path.join(changeFolder, "tasks.md")).then(() => true).catch(() => false);
    const specExists = await fs.access(path.join(changeFolder, "spec.md")).then(() => true).catch(() => false);

    expect(designExists).toBe(true);
    expect(tasksExists).toBe(true);
    expect(specExists).toBe(true);
  });

  it("design step template files have non-empty content", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "design", state);

    const changeFolder = path.join(tempDir, "specrunner", "changes", slug);
    const designContent = await fs.readFile(path.join(changeFolder, "design.md"), "utf-8");
    const tasksContent = await fs.readFile(path.join(changeFolder, "tasks.md"), "utf-8");
    const specContent = await fs.readFile(path.join(changeFolder, "spec.md"), "utf-8");

    expect(designContent.length).toBeGreaterThan(0);
    expect(tasksContent.length).toBeGreaterThan(0);
    expect(specContent.length).toBeGreaterThan(0);
  });

  it("spec-review step writes spec-review-result-001.md", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "spec-review", state);

    const resultPath = path.join(tempDir, "specrunner", "changes", slug, "spec-review-result-001.md");
    const exists = await fs.access(resultPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("test-case-gen step writes test-cases.md", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "test-case-gen", state);

    const resultPath = path.join(tempDir, "specrunner", "changes", slug, "test-cases.md");
    const exists = await fs.access(resultPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("code-review step writes review-feedback-001.md", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "code-review", state);

    const resultPath = path.join(tempDir, "specrunner", "changes", slug, "review-feedback-001.md");
    const exists = await fs.access(resultPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("implementer step writes no files", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "implementer", state);

    const changeFolder = path.join(tempDir, "specrunner", "changes", slug);
    const exists = await fs.access(changeFolder).then(() => true).catch(() => false);
    // Directory should not be created for steps with no templates
    expect(exists).toBe(false);
  });

  it("creates parent directories when they do not exist", async () => {
    const slug = "nested-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "spec-review", state);

    const resultPath = path.join(tempDir, "specrunner", "changes", slug, "spec-review-result-001.md");
    const exists = await fs.access(resultPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-CA002: cleanupOutputTemplates deletes cleanup: true files only
// ---------------------------------------------------------------------------
describe("TC-CA002: cleanupOutputTemplates deletes B-group files only", () => {
  it("does not delete design.md, tasks.md, or spec.md (all A-group in design step)", async () => {
    const slug = "my-slug";
    const state = makeState();

    // Write all design step templates
    await writeOutputTemplates(tempDir, slug, "design", state);

    const changeFolder = path.join(tempDir, "specrunner", "changes", slug);

    // Verify all files exist before cleanup
    expect(await fs.access(path.join(changeFolder, "design.md")).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(changeFolder, "tasks.md")).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(changeFolder, "spec.md")).then(() => true).catch(() => false)).toBe(true);

    // Cleanup
    await cleanupOutputTemplates(tempDir, slug, "design", state);

    // All design step files should still exist (all A-group — no cleanup: true)
    expect(await fs.access(path.join(changeFolder, "design.md")).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(changeFolder, "tasks.md")).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(changeFolder, "spec.md")).then(() => true).catch(() => false)).toBe(true);
  });

  it("cleanupOutputTemplates for spec-review does not delete anything (all A-group)", async () => {
    const slug = "my-slug";
    const state = makeState();

    await writeOutputTemplates(tempDir, slug, "spec-review", state);
    await cleanupOutputTemplates(tempDir, slug, "spec-review", state);

    const resultPath = path.join(tempDir, "specrunner", "changes", slug, "spec-review-result-001.md");
    // A-group: file should still exist
    expect(await fs.access(resultPath).then(() => true).catch(() => false)).toBe(true);
  });

  it("cleanupOutputTemplates for implementer does nothing (no templates)", async () => {
    const slug = "my-slug";
    const state = makeState();
    // Should not throw even if no templates exist
    await expect(cleanupOutputTemplates(tempDir, slug, "implementer", state)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-CA003: cleanupOutputTemplates ignores ENOENT (idempotent)
// ---------------------------------------------------------------------------
describe("TC-CA003: cleanupOutputTemplates ignores ENOENT", () => {
  it("does not throw when delta-spec-template.md does not exist", async () => {
    const slug = "my-slug";
    const state = makeState();
    // Do NOT call writeOutputTemplates — file does not exist
    await expect(cleanupOutputTemplates(tempDir, slug, "design", state)).resolves.toBeUndefined();
  });

  it("can be called twice in a row without throwing", async () => {
    const slug = "my-slug";
    const state = makeState();
    await writeOutputTemplates(tempDir, slug, "design", state);
    await cleanupOutputTemplates(tempDir, slug, "design", state);
    // Second call — file already gone
    await expect(cleanupOutputTemplates(tempDir, slug, "design", state)).resolves.toBeUndefined();
  });
});
