/**
 * Unit tests for src/core/request/store.ts
 *
 * TC-ST-001: resolve() returns specrunner/drafts/<slug>/request.md path
 * TC-ST-002: list() returns slug names for directories with request.md
 * TC-ST-003: list() returns empty array when drafts/ does not exist
 * TC-ST-004: write() creates <slug>/request.md in specrunner/drafts/
 * TC-ST-005: checkSlugCollision() throws SLUG_COLLISION when slug exists in drafts/ (flat or dir)
 * TC-ST-007: checkSlugCollision() resolves without error when no collision
 * TC-ST-008: read() returns parsed request from directory-format file
 * TC-ST-009: checkSlugCollision() throws SLUG_COLLISION when slug exists in changes/archive/
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolve, resolveWithFallback, list, read, write, checkSlugCollision } from "../../../../src/core/request/store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("TC-ST-001: resolve()", () => {
  it("returns directory-format path specrunner/drafts/<slug>/request.md", () => {
    const result = resolve(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "drafts", "my-feature", "request.md");
    expect(result).toBe(expected);
  });
});

describe("resolveWithFallback()", () => {
  it("returns new-format path when directory exists", async () => {
    const slugDir = path.join(tempDir, "specrunner", "drafts", "my-feature");
    await fs.mkdir(slugDir, { recursive: true });
    await fs.writeFile(path.join(slugDir, "request.md"), "# My Feature\n");

    const result = resolveWithFallback(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "drafts", "my-feature", "request.md");
    expect(result).toBe(expected);
  });

  it("falls back to flat file when only legacy format exists", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    await fs.writeFile(path.join(draftsDir, "my-feature.md"), "# My Feature\n");

    const result = resolveWithFallback(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "drafts", "my-feature.md");
    expect(result).toBe(expected);
  });

  it("returns new-format path when neither exists (for error messages)", () => {
    const result = resolveWithFallback(tempDir, "nonexistent");
    const expected = path.join(tempDir, "specrunner", "drafts", "nonexistent", "request.md");
    expect(result).toBe(expected);
  });

  it("prefers new-format over legacy when both exist", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    // Create both legacy flat file and new directory format
    await fs.writeFile(path.join(draftsDir, "my-feature.md"), "# Legacy\n");
    const slugDir = path.join(draftsDir, "my-feature");
    await fs.mkdir(slugDir, { recursive: true });
    await fs.writeFile(path.join(slugDir, "request.md"), "# New\n");

    const result = resolveWithFallback(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "drafts", "my-feature", "request.md");
    expect(result).toBe(expected);
  });
});

describe("TC-ST-002: list() with existing entries", () => {
  it("returns slug names for directories with request.md", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });

    // New format: directories with request.md
    await fs.mkdir(path.join(draftsDir, "slug-a"), { recursive: true });
    await fs.writeFile(
      path.join(draftsDir, "slug-a", "request.md"),
      "# A\n\n## Meta\n\n- **type**: new-feature\n- **slug**: slug-a\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );
    await fs.mkdir(path.join(draftsDir, "slug-b"), { recursive: true });
    await fs.writeFile(
      path.join(draftsDir, "slug-b", "request.md"),
      "# B\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: slug-b\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );

    const slugs = await list(tempDir);
    expect(slugs).toContain("slug-a");
    expect(slugs).toContain("slug-b");
    expect(slugs).toHaveLength(2);
  });

  it("returns flat-file slugs via legacy fallback", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });

    await fs.writeFile(
      path.join(draftsDir, "legacy-slug.md"),
      "# Legacy\n\n## Meta\n\n- **type**: new-feature\n- **slug**: legacy-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );
    await fs.writeFile(path.join(draftsDir, "readme.txt"), "ignored\n");

    const slugs = await list(tempDir);
    expect(slugs).toContain("legacy-slug");
    expect(slugs).not.toContain("readme");
    expect(slugs).toHaveLength(1);
  });

  it("handles mixed new-format directories and legacy flat files", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });

    // New format
    await fs.mkdir(path.join(draftsDir, "new-slug"), { recursive: true });
    await fs.writeFile(path.join(draftsDir, "new-slug", "request.md"), "# New\n## Meta\n\n- **type**: new-feature\n- **slug**: new-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");

    // Legacy flat file
    await fs.writeFile(path.join(draftsDir, "legacy-slug.md"), "# Legacy\n## Meta\n\n- **type**: new-feature\n- **slug**: legacy-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");

    const slugs = await list(tempDir);
    expect(slugs).toContain("new-slug");
    expect(slugs).toContain("legacy-slug");
    expect(slugs).toHaveLength(2);
  });

  it("TC-ST-LIST-004: deduplicates when both directory and flat file exist for same slug", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });

    // Both new-format directory and legacy flat file for "both"
    await fs.mkdir(path.join(draftsDir, "both"), { recursive: true });
    await fs.writeFile(path.join(draftsDir, "both", "request.md"), "# Both\n## Meta\n\n- **type**: new-feature\n- **slug**: both\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");
    await fs.writeFile(path.join(draftsDir, "both.md"), "# Both Legacy\n## Meta\n\n- **type**: new-feature\n- **slug**: both\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");

    const slugs = await list(tempDir);
    const bothCount = slugs.filter((s) => s === "both").length;
    expect(bothCount).toBe(1);
  });

  it("skips directories without request.md", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });

    // Directory without request.md
    await fs.mkdir(path.join(draftsDir, "empty-dir"), { recursive: true });
    // Directory with request.md
    await fs.mkdir(path.join(draftsDir, "valid-slug"), { recursive: true });
    await fs.writeFile(path.join(draftsDir, "valid-slug", "request.md"), "# Valid\n## Meta\n\n- **type**: new-feature\n- **slug**: valid-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");

    const slugs = await list(tempDir);
    expect(slugs).toContain("valid-slug");
    expect(slugs).not.toContain("empty-dir");
    expect(slugs).toHaveLength(1);
  });
});

describe("TC-ST-003: list() when drafts/ does not exist", () => {
  it("returns empty array", async () => {
    const slugs = await list(tempDir);
    expect(slugs).toEqual([]);
  });
});

describe("TC-ST-004: write() creates <slug>/request.md", () => {
  it("creates the slug directory and writes request.md content", async () => {
    const content = "# Test\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "test-slug", content);

    const expectedPath = path.join(tempDir, "specrunner", "drafts", "test-slug", "request.md");
    const written = await fs.readFile(expectedPath, "utf-8");
    expect(written).toBe(content);
  });
});

describe("TC-ST-005: checkSlugCollision() throws when slug exists in drafts/", () => {
  it("throws SLUG_COLLISION when slug exists as directory", async () => {
    const slugDir = path.join(tempDir, "specrunner", "drafts", "my-feature");
    await fs.mkdir(slugDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "my-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });

  it("throws SLUG_COLLISION when slug exists as flat file (legacy)", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    await fs.writeFile(path.join(draftsDir, "my-feature.md"), "# My Feature\n");

    await expect(checkSlugCollision(tempDir, "my-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });
});

describe("TC-ST-007: checkSlugCollision() resolves without error when no collision", () => {
  it("resolves when no dirs contain the slug", async () => {
    await expect(checkSlugCollision(tempDir, "brand-new-slug")).resolves.toBeUndefined();
  });

  it("resolves when drafts/ has different slugs", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const otherDir = path.join(draftsDir, "other-feature");
    await fs.mkdir(otherDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "my-new-feature")).resolves.toBeUndefined();
  });
});

describe("TC-ST-008: read() returns parsed request", () => {
  it("reads content from directory-format <slug>/request.md", async () => {
    const content =
      "# My Feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: my-feature\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "my-feature", content);
    const parsed = await read(tempDir, "my-feature");
    expect(parsed.slug).toBe("my-feature");
  });

  it("reads content from legacy flat file via resolveWithFallback", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    const content =
      "# Legacy Feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: legacy-feature\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await fs.writeFile(path.join(draftsDir, "legacy-feature.md"), content);
    const parsed = await read(tempDir, "legacy-feature");
    expect(parsed.slug).toBe("legacy-feature");
  });
});

describe("TC-ST-009: checkSlugCollision() throws when slug exists in changes/archive/", () => {
  it("throws SpecRunnerError with code SLUG_COLLISION for archived slug (legacy, no date prefix)", async () => {
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", "archived-feature");
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(path.join(archiveDir, "request.md"), "# Archived Feature\n");

    await expect(checkSlugCollision(tempDir, "archived-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });

  it("throws SpecRunnerError with code SLUG_COLLISION for dated archive dir (2026-05-20-archived-feature)", async () => {
    const archiveDir = path.join(
      tempDir,
      "specrunner",
      "changes",
      "archive",
      "2026-05-20-archived-feature",
    );
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(path.join(archiveDir, "request.md"), "# Archived Feature\n");

    await expect(checkSlugCollision(tempDir, "archived-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });

  it("does not throw when archive contains a different slug", async () => {
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", "other-feature");
    await fs.mkdir(archiveDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "new-feature")).resolves.toBeUndefined();
  });

  it("does not throw when dated archive dir has a different slug", async () => {
    const archiveDir = path.join(
      tempDir,
      "specrunner",
      "changes",
      "archive",
      "2026-05-20-other-feature",
    );
    await fs.mkdir(archiveDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "new-feature")).resolves.toBeUndefined();
  });
});

describe("Regression: MERGED_SUBDIR removed", () => {
  it("store.ts source does not contain MERGED_SUBDIR", async () => {
    const src = await fs.readFile(
      path.join(__dirname, "../../../../src/core/request/store.ts"),
      "utf-8",
    );
    expect(src).not.toContain("MERGED_SUBDIR");
  });

  it("store.ts source does not contain requests/merged path", async () => {
    const src = await fs.readFile(
      path.join(__dirname, "../../../../src/core/request/store.ts"),
      "utf-8",
    );
    expect(src).not.toContain("requests/merged");
  });
});
