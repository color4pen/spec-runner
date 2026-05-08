/**
 * Unit tests for collectRequestPatterns.
 * TC-RP-001 through TC-RP-004
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { collectRequestPatterns } from "../../../src/context/request-patterns.js";

function buildRequestMd(opts: {
  title: string;
  type: string;
  slug: string;
  body?: string;
}): string {
  return `# ${opts.title}

## Meta

- **type**: ${opts.type}
- **slug**: ${opts.slug}

## 背景

${opts.body ?? "背景の説明"}

## Workflow Options

- enabled: []
`;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "request-patterns-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function createMergedRequest(slug: string, type: string, title: string): Promise<void> {
  const dir = path.join(tempDir, "specrunner", "requests", "merged", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "request.md"), buildRequestMd({ title, type, slug }));
}

describe("TC-RP-001: same type 3 items + different type 1 item", () => {
  it("returns up to 3 same-type + 1 different-type", async () => {
    await createMergedRequest("alpha-feature", "new-feature", "Alpha Feature");
    await createMergedRequest("beta-feature", "new-feature", "Beta Feature");
    await createMergedRequest("gamma-feature", "new-feature", "Gamma Feature");
    await createMergedRequest("delta-feature", "new-feature", "Delta Feature");
    await createMergedRequest("fix-something", "bug-fix", "Fix Something");

    const patterns = await collectRequestPatterns(tempDir, "new-feature");

    const sameType = patterns.filter((p) => p.type === "new-feature");
    const otherType = patterns.filter((p) => p.type !== "new-feature");

    expect(sameType.length).toBe(3);
    expect(otherType.length).toBe(1);
    expect(patterns.length).toBe(4);
  });

  it("returns same-type items in alphabetical order by slug", async () => {
    await createMergedRequest("c-feature", "new-feature", "C Feature");
    await createMergedRequest("a-feature", "new-feature", "A Feature");
    await createMergedRequest("b-feature", "new-feature", "B Feature");

    const patterns = await collectRequestPatterns(tempDir, "new-feature");
    const slugs = patterns.map((p) => p.slug);

    expect(slugs[0]).toBe("a-feature");
    expect(slugs[1]).toBe("b-feature");
    expect(slugs[2]).toBe("c-feature");
  });
});

describe("TC-RP-002: fewer than 3 same-type items", () => {
  it("returns only existing same-type items when fewer than 3 available", async () => {
    await createMergedRequest("only-feature", "new-feature", "Only Feature");
    await createMergedRequest("fix-bug", "bug-fix", "Fix Bug");

    const patterns = await collectRequestPatterns(tempDir, "new-feature");

    expect(patterns.length).toBe(2);
    expect(patterns.filter((p) => p.type === "new-feature").length).toBe(1);
    expect(patterns.filter((p) => p.type === "bug-fix").length).toBe(1);
  });

  it("returns empty array when no merged requests exist at all", async () => {
    const patterns = await collectRequestPatterns(tempDir, "new-feature");
    expect(patterns).toEqual([]);
  });
});

describe("TC-RP-003: merged directory does not exist", () => {
  it("returns empty array when merged/ directory does not exist", async () => {
    const patterns = await collectRequestPatterns(tempDir, "new-feature");
    expect(patterns).toEqual([]);
  });
});

describe("TC-RP-004: individual file read failure is skipped", () => {
  it("skips directories without request.md", async () => {
    // Create a directory without request.md
    const noFilesDir = path.join(tempDir, "specrunner", "requests", "merged", "no-request-file");
    await fs.mkdir(noFilesDir, { recursive: true });

    // Create a valid one
    await createMergedRequest("valid-feature", "new-feature", "Valid Feature");

    const patterns = await collectRequestPatterns(tempDir, "new-feature");

    expect(patterns.length).toBe(1);
    expect(patterns[0]?.slug).toBe("valid-feature");
  });

  it("skips request.md files that fail parsing", async () => {
    const brokenDir = path.join(tempDir, "specrunner", "requests", "merged", "broken");
    await fs.mkdir(brokenDir, { recursive: true });
    // Write invalid content (no title heading, no type)
    await fs.writeFile(path.join(brokenDir, "request.md"), "this is not valid request.md content");

    await createMergedRequest("valid-feature", "new-feature", "Valid Feature");

    const patterns = await collectRequestPatterns(tempDir, "new-feature");

    expect(patterns.length).toBe(1);
    expect(patterns[0]?.slug).toBe("valid-feature");
  });
});
