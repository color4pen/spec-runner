/**
 * Unit tests for src/core/request/generator.ts
 *
 * TC-GEN-001: generate() with valid mock queryFn returns { slug, content }
 * TC-GEN-002: generate() with invalid content from mock queryFn throws SpecRunnerError
 * TC-GEN-003: generate() with slug collision throws SLUG_COLLISION and queryFn is not called
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { generate } from "../../../../src/core/request/generator.js";
import { SpecRunnerError } from "../../../../src/errors.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "generator-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-GEN-001
// ---------------------------------------------------------------------------
describe("TC-GEN-001: generate() with valid mock queryFn", () => {
  it("returns { slug, content } and writes request.md to active/", async () => {
    // The input text determines the slug: slugify("add user authentication feature")
    // = "add-user-authentication-feature"
    const inputText = "add user authentication feature";
    const expectedSlug = "add-user-authentication-feature";

    // Valid request.md with <generated-slug> placeholder (will be replaced by generate())
    const validContent = `# Add User Authentication Feature

## Meta

- **type**: new-feature
- **slug**: <generated-slug>
- **base-branch**: main
- **adr**: false

## 背景

背景の説明

## 要件

1. 要件1

## 受け入れ基準

- [ ] 基準1

## Workflow Options

- enabled: []
`;

    const mockResultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      result: validContent,
    };

    async function* mockQueryFn(_args: unknown): AsyncGenerator<typeof mockResultMessage, void> {
      yield mockResultMessage;
    }

    const result = await generate(
      inputText,
      tempDir,
      {} as import("../../../../src/config/schema.js").SpecRunnerConfig,
      mockQueryFn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
    );

    expect(result.slug).toBe(expectedSlug);
    expect(result.content).toContain(expectedSlug);
    expect(result.content).not.toContain("<generated-slug>");

    // Verify file was written to the store (flat form)
    const expectedPath = path.join(
      tempDir,
      "specrunner",
      "drafts",
      expectedSlug + ".md",
    );
    const written = await fs.readFile(expectedPath, "utf-8");
    expect(written).toBe(result.content);
  });
});

// ---------------------------------------------------------------------------
// TC-GEN-002
// ---------------------------------------------------------------------------
describe("TC-GEN-002: generate() with invalid content from mock queryFn", () => {
  it("throws SpecRunnerError when generated content fails validation", async () => {
    // Return content that will fail parseRequestMdContent (missing required fields)
    const invalidContent = "This is not a valid request.md at all.";

    const mockResultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      result: invalidContent,
    };

    async function* mockQueryFn(_args: unknown): AsyncGenerator<typeof mockResultMessage, void> {
      yield mockResultMessage;
    }

    await expect(
      generate(
        "some feature description",
        tempDir,
        {} as import("../../../../src/config/schema.js").SpecRunnerConfig,
        mockQueryFn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
      ),
    ).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("throws SpecRunnerError with code REQUEST_MD_INVALID", async () => {
    const invalidContent = "No title here.";

    const mockResultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      result: invalidContent,
    };

    async function* mockQueryFn(_args: unknown): AsyncGenerator<typeof mockResultMessage, void> {
      yield mockResultMessage;
    }

    await expect(
      generate(
        "another feature",
        tempDir,
        {} as import("../../../../src/config/schema.js").SpecRunnerConfig,
        mockQueryFn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
      ),
    ).rejects.toMatchObject({
      code: "REQUEST_MD_INVALID",
    });
  });
});

// ---------------------------------------------------------------------------
// TC-GEN-003
// ---------------------------------------------------------------------------
describe("TC-GEN-003: generate() with slug collision", () => {
  it("throws SLUG_COLLISION error and queryFn is never called", async () => {
    // Pre-create the flat .md file to trigger collision
    const slug = "my-feature";
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    await fs.mkdir(draftsDir, { recursive: true });
    await fs.writeFile(path.join(draftsDir, slug + ".md"), "# my-feature\n");

    const mockQueryFn = vi.fn();

    await expect(
      generate(
        "my feature",
        tempDir,
        {} as import("../../../../src/config/schema.js").SpecRunnerConfig,
        mockQueryFn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
      ),
    ).rejects.toMatchObject({
      code: "SLUG_COLLISION",
    });

    expect(mockQueryFn).not.toHaveBeenCalled();
  });
});
