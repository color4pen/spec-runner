/**
 * Unit tests for src/core/command/request.ts
 *
 * TC-REQ-001: buildScaffoldTemplate() embeds type, title, slug
 * TC-REQ-002: executeTemplate() writes to stdout and returns 0
 * TC-REQ-003: executeTemplate() with bug-fix type embeds bug-fix
 * TC-REQ-004: executeValidate() returns 0 for valid request.md
 * TC-REQ-005: executeValidate() returns 1 and writes stderr for invalid request.md
 * TC-REQ-006: executeValidate() returns 1 for non-existent file
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  buildScaffoldTemplate,
  executeTemplate,
  executeValidate,
} from "../../../../src/core/command/request.js";
import { parseRequestMdContent } from "../../../../src/parser/request-md.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildValidRequestMd(opts: {
  title?: string;
  type?: string;
  slug?: string;
} = {}): string {
  const title = opts.title ?? "Test Feature";
  const type = opts.type ?? "new-feature";
  const slug = opts.slug ?? "test-feature";
  return `# ${title}

## Meta

- **type**: ${type}
- **slug**: ${slug}
- **base-branch**: main

## 背景

背景の説明

## 要件

1. 要件 1

## スコープ外

- スコープ外

## 受け入れ基準

- [ ] bun run typecheck && bun run test が green

## Workflow Options

- enabled: []
`;
}

// ---------------------------------------------------------------------------
// TC-REQ-001: buildScaffoldTemplate()
// ---------------------------------------------------------------------------

describe("TC-REQ-001: buildScaffoldTemplate() embeds type, title, slug", () => {
  it("embeds title in the output", () => {
    const content = buildScaffoldTemplate({
      title: "My New Feature",
      type: "new-feature",
      slug: "my-new-feature",
    });
    expect(content).toContain("# My New Feature");
  });

  it("embeds type in the Meta section", () => {
    const content = buildScaffoldTemplate({
      title: "My Feature",
      type: "new-feature",
      slug: "my-feature",
    });
    expect(content).toContain("**type**: new-feature");
  });

  it("embeds slug in the Meta section", () => {
    const content = buildScaffoldTemplate({
      title: "My Feature",
      type: "new-feature",
      slug: "my-feature",
    });
    expect(content).toContain("**slug**: my-feature");
  });

  it("produces content that passes parseRequestMdContent validation", () => {
    const content = buildScaffoldTemplate({
      title: "My New Feature",
      type: "new-feature",
      slug: "my-new-feature",
    });
    // Should not throw
    const parsed = parseRequestMdContent(content, "<test>");
    expect(parsed.title).toBe("My New Feature");
    expect(parsed.type).toBe("new-feature");
    expect(parsed.slug).toBe("my-new-feature");
  });

  it("includes all required sections", () => {
    const content = buildScaffoldTemplate({
      title: "Test",
      type: "bug-fix",
      slug: "test-fix",
    });
    expect(content).toContain("## 背景");
    expect(content).toContain("## 要件");
    expect(content).toContain("## スコープ外");
    expect(content).toContain("## 受け入れ基準");
    expect(content).toContain("bun run typecheck && bun run test");
  });
});

// ---------------------------------------------------------------------------
// TC-REQ-002 / TC-REQ-003: executeTemplate()
// ---------------------------------------------------------------------------

describe("TC-REQ-002: executeTemplate() writes template to stdout and returns 0", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 0", () => {
    const result = executeTemplate("new-feature");
    expect(result).toBe(0);
  });

  it("writes content to stdout", () => {
    executeTemplate("new-feature");
    expect(stdoutSpy).toHaveBeenCalled();
    const written = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(typeof written).toBe("string");
    expect(written.length).toBeGreaterThan(0);
  });

  it("writes template with placeholder title and slug", () => {
    executeTemplate("new-feature");
    const written = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(written).toContain("<タイトルを記入>");
    expect(written).toContain("<slug を記入>");
  });
});

describe("TC-REQ-003: executeTemplate() with bug-fix type embeds bug-fix", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes bug-fix in the type field", () => {
    executeTemplate("bug-fix");
    const written = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => c[0]).join("");
    expect(written).toContain("**type**: bug-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-REQ-004 / TC-REQ-005 / TC-REQ-006: executeValidate()
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "request-validate-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("TC-REQ-004: executeValidate() returns 0 for valid request.md", () => {
  it("returns 0 when file is valid", async () => {
    const filePath = path.join(tempDir, "request.md");
    await fs.writeFile(filePath, buildValidRequestMd(), "utf-8");
    const result = await executeValidate(filePath);
    expect(result).toBe(0);
  });

  it("does not write to stderr for valid file", async () => {
    const filePath = path.join(tempDir, "request.md");
    await fs.writeFile(filePath, buildValidRequestMd(), "utf-8");
    await executeValidate(filePath);
    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    expect(stderrMock).not.toHaveBeenCalled();
  });
});

describe("TC-REQ-005: executeValidate() returns 1 and writes stderr for invalid request.md", () => {
  it("returns 1 for a file missing the type field", async () => {
    const filePath = path.join(tempDir, "request.md");
    // Missing Meta section with type
    const invalid = `# My Feature\n\n## Workflow Options\n\n- enabled: []\n`;
    await fs.writeFile(filePath, invalid, "utf-8");
    const result = await executeValidate(filePath);
    expect(result).toBe(1);
  });

  it("writes an error message to stderr", async () => {
    const filePath = path.join(tempDir, "request.md");
    const invalid = `# My Feature\n\n## Workflow Options\n\n- enabled: []\n`;
    await fs.writeFile(filePath, invalid, "utf-8");
    await executeValidate(filePath);
    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    expect(stderrMock).toHaveBeenCalled();
    const written = stderrMock.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("Error:");
  });

  it("writes a hint to stderr when SpecRunnerError is thrown", async () => {
    const filePath = path.join(tempDir, "request.md");
    const invalid = `# My Feature\n\n## Workflow Options\n\n- enabled: []\n`;
    await fs.writeFile(filePath, invalid, "utf-8");
    await executeValidate(filePath);
    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const written = stderrMock.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("Hint:");
  });
});

describe("TC-REQ-006: executeValidate() returns 1 for non-existent file", () => {
  it("returns 1 when file does not exist", async () => {
    const filePath = path.join(tempDir, "nonexistent.md");
    const result = await executeValidate(filePath);
    expect(result).toBe(1);
  });

  it("writes an error message to stderr for non-existent file", async () => {
    const filePath = path.join(tempDir, "nonexistent.md");
    await executeValidate(filePath);
    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    expect(stderrMock).toHaveBeenCalled();
    const written = stderrMock.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(written).toContain("Error:");
  });
});
