/**
 * Unit tests for src/core/request/store.ts
 *
 * TC-ST-001: resolve() returns specrunner/drafts/<slug>.md path
 * TC-ST-002: list() returns slug names for *.md files in drafts/
 * TC-ST-003: list() returns empty array when drafts/ does not exist
 * TC-ST-004: write() creates <slug>.md in specrunner/drafts/
 * TC-ST-005: checkSlugCollision() throws SLUG_COLLISION when slug exists in drafts/
 * TC-ST-007: checkSlugCollision() resolves without error when no collision
 * TC-ST-008: read() returns parsed request from flat file
 * TC-ST-009: checkSlugCollision() throws SLUG_COLLISION when slug exists in changes/archive/
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolve, list, read, write, checkSlugCollision } from "../../../../src/core/request/store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("TC-ST-001: resolve()", () => {
  it("returns absolute flat path specrunner/drafts/<slug>.md", () => {
    const result = resolve(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "drafts", "my-feature.md");
    expect(result).toBe(expected);
  });
});

describe("TC-ST-002: list() with existing entries", () => {
  it("returns slug names for *.md files in drafts/", async () => {
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });

    await fs.writeFile(
      path.join(draftsDir, "slug-a.md"),
      "# A\n\n## Meta\n\n- **type**: new-feature\n- **slug**: slug-a\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );
    await fs.writeFile(
      path.join(draftsDir, "slug-b.md"),
      "# B\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: slug-b\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );
    await fs.writeFile(path.join(draftsDir, "readme.txt"), "ignored\n");

    const slugs = await list(tempDir);
    expect(slugs).toContain("slug-a");
    expect(slugs).toContain("slug-b");
    expect(slugs).not.toContain("readme");
    expect(slugs).toHaveLength(2);
  });
});

describe("TC-ST-003: list() when drafts/ does not exist", () => {
  it("returns empty array", async () => {
    const slugs = await list(tempDir);
    expect(slugs).toEqual([]);
  });
});

describe("TC-ST-004: write() creates <slug>.md", () => {
  it("creates the drafts dir and writes <slug>.md content", async () => {
    const content = "# Test\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "test-slug", content);

    const expectedPath = path.join(tempDir, "specrunner", "drafts", "test-slug.md");
    const written = await fs.readFile(expectedPath, "utf-8");
    expect(written).toBe(content);
  });
});

describe("TC-ST-005: checkSlugCollision() throws when slug exists in drafts/", () => {
  it("throws SpecRunnerError with code SLUG_COLLISION", async () => {
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
    await fs.writeFile(path.join(draftsDir, "other-feature.md"), "# Other\n");

    await expect(checkSlugCollision(tempDir, "my-new-feature")).resolves.toBeUndefined();
  });
});

describe("TC-ST-008: read() returns parsed request from flat file", () => {
  it("reads content from drafts/<slug>.md", async () => {
    const content =
      "# My Feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: my-feature\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "my-feature", content);
    const parsed = await read(tempDir, "my-feature");
    expect(parsed.slug).toBe("my-feature");
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
