/**
 * Unit tests for src/core/request/store.ts
 *
 * TC-ST-001: resolve() returns the absolute flat path active/<slug>.md
 * TC-ST-002: list() returns slug names for *.md files in active/
 * TC-ST-003: list() returns empty array when active/ does not exist
 * TC-ST-004: write() creates <slug>.md in the expected location
 * TC-ST-005: checkSlugCollision() throws SLUG_COLLISION when slug exists in active/
 * TC-ST-006: checkSlugCollision() throws SLUG_COLLISION when slug exists in merged/
 * TC-ST-007: checkSlugCollision() resolves without error when no collision
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

// ---------------------------------------------------------------------------
// TC-ST-001
// ---------------------------------------------------------------------------
describe("TC-ST-001: resolve()", () => {
  it("returns absolute flat path specrunner/requests/active/<slug>.md", () => {
    const result = resolve(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "requests", "active", "my-feature.md");
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// TC-ST-002
// ---------------------------------------------------------------------------
describe("TC-ST-002: list() with existing entries", () => {
  it("returns slug names for *.md files in active/", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(activeDir, { recursive: true });

    // Create two flat .md files
    await fs.writeFile(
      path.join(activeDir, "slug-a.md"),
      "# A\n\n## Meta\n\n- **type**: new-feature\n- **slug**: slug-a\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );
    await fs.writeFile(
      path.join(activeDir, "slug-b.md"),
      "# B\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: slug-b\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n",
    );

    // Non-.md file — should be filtered out
    await fs.writeFile(path.join(activeDir, "readme.txt"), "ignored\n");

    const slugs = await list(tempDir);
    expect(slugs).toContain("slug-a");
    expect(slugs).toContain("slug-b");
    expect(slugs).not.toContain("readme");
    expect(slugs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// TC-ST-003
// ---------------------------------------------------------------------------
describe("TC-ST-003: list() when active/ does not exist", () => {
  it("returns empty array", async () => {
    const slugs = await list(tempDir);
    expect(slugs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-ST-004
// ---------------------------------------------------------------------------
describe("TC-ST-004: write() creates <slug>.md", () => {
  it("creates the active dir and writes <slug>.md content", async () => {
    const content = "# Test\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "test-slug", content);

    const expectedPath = path.join(tempDir, "specrunner", "requests", "active", "test-slug.md");
    const written = await fs.readFile(expectedPath, "utf-8");
    expect(written).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// TC-ST-005
// ---------------------------------------------------------------------------
describe("TC-ST-005: checkSlugCollision() throws when slug exists in active/", () => {
  it("throws SpecRunnerError with code SLUG_COLLISION", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(path.join(activeDir, "my-feature.md"), "# My Feature\n");

    await expect(checkSlugCollision(tempDir, "my-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });
});

// ---------------------------------------------------------------------------
// TC-ST-006
// ---------------------------------------------------------------------------
describe("TC-ST-006: checkSlugCollision() throws when slug exists in merged/", () => {
  it("throws SpecRunnerError with code SLUG_COLLISION", async () => {
    const mergedDir = path.join(tempDir, "specrunner", "requests", "merged");
    await fs.mkdir(mergedDir, { recursive: true });
    await fs.writeFile(path.join(mergedDir, "old-feature.md"), "# Old Feature\n");

    await expect(checkSlugCollision(tempDir, "old-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });
});

// ---------------------------------------------------------------------------
// TC-ST-007
// ---------------------------------------------------------------------------
describe("TC-ST-007: checkSlugCollision() resolves without error when no collision", () => {
  it("resolves when neither active/ nor merged/ contain the slug", async () => {
    await expect(checkSlugCollision(tempDir, "brand-new-slug")).resolves.toBeUndefined();
  });

  it("resolves when active/ has different slugs", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(path.join(activeDir, "other-feature.md"), "# Other\n");

    await expect(checkSlugCollision(tempDir, "my-new-feature")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-ST-008
// ---------------------------------------------------------------------------
describe("TC-ST-008: read() returns parsed request from flat file", () => {
  it("reads content from active/<slug>.md", async () => {
    const content =
      "# My Feature\n\n## Meta\n\n- **type**: new-feature\n- **slug**: my-feature\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "my-feature", content);
    const parsed = await read(tempDir, "my-feature");
    expect(parsed.slug).toBe("my-feature");
  });
});
