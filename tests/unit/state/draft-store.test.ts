/**
 * Unit tests for src/state/draft-store.ts
 *
 * TC-DS-001: saveDraft → loadDraft round-trip
 * TC-DS-002: deleteDraft → loadDraft returns null
 * TC-DS-003: loadDraft on non-existent slug returns null
 * TC-DS-004: saveDraft creates directory recursively
 * TC-DS-005: deleteDraft is idempotent (no throw if already deleted)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { saveDraft, loadDraft, deleteDraft } from "../../../src/state/draft-store.js";
import type { DraftState } from "../../../src/state/draft-store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-store-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function buildDraftState(overrides: Partial<DraftState> = {}): DraftState {
  return {
    sessionId: "test-session-id",
    slug: "my-feature",
    type: "new-feature",
    description: "A test feature",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TC-DS-001: saveDraft → loadDraft round-trip", () => {
  it("saves and loads content and state correctly", async () => {
    const slug = "my-feature";
    const content = "# My Feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: my-feature\n";
    const state = buildDraftState({ slug });

    await saveDraft(tempDir, slug, content, state);
    const loaded = await loadDraft(tempDir, slug);

    expect(loaded).not.toBeNull();
    expect(loaded!.content).toBe(content);
    expect(loaded!.state.sessionId).toBe(state.sessionId);
    expect(loaded!.state.slug).toBe(slug);
    expect(loaded!.state.type).toBe("new-feature");
    expect(loaded!.state.description).toBe("A test feature");
    expect(loaded!.state.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(loaded!.state.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("creates the correct file paths", async () => {
    const slug = "my-feature";
    const content = "draft content";
    const state = buildDraftState({ slug });

    await saveDraft(tempDir, slug, content, state);

    const requestMdPath = path.join(tempDir, "specrunner", "requests", "draft", slug, "request.md");
    const stateJsonPath = path.join(tempDir, "specrunner", "requests", "draft", slug, "draft-state.json");

    const writtenContent = await fs.readFile(requestMdPath, "utf-8");
    const writtenState = JSON.parse(await fs.readFile(stateJsonPath, "utf-8")) as DraftState;

    expect(writtenContent).toBe(content);
    expect(writtenState.slug).toBe(slug);
  });

  it("overwrites previous draft on repeated save", async () => {
    const slug = "my-feature";
    const state = buildDraftState({ slug });

    await saveDraft(tempDir, slug, "first draft", state);
    await saveDraft(tempDir, slug, "second draft", { ...state, updatedAt: "2024-01-02T00:00:00.000Z" });

    const loaded = await loadDraft(tempDir, slug);
    expect(loaded!.content).toBe("second draft");
    expect(loaded!.state.updatedAt).toBe("2024-01-02T00:00:00.000Z");
  });
});

describe("TC-DS-002: deleteDraft → loadDraft returns null", () => {
  it("returns null after draft is deleted", async () => {
    const slug = "my-feature";
    await saveDraft(tempDir, slug, "content", buildDraftState({ slug }));

    const beforeDelete = await loadDraft(tempDir, slug);
    expect(beforeDelete).not.toBeNull();

    await deleteDraft(tempDir, slug);

    const afterDelete = await loadDraft(tempDir, slug);
    expect(afterDelete).toBeNull();
  });

  it("removes the draft directory", async () => {
    const slug = "my-feature";
    await saveDraft(tempDir, slug, "content", buildDraftState({ slug }));

    await deleteDraft(tempDir, slug);

    const draftDir = path.join(tempDir, "specrunner", "requests", "draft", slug);
    await expect(fs.access(draftDir)).rejects.toThrow();
  });
});

describe("TC-DS-003: loadDraft on non-existent slug returns null", () => {
  it("returns null when slug does not exist", async () => {
    const result = await loadDraft(tempDir, "nonexistent-slug");
    expect(result).toBeNull();
  });

  it("returns null when draft directory exists but files are missing", async () => {
    const slug = "partial-draft";
    const draftDir = path.join(tempDir, "specrunner", "requests", "draft", slug);
    await fs.mkdir(draftDir, { recursive: true });
    // Only create request.md, not draft-state.json
    await fs.writeFile(path.join(draftDir, "request.md"), "content");

    const result = await loadDraft(tempDir, slug);
    expect(result).toBeNull();
  });
});

describe("TC-DS-004: saveDraft creates directory recursively", () => {
  it("creates nested directories that do not exist", async () => {
    const slug = "deeply-nested-feature";
    const content = "draft content";
    const state = buildDraftState({ slug });

    // Directory does not exist yet
    const draftDir = path.join(tempDir, "specrunner", "requests", "draft", slug);
    await expect(fs.access(draftDir)).rejects.toThrow();

    // saveDraft should create it
    await expect(saveDraft(tempDir, slug, content, state)).resolves.not.toThrow();

    const loaded = await loadDraft(tempDir, slug);
    expect(loaded).not.toBeNull();
    expect(loaded!.content).toBe(content);
  });
});

describe("TC-DS-005: deleteDraft is idempotent", () => {
  it("does not throw when deleting a non-existent draft", async () => {
    await expect(deleteDraft(tempDir, "nonexistent-slug")).resolves.not.toThrow();
  });

  it("does not throw when called twice", async () => {
    const slug = "my-feature";
    await saveDraft(tempDir, slug, "content", buildDraftState({ slug }));
    await deleteDraft(tempDir, slug);
    await expect(deleteDraft(tempDir, slug)).resolves.not.toThrow();
  });
});
