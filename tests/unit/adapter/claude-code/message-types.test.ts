/**
 * Unit tests for src/adapter/claude-code/message-types.ts
 *
 * TC-MT-003: isStreamEvent() type guard
 * TC-MT-005: isToolUse() type guard
 */
import { describe, it, expect } from "vitest";
import {
  isStreamEvent,
  isToolUse,
} from "../../../../src/adapter/claude-code/message-types.js";

// ---------------------------------------------------------------------------
// TC-MT-003: isStreamEvent()
// ---------------------------------------------------------------------------

describe("TC-MT-003: isStreamEvent() type guard", () => {
  it("returns true for a valid stream_event with event object", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
    };
    expect(isStreamEvent(msg)).toBe(true);
  });

  it("returns false when type is not stream_event", () => {
    expect(isStreamEvent({ type: "assistant", event: {} })).toBe(false);
    expect(isStreamEvent({ type: "result", event: {} })).toBe(false);
  });

  it("returns false when event property is missing", () => {
    expect(isStreamEvent({ type: "stream_event" })).toBe(false);
  });

  it("returns false when event is not an object", () => {
    expect(isStreamEvent({ type: "stream_event", event: "string" })).toBe(false);
    expect(isStreamEvent({ type: "stream_event", event: null })).toBe(false);
    expect(isStreamEvent({ type: "stream_event", event: 42 })).toBe(false);
  });

  it("returns false for null/non-objects", () => {
    expect(isStreamEvent(null)).toBe(false);
    expect(isStreamEvent("stream_event")).toBe(false);
    expect(isStreamEvent(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-MT-005: isToolUse()
// ---------------------------------------------------------------------------

describe("TC-MT-005: isToolUse() type guard", () => {
  it("returns true for a valid tool_use content_block_start event", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Edit", input: { file_path: "src/foo.ts" } },
      },
    };
    expect(isToolUse(msg)).toBe(true);
  });

  it("returns true for tool_use without input field", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Bash" },
      },
    };
    expect(isToolUse(msg)).toBe(true);
  });

  it("narrows content_block.name to string", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Write", input: {} },
      },
    };
    if (isToolUse(msg)) {
      expect(typeof msg.event.content_block.name).toBe("string");
    } else {
      throw new Error("isToolUse should have returned true");
    }
  });

  it("returns false when event.type is not content_block_start", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        content_block: { type: "tool_use", name: "Edit" },
      },
    };
    expect(isToolUse(msg)).toBe(false);
  });

  it("returns false when content_block.type is not tool_use", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "text", text: "" },
      },
    };
    expect(isToolUse(msg)).toBe(false);
  });

  it("returns false when content_block is null", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: null,
      },
    };
    expect(isToolUse(msg)).toBe(false);
  });

  it("returns false when content_block is missing", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_start" },
    };
    expect(isToolUse(msg)).toBe(false);
  });

  it("returns false for non-stream-event messages", () => {
    expect(isToolUse({ type: "result", subtype: "success" })).toBe(false);
    expect(isToolUse(null)).toBe(false);
    expect(isToolUse(undefined)).toBe(false);
  });
});

