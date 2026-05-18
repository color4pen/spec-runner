/**
 * Unit tests for src/core/request/store.ts
 *
 * TC-ST-001: resolve() returns the absolute path to request.md in active/<slug>/
 * TC-ST-002: list() returns slug names for entries with request.md
 * TC-ST-003: list() returns empty array when active/ does not exist
 * TC-ST-004: write() creates request.md in the expected location
 * TC-ST-005: checkSlugCollision() throws SLUG_COLLISION when slug exists in active/
 * TC-ST-006: checkSlugCollision() throws SLUG_COLLISION when slug exists in merged/
 * TC-ST-007: checkSlugCollision() resolves without error when no collision
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolve, list, write, checkSlugCollision } from "../../../../src/core/request/store.js";

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
  it("returns absolute path to specrunner/requests/active/<slug>/request.md", () => {
    const result = resolve(tempDir, "my-feature");
    const expected = path.join(tempDir, "specrunner", "requests", "active", "my-feature", "request.md");
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// TC-ST-002
// ---------------------------------------------------------------------------
describe("TC-ST-002: list() with existing entries", () => {
  it("returns slug names for entries that have request.md", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");

    // Create two slugs with request.md, one without
    await fs.mkdir(path.join(activeDir, "slug-a"), { recursive: true });
    await fs.writeFile(path.join(activeDir, "slug-a", "request.md"), "# A\n\n## Meta\n\n- **type**: new-feature\n- **slug**: slug-a\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");

    await fs.mkdir(path.join(activeDir, "slug-b"), { recursive: true });
    await fs.writeFile(path.join(activeDir, "slug-b", "request.md"), "# B\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: slug-b\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n");

    // Entry without request.md — should be skipped
    await fs.mkdir(path.join(activeDir, "no-request-md"), { recursive: true });

    const slugs = await list(tempDir);
    expect(slugs).toContain("slug-a");
    expect(slugs).toContain("slug-b");
    expect(slugs).not.toContain("no-request-md");
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
describe("TC-ST-004: write() creates request.md", () => {
  it("creates the directory and writes request.md content", async () => {
    const content = "# Test\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n- **base-branch**: main\n- **adr**: false\n\n## Workflow Options\n\n- enabled: []\n";
    await write(tempDir, "test-slug", content);

    const expectedPath = path.join(tempDir, "specrunner", "requests", "active", "test-slug", "request.md");
    const written = await fs.readFile(expectedPath, "utf-8");
    expect(written).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// TC-ST-005
// ---------------------------------------------------------------------------
describe("TC-ST-005: checkSlugCollision() throws when slug exists in active/", () => {
  it("throws SpecRunnerError with code SLUG_COLLISION", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active", "my-feature");
    await fs.mkdir(activeDir, { recursive: true });

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
    const mergedDir = path.join(tempDir, "specrunner", "requests", "merged", "old-feature");
    await fs.mkdir(mergedDir, { recursive: true });

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
    const activeDir = path.join(tempDir, "specrunner", "requests", "active", "other-feature");
    await fs.mkdir(activeDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "my-new-feature")).resolves.toBeUndefined();
  });
});
