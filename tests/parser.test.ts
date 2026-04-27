import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRequestMdContent } from "../src/parser/request-md.js";

// Silence stderr for tests that trigger warnings
beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

// TC-001: request.md 正常パース（全フィールド存在）
describe("TC-001: parseRequestMd — full valid content", () => {
  it("returns type, title, content, enabled", () => {
    const content = `# My Feature Request

## Meta

- **type**: new-feature
- **status**: draft

## Workflow Options

- enabled: test-case-generator, adr

## Description

Some content here.
`;
    const result = parseRequestMdContent(content);
    expect(result.type).toBe("new-feature");
    expect(result.title).toBe("My Feature Request");
    expect(result.content).toBe(content);
    expect(Array.isArray(result.enabled)).toBe(true);
    expect(result.title.length).toBeGreaterThan(0);
  });
});

// TC-002: enabled が空
describe("TC-002: enabled が空", () => {
  it("returns empty enabled array when no items under enabled key", () => {
    const content = `# Title

## Meta

- **type**: new-feature

## Workflow Options

- enabled:

`;
    const result = parseRequestMdContent(content);
    expect(result.enabled).toEqual([]);
  });
});

// TC-003: ワークフローオプションセクションが存在しない
describe("TC-003: no workflow options section", () => {
  it("returns enabled as empty array", () => {
    const content = `# Title

## Meta

- **type**: new-feature

## Description

Content here.
`;
    const result = parseRequestMdContent(content);
    expect(result.enabled).toEqual([]);
    // Should not throw
  });
});

// TC-004: title（level-1 heading）が欠落
describe("TC-004: missing title", () => {
  it("throws REQUEST_MD_INVALID with 'missing title'", () => {
    const content = `## Meta

- **type**: new-feature

Some text without level-1 heading.
`;
    expect(() => parseRequestMdContent(content)).toThrow(
      "missing title (top-level # heading required)",
    );
  });

  it("throws with code REQUEST_MD_INVALID", () => {
    const content = `## Meta

- **type**: new-feature
`;
    try {
      parseRequestMdContent(content);
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("REQUEST_MD_INVALID");
    }
  });
});

// TC-005: type が欠落
describe("TC-005: missing type in Meta", () => {
  it("throws REQUEST_MD_INVALID with 'missing type in Meta section'", () => {
    const content = `# Title

## Meta

- **status**: draft

## Description

Content.
`;
    expect(() => parseRequestMdContent(content)).toThrow(
      "missing 'type' in Meta section",
    );
  });

  it("throws with code REQUEST_MD_INVALID", () => {
    const content = `# Title\n\n## Meta\n\n- **status**: draft\n`;
    try {
      parseRequestMdContent(content);
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("REQUEST_MD_INVALID");
    }
  });
});

// TC-007: parser は外部 npm 依存を使わない（static analysis via import check)
describe("TC-007: parser has no external npm dependencies", () => {
  it("does not import external Markdown or SDK libraries", async () => {
    // Read the source directly to verify imports
    const fs = await import("node:fs/promises");
    const fileContent = await fs.readFile(
      new URL("../src/parser/request-md.ts", import.meta.url).pathname,
      "utf-8",
    );
    // Should not import from @anthropic-ai/sdk, zod, or markdown parsers
    expect(fileContent).not.toMatch(/from ["']@anthropic-ai\/sdk["']/);
    expect(fileContent).not.toMatch(/from ["']zod["']/);
    expect(fileContent).not.toMatch(/from ["']marked["']/);
    expect(fileContent).not.toMatch(/from ["']remark["']/);
  });
});

// Additional: test enabled extraction from the actual request.md format
describe("enabled extraction", () => {
  it("extracts multi-item inline enabled list", () => {
    const content = `# Feature

## Meta

- **type**: new-feature

## Workflow Options

- enabled: test-case-generator, adr, security-reviewer
`;
    const result = parseRequestMdContent(content);
    expect(result.enabled).toContain("test-case-generator");
    expect(result.enabled).toContain("adr");
    expect(result.enabled).toContain("security-reviewer");
  });

  it("extracts multi-line enabled list", () => {
    const content = `# Feature

## Meta

- **type**: new-feature

## Workflow Options

- enabled:
  - test-case-generator
  - adr
`;
    const result = parseRequestMdContent(content);
    expect(result.enabled).toContain("test-case-generator");
    expect(result.enabled).toContain("adr");
  });
});
