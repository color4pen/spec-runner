/**
 * Unit tests for src/core/command/create-dialog.ts
 *
 * TC-CD-001: detectCompletion — marker absent
 * TC-CD-002: detectCompletion — marker present, extracts content
 * TC-CD-003: detectCompletion — marker with no content after it
 * TC-CD-004: detectCompletion — empty string
 * TC-CD-010: streaming display — text_deltas written to stdout
 * TC-CD-011: dialog loop — first turn calls query with systemPrompt; no resume
 * TC-CD-012: dialog loop — second turn calls query with resume: sessionId; no systemPrompt
 * TC-CD-013: dialog loop — exit/quit saves draft and breaks
 * TC-CD-014: executeCreateDialog — ManagedRuntime error (non-LocalRuntime)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  detectCompletion,
  isLocalRuntime,
  finalize,
  executeCreateDialog,
} from "../../../../src/core/command/create-dialog.js";
import type { DialogParams } from "../../../../src/core/command/create-dialog.js";
import { isTextDelta, isStreamEvent, isToolUseStart } from "../../../../src/adapter/claude-code/message-types.js";
import type { RuntimeStrategy } from "../../../../src/core/runtime/strategy.js";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";

// ---------------------------------------------------------------------------
// readline mock — controls question() responses for dialog loop tests
// ---------------------------------------------------------------------------

// Mutable queue of answers; each test populates this before executeCreateDialog
const mockAnswerQueue: string[] = [];

vi.mock("readline/promises", () => ({
  createInterface: () => ({
    question: vi.fn().mockImplementation(() => {
      const answer = mockAnswerQueue.shift() ?? "";
      return Promise.resolve(answer);
    }),
    close: vi.fn(),
    on: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// TC-CD-001 – TC-CD-004: detectCompletion
// ---------------------------------------------------------------------------

describe("TC-CD-001: detectCompletion — marker absent", () => {
  it("returns detected: false for text without marker", () => {
    const result = detectCompletion("Some regular text without the marker.");
    expect(result.detected).toBe(false);
    expect(result.content).toBe("");
  });

  it("returns detected: false for empty string", () => {
    const result = detectCompletion("");
    expect(result.detected).toBe(false);
    expect(result.content).toBe("");
  });
});

describe("TC-CD-002: detectCompletion — marker present", () => {
  it("detects marker and returns content after it", () => {
    const text = "Here is the final draft:\n<!-- FINAL_DRAFT -->\n# My Feature\n\nContent here.";
    const result = detectCompletion(text);
    expect(result.detected).toBe(true);
    expect(result.content).toBe("# My Feature\n\nContent here.");
  });

  it("trims leading/trailing whitespace from content", () => {
    const text = "<!-- FINAL_DRAFT -->\n\n# My Feature\n";
    const result = detectCompletion(text);
    expect(result.detected).toBe(true);
    expect(result.content).toBe("# My Feature");
  });

  it("uses the first occurrence of the marker", () => {
    const text = "<!-- FINAL_DRAFT -->\nfirst content<!-- FINAL_DRAFT -->\nsecond";
    const result = detectCompletion(text);
    expect(result.detected).toBe(true);
    // Content after FIRST marker
    expect(result.content).toContain("first content");
  });
});

describe("TC-CD-003: detectCompletion — marker with no content", () => {
  it("returns detected: true with empty content when marker is at end", () => {
    const text = "Some text <!-- FINAL_DRAFT -->";
    const result = detectCompletion(text);
    expect(result.detected).toBe(true);
    expect(result.content).toBe("");
  });
});

describe("TC-CD-004: detectCompletion — empty string", () => {
  it("handles empty string gracefully", () => {
    expect(detectCompletion("")).toEqual({ detected: false, content: "" });
  });
});

// ---------------------------------------------------------------------------
// TC-CD-010: streaming display (isTextDelta extraction)
// ---------------------------------------------------------------------------

describe("TC-CD-010: streaming display — text_delta extraction", () => {
  it("isTextDelta identifies text delta messages correctly", () => {
    const textDeltaMsg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello, world!" },
      },
    };

    expect(isStreamEvent(textDeltaMsg)).toBe(true);
    expect(isTextDelta(textDeltaMsg)).toBe(true);
    expect(textDeltaMsg.event.delta.text).toBe("Hello, world!");
  });

  it("isTextDelta rejects non-text-delta events", () => {
    const inputJsonDelta = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: "{" },
      },
    };

    expect(isStreamEvent(inputJsonDelta)).toBe(true);
    expect(isTextDelta(inputJsonDelta)).toBe(false);
  });

  it("isToolUseStart identifies content_block_start tool_use messages", () => {
    const toolStart = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read" },
      },
    };
    expect(isToolUseStart(toolStart)).toBe(true);
  });

  it("isToolUseStart rejects non-tool-use messages", () => {
    expect(isToolUseStart({ type: "stream_event", event: { type: "content_block_delta" } })).toBe(false);
    expect(isToolUseStart({ type: "result", subtype: "success" })).toBe(false);
    expect(isToolUseStart(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// finalize() unit tests
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-dialog-test-"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  // Clear answer queue before each test
  mockAnswerQueue.length = 0;
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mockAnswerQueue.length = 0;
});

function buildValidRequestMd(opts: { title?: string; type?: string; slug?: string } = {}): string {
  const title = opts.title ?? "My Feature";
  const type = opts.type ?? "new-feature";
  const slug = opts.slug ?? "my-feature";
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

function buildDialogParams(overrides: Partial<DialogParams> = {}): DialogParams {
  return {
    description: "My feature description",
    type: "new-feature",
    slug: "my-feature",
    cwd: tempDir,
    runtime: {} as RuntimeStrategy,
    ...overrides,
  };
}

describe("finalize()", () => {
  it("writes request.md to active/ and returns exitCode 0 on valid content", async () => {
    const content = buildValidRequestMd({ type: "new-feature", slug: "my-feature" });
    const params = buildDialogParams();

    const result = await finalize(content, params);

    expect(result.exitCode).toBe(0);
    const expectedPath = path.join(tempDir, "specrunner", "requests", "active", "my-feature", "request.md");
    const written = await fs.readFile(expectedPath, "utf-8");
    expect(written).toBe(content);
  });

  it("returns requestMdPath on success", async () => {
    const content = buildValidRequestMd({ type: "new-feature", slug: "my-feature" });
    const result = await finalize(content, buildDialogParams());

    expect(result.exitCode).toBe(0);
    expect(result.requestMdPath).toBeDefined();
    expect(result.requestMdPath).toContain("my-feature");
    expect(result.requestMdPath).toContain("request.md");
  });

  it("outputs the written path to stdout", async () => {
    const content = buildValidRequestMd({ type: "new-feature", slug: "my-feature" });
    await finalize(content, buildDialogParams());

    const stdoutMock = process.stdout.write as ReturnType<typeof vi.fn>;
    const output = stdoutMock.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(output).toContain("my-feature");
    expect(output).toContain("request.md");
  });

  it("returns exitCode 1 when type does not match", async () => {
    const content = buildValidRequestMd({ type: "bug-fix", slug: "my-feature" });
    const params = buildDialogParams({ type: "new-feature" });

    const result = await finalize(content, params);
    expect(result.exitCode).toBe(1);
  });

  it("returns exitCode 1 when slug does not match", async () => {
    const content = buildValidRequestMd({ type: "new-feature", slug: "wrong-slug" });
    const params = buildDialogParams({ slug: "my-feature" });

    const result = await finalize(content, params);
    expect(result.exitCode).toBe(1);
  });

  it("returns exitCode 1 when content is not valid request.md", async () => {
    const content = "Not a valid request.md file";
    const params = buildDialogParams();

    const result = await finalize(content, params);
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isLocalRuntime guard
// ---------------------------------------------------------------------------

describe("isLocalRuntime", () => {
  it("returns true for a LocalRuntime instance", () => {
    const githubClient = {
      verifyBranch: vi.fn(),
      verifyPath: vi.fn(),
      getRawFile: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
    };
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient });
    expect(isLocalRuntime(runtime)).toBe(true);
  });

  it("returns false for a plain object (ManagedRuntime-like mock)", () => {
    const mockRuntime = {
      query: vi.fn(),
      createAgentRunner: vi.fn(),
      setupWorkspace: vi.fn(),
      buildDeps: vi.fn(),
      registerCleanup: vi.fn(),
      teardown: vi.fn(),
    };
    expect(isLocalRuntime(mockRuntime as unknown as RuntimeStrategy)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-CD-014: executeCreateDialog — non-LocalRuntime error
// ---------------------------------------------------------------------------

describe("TC-CD-014: executeCreateDialog — non-LocalRuntime error", () => {
  it("returns 1 and writes error when runtime is not a LocalRuntime instance", async () => {
    const runtime = {
      query: vi.fn(),
      createAgentRunner: vi.fn(),
      setupWorkspace: vi.fn(),
      buildDeps: vi.fn(),
      registerCleanup: vi.fn(),
      teardown: vi.fn(),
    } as unknown as RuntimeStrategy;

    const exitCode = await executeCreateDialog({
      description: "test",
      type: "new-feature",
      slug: "test-slug",
      cwd: tempDir,
      runtime,
    });

    expect(exitCode).toBe(1);
    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const errOutput = stderrMock.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(errOutput).toContain("Interactive mode requires local runtime");
  });
});

// ---------------------------------------------------------------------------
// Helper: build mock github client for LocalRuntime
// ---------------------------------------------------------------------------

function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// TC-CD-011: dialog loop — first turn calls query with systemPrompt; no resume
// ---------------------------------------------------------------------------

describe("TC-CD-011: dialog loop — first turn calls query with systemPrompt and no resume", () => {
  it("first query call includes systemPrompt, no resume, no continue", async () => {
    const capturedCalls: Array<{ prompt: string; opts: Record<string, unknown> }> = [];

    async function* mockQueryFn(params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      capturedCalls.push({
        prompt: params.prompt as string,
        opts: params.options ?? {},
      });
      // Emit result message to end the session
      yield { type: "result", subtype: "success", session_id: "sdk-session-001" };
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    await executeCreateDialog({
      description: "test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      runtime,
    });

    // First call should include systemPrompt and NOT include resume or continue
    expect(capturedCalls.length).toBeGreaterThanOrEqual(1);
    const firstCall = capturedCalls[0]!;
    expect(firstCall.opts["systemPrompt"]).toBeDefined();
    expect(firstCall.opts["resume"]).toBeUndefined();
    expect(firstCall.opts["continue"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-CD-012: dialog loop — second turn uses resume: sessionId; no systemPrompt
// ---------------------------------------------------------------------------

describe("TC-CD-012: dialog loop — second turn uses resume: sessionId; no systemPrompt", () => {
  it("second query call uses resume: sessionId and excludes systemPrompt", async () => {
    const capturedCalls: Array<{ prompt: string; opts: Record<string, unknown> }> = [];
    let callCount = 0;

    // Set up answer queue: first "> " prompt gets user input; then "exit"
    mockAnswerQueue.push("please refine the draft", "exit");

    async function* mockQueryFn(params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      callCount++;
      capturedCalls.push({
        prompt: params.prompt as string,
        opts: params.options ?? {},
      });
      if (callCount === 1) {
        // First turn: emit assistant message then result with session_id
        yield { type: "assistant", content: "Let me help you with that." };
        yield { type: "result", subtype: "success", session_id: "sdk-session-002" };
      } else {
        // Second turn: just end
        yield { type: "result", subtype: "success", session_id: "sdk-session-002" };
      }
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    await executeCreateDialog({
      description: "test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      runtime,
    });

    // Second call should use resume: sdkSessionId and NOT include systemPrompt
    expect(capturedCalls.length).toBeGreaterThanOrEqual(2);
    const secondCall = capturedCalls[1]!;
    expect(secondCall.opts["resume"]).toBe("sdk-session-002");
    expect(secondCall.opts["systemPrompt"]).toBeUndefined();
    expect(secondCall.opts["continue"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-CD-013: dialog loop — exit/quit saves draft and breaks
// ---------------------------------------------------------------------------

describe("TC-CD-013: dialog loop — exit input saves draft and breaks", () => {
  it("saves draft when user types exit after FINAL_DRAFT is detected", async () => {
    // Set up answer queue:
    // 1. "N" response to "この内容で request.md を書き出しますか？ [y/N] " (don't finalize)
    // 2. "exit" response to "> " (exit the loop)
    mockAnswerQueue.push("N", "exit");

    const draftContent = buildValidRequestMd({ type: "new-feature", slug: "test-feature" });

    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      // emit an assistant turn with a FINAL_DRAFT
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: `<!-- FINAL_DRAFT -->\n${draftContent}` },
        },
      };
      yield { type: "assistant" };
      // Don't emit result — the user will answer questions and then exit
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    const exitCode = await executeCreateDialog({
      description: "test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      runtime,
    });

    // Should exit cleanly
    expect(exitCode).toBe(0);

    // Draft file should have been saved (draft was detected)
    const { loadDraft } = await import("../../../../src/state/draft-store.js");
    const loaded = await loadDraft(tempDir, "test-feature");
    expect(loaded).not.toBeNull();
    expect(loaded?.content).toContain("test-feature");
  });
});

// ---------------------------------------------------------------------------
// TC-CD-015: consumeStream — text_delta written to stdout
// ---------------------------------------------------------------------------

describe("TC-CD-015: consumeStream — text_delta written to stdout", () => {
  it("writes text delta content to stdout during streaming", async () => {
    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello streaming world" },
        },
      };
      yield { type: "result", subtype: "success", session_id: "s-cd-015" };
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    await executeCreateDialog({
      description: "test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      runtime,
    });

    const stdoutMock = process.stdout.write as ReturnType<typeof vi.fn>;
    const output = stdoutMock.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    expect(output).toContain("Hello streaming world");
  });
});

// ---------------------------------------------------------------------------
// TC-CD-016: consumeStream — tool_use content_block_start written to stderr
// ---------------------------------------------------------------------------

describe("TC-CD-016: consumeStream — tool_use content_block_start written to stderr", () => {
  it("writes [tool] name to stderr on content_block_start tool_use", async () => {
    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Read" },
        },
      };
      yield { type: "result", subtype: "success", session_id: "s-cd-016" };
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    await executeCreateDialog({
      description: "test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      runtime,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const output = stderrMock.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    expect(output).toContain("[tool] Read");
  });
});

// ---------------------------------------------------------------------------
// TC-CD-017: consumeStream — FINAL_DRAFT detection shows draft path in stderr
// ---------------------------------------------------------------------------

describe("TC-CD-017: consumeStream — FINAL_DRAFT detection shows draft path in stderr", () => {
  it("writes draft file path to stderr when FINAL_DRAFT is detected", async () => {
    // "N" = don't finalize; "exit" = quit the loop
    mockAnswerQueue.push("N", "exit");

    const draftContent = buildValidRequestMd({ type: "new-feature", slug: "test-feature" });

    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: `<!-- FINAL_DRAFT -->\n${draftContent}` },
        },
      };
      yield { type: "assistant" };
      // No result message — generator ends naturally
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    await executeCreateDialog({
      description: "test feature",
      type: "new-feature",
      slug: "test-feature",
      cwd: tempDir,
      runtime,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const output = stderrMock.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    expect(output).toContain("specrunner/requests/draft/test-feature/request.md");
  });

  it("skips draft path display when slug is not yet known", async () => {
    // slug is unknown (not passed in params), no SLUG_PROPOSAL in the LLM text
    // On turn 1: slug is undefined → path display is skipped
    // Answer queue: "N" (decline finalize), "exit" (quit loop)
    mockAnswerQueue.push("N", "exit");

    const draftContent = buildValidRequestMd({ type: "new-feature", slug: "auto-slug" });

    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      // No SLUG_PROPOSAL marker in the text — slug stays unknown on turn 1
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: `<!-- FINAL_DRAFT -->\n${draftContent}` },
        },
      };
      yield { type: "assistant" };
      // No result message — generator ends naturally after first turn
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    // Do NOT pass slug — slug is unknown at start
    await executeCreateDialog({
      description: "auto slug",
      type: "new-feature",
      cwd: tempDir,
      runtime,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const output = stderrMock.mock.calls.map((c: unknown[]) => c[0] as string).join("");
    // Should NOT contain draft path (slug was undefined when FINAL_DRAFT was detected on turn 1)
    expect(output).not.toContain("specrunner/requests/draft/");
  });
});
