/**
 * Unit tests for src/core/command/create-dialog.ts
 *
 * TC-CD-001: detectCompletion — marker absent
 * TC-CD-002: detectCompletion — marker present, extracts content
 * TC-CD-003: detectCompletion — marker with no content after it
 * TC-CD-004: detectCompletion — empty string
 * TC-CD-005: createPromptGenerator — initial message + user input + exit
 * TC-CD-006: createPromptGenerator — exit without draft saves nothing
 * TC-CD-007: createPromptGenerator — exit with draft calls onExit
 * TC-CD-008: hasQueryInteractive — true for runtime with method
 * TC-CD-009: hasQueryInteractive — false for runtime without method
 * TC-CD-010: streaming display — text_deltas written to stdout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  detectCompletion,
  createPromptGenerator,
  hasQueryInteractive,
  finalize,
  executeCreateDialog,
} from "../../../../src/core/command/create-dialog.js";
import type { DialogParams, ReadlineInterface } from "../../../../src/core/command/create-dialog.js";
import { isTextDelta, isStreamEvent, isToolUseSummary } from "../../../../src/adapter/claude-code/message-types.js";
import type { RuntimeStrategy } from "../../../../src/core/runtime/strategy.js";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

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
// TC-CD-005 – TC-CD-007: createPromptGenerator
// ---------------------------------------------------------------------------

function buildMockRl(answers: string[]): ReadlineInterface {
  let idx = 0;
  return {
    question: vi.fn().mockImplementation(() => {
      const answer = answers[idx++] ?? "";
      return Promise.resolve(answer);
    }),
    close: vi.fn(),
  };
}

function buildInitialMessage(content = "initial user message"): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
}

describe("TC-CD-005: createPromptGenerator — initial message + user input + exit", () => {
  it("yields initial message first, then user inputs, stops on exit", async () => {
    const rl = buildMockRl(["first input", "second input", "exit"]);
    const onExit = vi.fn().mockResolvedValue(undefined);
    const initial = buildInitialMessage("describe the feature");

    const gen = createPromptGenerator({
      initialMessage: initial,
      rl,
      getLatestDraft: () => null,
      onExit,
      getPendingMessage: () => null,
    });

    const messages: SDKUserMessage[] = [];
    for await (const msg of gen) {
      messages.push(msg);
    }

    // Should yield: initial + "first input" + "second input" (exit stops without yielding)
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual(initial);
    expect(messages[1]!.message.content).toBe("first input");
    expect(messages[2]!.message.content).toBe("second input");
  });

  it("stops on 'quit' as well", async () => {
    const rl = buildMockRl(["some input", "quit"]);
    const onExit = vi.fn().mockResolvedValue(undefined);

    const gen = createPromptGenerator({
      initialMessage: buildInitialMessage(),
      rl,
      getLatestDraft: () => null,
      onExit,
      getPendingMessage: () => null,
    });

    const messages: SDKUserMessage[] = [];
    for await (const msg of gen) {
      messages.push(msg);
    }

    // initial + "some input"; "quit" stops the generator
    expect(messages).toHaveLength(2);
  });
});

describe("TC-CD-006: createPromptGenerator — exit without draft", () => {
  it("calls onExit with null when no draft content is available", async () => {
    const rl = buildMockRl(["exit"]);
    const onExit = vi.fn().mockResolvedValue(undefined);

    const gen = createPromptGenerator({
      initialMessage: buildInitialMessage(),
      rl,
      getLatestDraft: () => null,
      onExit,
      getPendingMessage: () => null,
    });

    // Consume the generator
    for await (const _ of gen) { /* consume */ }

    expect(onExit).toHaveBeenCalledWith(null);
  });
});

describe("TC-CD-007: createPromptGenerator — exit with draft calls onExit", () => {
  it("calls onExit with the latest draft content", async () => {
    const rl = buildMockRl(["exit"]);
    const onExit = vi.fn().mockResolvedValue(undefined);
    const latestDraft = "# My Feature\n\nSome draft content";

    const gen = createPromptGenerator({
      initialMessage: buildInitialMessage(),
      rl,
      getLatestDraft: () => latestDraft,
      onExit,
      getPendingMessage: () => null,
    });

    for await (const _ of gen) { /* consume */ }

    expect(onExit).toHaveBeenCalledWith(latestDraft);
  });
});

// ---------------------------------------------------------------------------
// TC-CD-008 – TC-CD-009: hasQueryInteractive
// ---------------------------------------------------------------------------

describe("TC-CD-008: hasQueryInteractive — true when method exists", () => {
  it("returns true for a runtime with queryInteractive method", () => {
    const runtimeWithInteractive = {
      query: vi.fn(),
      queryInteractive: vi.fn(),
      createAgentRunner: vi.fn(),
      setupWorkspace: vi.fn(),
      buildDeps: vi.fn(),
      registerCleanup: vi.fn(),
      teardown: vi.fn(),
    };

    expect(hasQueryInteractive(runtimeWithInteractive as unknown as RuntimeStrategy)).toBe(true);
  });
});

describe("TC-CD-009: hasQueryInteractive — false when method absent", () => {
  it("returns false for a runtime without queryInteractive method", () => {
    const runtimeWithout = {
      query: vi.fn(),
      createAgentRunner: vi.fn(),
      setupWorkspace: vi.fn(),
      buildDeps: vi.fn(),
      registerCleanup: vi.fn(),
      teardown: vi.fn(),
    };

    expect(hasQueryInteractive(runtimeWithout as unknown as RuntimeStrategy)).toBe(false);
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

  it("isToolUseSummary identifies tool_use_summary messages", () => {
    const toolSummary = { type: "tool_use_summary", summary: "Read: src/foo.ts" };
    expect(isToolUseSummary(toolSummary)).toBe(true);
  });

  it("isToolUseSummary rejects non-summary messages", () => {
    expect(isToolUseSummary({ type: "stream_event" })).toBe(false);
    expect(isToolUseSummary({ type: "tool_use_summary" })).toBe(false); // missing summary field
    expect(isToolUseSummary(null)).toBe(false);
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
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
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
// executeCreateDialog — routing tests
// ---------------------------------------------------------------------------

describe("executeCreateDialog — ManagedRuntime error", () => {
  it("returns 1 and writes error when runtime lacks queryInteractive", async () => {
    const runtime = {
      query: vi.fn(),
      createAgentRunner: vi.fn(),
      setupWorkspace: vi.fn(),
      buildDeps: vi.fn(),
      registerCleanup: vi.fn(),
      teardown: vi.fn(),
      // NOTE: no queryInteractive
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
