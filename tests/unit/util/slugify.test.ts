/**
 * Unit tests for slugify utility.
 * TC-SL-001 through TC-SL-006
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { slugify, checkSlugCollision } from "../../../src/util/slugify.js";

describe("slugify", () => {
  it("TC-SL-001: converts English description to kebab-case", () => {
    expect(slugify("Add new feature for users")).toBe("add-new-feature-for-users");
  });

  it("TC-SL-001b: handles mixed case", () => {
    expect(slugify("Fix Bug In UserService")).toBe("fix-bug-in-userservice");
  });

  it("TC-SL-002: removes Japanese characters, keeps English parts", () => {
    expect(slugify("新しい機能を追加する add feature")).toBe("add-feature");
    expect(slugify("ユーザー管理機能")).toBe("untitled");
    expect(slugify("request-create コマンドを実装する")).toBe("request-create");
  });

  it("TC-SL-003: replaces special symbols with hyphens and collapses consecutive hyphens", () => {
    expect(slugify("Hello!@#$%World")).toBe("hello-world");
    expect(slugify("fix---bug")).toBe("fix-bug");
    expect(slugify("  multiple   spaces  ")).toBe("multiple-spaces");
  });

  it("TC-SL-003b: removes leading and trailing hyphens", () => {
    expect(slugify("!leading and trailing!")).toBe("leading-and-trailing");
  });

  it("TC-SL-004: truncates to 50 characters by default", () => {
    const long = "a-very-long-description-that-exceeds-fifty-characters-limit";
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("TC-SL-004b: does not leave trailing hyphen after truncation", () => {
    // Create a string that would end on a hyphen at position 50
    const str = "a".repeat(49) + "-extra";
    const result = slugify(str);
    expect(result.endsWith("-")).toBe(false);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("TC-SL-004c: respects custom maxLength", () => {
    const result = slugify("hello-world-test", 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("TC-SL-005: returns 'untitled' for empty string", () => {
    expect(slugify("")).toBe("untitled");
  });

  it("TC-SL-005b: returns 'untitled' for string with only special characters", () => {
    expect(slugify("!!!###$$$")).toBe("untitled");
  });

  it("TC-SL-005c: returns 'untitled' for string with only Japanese", () => {
    expect(slugify("日本語のみ")).toBe("untitled");
  });
});

describe("checkSlugCollision", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slugify-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("TC-SL-006a: does not throw when slug has no collision", async () => {
    await expect(checkSlugCollision(tempDir, "my-new-feature")).resolves.toBeUndefined();
  });

  it("TC-SL-006b: does not throw when active/ and merged/ directories do not exist", async () => {
    await expect(checkSlugCollision(tempDir, "any-slug")).resolves.toBeUndefined();
  });

  it("TC-SL-006c: throws SLUG_COLLISION when slug exists in active/", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active", "my-feature");
    await fs.mkdir(activeDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "my-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });

  it("TC-SL-006d: throws SLUG_COLLISION when slug exists in merged/", async () => {
    const mergedDir = path.join(tempDir, "specrunner", "requests", "merged", "old-feature");
    await fs.mkdir(mergedDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "old-feature")).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });
  });

  it("TC-SL-006e: does not throw when slug does not match any existing directory", async () => {
    const activeDir = path.join(tempDir, "specrunner", "requests", "active", "other-feature");
    await fs.mkdir(activeDir, { recursive: true });

    await expect(checkSlugCollision(tempDir, "my-new-feature")).resolves.toBeUndefined();
  });
});
