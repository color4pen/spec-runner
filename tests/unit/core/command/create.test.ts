/**
 * Unit tests for create command.
 * TC-CR-001: buildScaffoldTemplate validates
 * TC-CR-006: executeCreate --no-llm writes scaffold template
 * TC-CR-008: --no-llm is functional after 1-shot cleanup
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  buildScaffoldTemplate,
  executeCreate,
} from "../../../../src/core/command/create.js";
import { isResultMessage } from "../../../../src/adapter/claude-code/message-types.js";
import { parseRequestMdContent } from "../../../../src/parser/request-md.js";

// Helpers
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

// --- isResultMessage ---
describe("isResultMessage", () => {
  it("returns true for valid result message", () => {
    expect(isResultMessage({ type: "result", subtype: "success", result: "content" })).toBe(true);
  });

  it("returns false for non-object", () => {
    expect(isResultMessage(null)).toBe(false);
    expect(isResultMessage("string")).toBe(false);
    expect(isResultMessage(42)).toBe(false);
  });

  it("returns false when type is not 'result'", () => {
    expect(isResultMessage({ type: "text", subtype: "success" })).toBe(false);
  });

  it("returns false when subtype is missing", () => {
    expect(isResultMessage({ type: "result" })).toBe(false);
  });
});

// --- buildScaffoldTemplate ---
describe("TC-CR-001: buildScaffoldTemplate", () => {
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

// --- executeCreate ---
let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-test-"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function buildMockRuntime() {
  const queryInteractiveMock = vi.fn().mockImplementation(async function* () {
    yield { type: "result" };
  });

  return {
    query: vi.fn(),
    queryInteractive: queryInteractiveMock,
    createAgentRunner: vi.fn(),
    setupWorkspace: vi.fn(),
    buildDeps: vi.fn(),
    registerCleanup: vi.fn(),
    teardown: vi.fn(),
  };
}

describe("TC-CR-006: executeCreate --no-llm writes scaffold template", () => {
  it("writes scaffold template without calling LLM when --no-llm is set", async () => {
    const runtime = buildMockRuntime();

    const exitCode = await executeCreate({
      description: "My New Feature",
      type: "new-feature",
      slug: "my-new-feature",
      cwd: tempDir,
      noLlm: true,
      run: false,
      runtime: runtime as unknown as import("../../../../src/core/runtime/strategy.js").RuntimeStrategy,
    });

    expect(exitCode).toBe(0);
    // LLM should NOT be called
    expect(runtime.query).not.toHaveBeenCalled();
    expect(runtime.queryInteractive).not.toHaveBeenCalled();

    const expectedPath = path.join(
      tempDir,
      "specrunner",
      "requests",
      "active",
      "my-new-feature",
      "request.md",
    );
    const written = await fs.readFile(expectedPath, "utf-8");
    // Scaffold should pass parseRequestMdContent
    const parsed = parseRequestMdContent(written, expectedPath);
    expect(parsed.type).toBe("new-feature");
    expect(parsed.slug).toBe("my-new-feature");
  });

  it("outputs the path of the written file to stdout", async () => {
    const runtime = buildMockRuntime();

    await executeCreate({
      description: "My New Feature",
      type: "new-feature",
      slug: "my-new-feature",
      cwd: tempDir,
      noLlm: true,
      run: false,
      runtime: runtime as unknown as import("../../../../src/core/runtime/strategy.js").RuntimeStrategy,
    });

    const stdoutMock = process.stdout.write as ReturnType<typeof vi.fn>;
    const writtenPaths = stdoutMock.mock.calls.map((c: unknown[]) => c[0]);
    const expectedPath = path.join(
      tempDir,
      "specrunner",
      "requests",
      "active",
      "my-new-feature",
      "request.md",
    );
    expect(writtenPaths.some((p: unknown) => typeof p === "string" && p.includes(expectedPath))).toBe(true);
  });

  it("returns 1 when slug collision is detected", async () => {
    // Create existing slug directory
    const existingDir = path.join(tempDir, "specrunner", "requests", "active", "test-feature");
    await fs.mkdir(existingDir, { recursive: true });

    const runtime = buildMockRuntime();

    const exitCode = await executeCreate({
      description: "Test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      noLlm: true,
      run: false,
      runtime: runtime as unknown as import("../../../../src/core/runtime/strategy.js").RuntimeStrategy,
    });

    expect(exitCode).toBe(1);
  });
});

describe("TC-CR-008: executeCreate delegates to executeCreateDialog in default mode", () => {
  it("returns result from executeCreateDialog (ManagedRuntime without queryInteractive returns 1)", async () => {
    // Runtime without queryInteractive
    const runtime = {
      query: vi.fn(),
      createAgentRunner: vi.fn(),
      setupWorkspace: vi.fn(),
      buildDeps: vi.fn(),
      registerCleanup: vi.fn(),
      teardown: vi.fn(),
    };

    const exitCode = await executeCreate({
      description: "Test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      noLlm: false,
      run: false,
      runtime: runtime as unknown as import("../../../../src/core/runtime/strategy.js").RuntimeStrategy,
    });

    // Without queryInteractive, executeCreateDialog returns 1
    expect(exitCode).toBe(1);
  });
});
