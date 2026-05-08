/**
 * Unit tests for src/adapter/claude-code/message-types.ts
 *
 * TC-MT-001: isResultMessage() returns true for valid result messages
 * TC-MT-002: isResultMessage() returns false for non-result objects
 * TC-MT-003: isStreamEvent() type guard
 * TC-MT-004: isTextDelta() type guard
 * TC-MT-005: isToolUseStart() type guard
 */
import { describe, it, expect } from "vitest";
import {
  isResultMessage,
  isStreamEvent,
  isTextDelta,
  isToolUseStart,
} from "../../../../src/adapter/claude-code/message-types.js";

describe("TC-MT-001: isResultMessage() with valid result messages", () => {
  it("returns true for a success result message with result field", () => {
    expect(isResultMessage({ type: "result", subtype: "success", result: "content" })).toBe(true);
  });

  it("returns true for a result message without result field (subtype only)", () => {
    expect(isResultMessage({ type: "result", subtype: "error_max_turns" })).toBe(true);
  });

  it("returns true for error subtype result messages", () => {
    expect(isResultMessage({ type: "result", subtype: "error_during_execution" })).toBe(true);
  });

  it("returns true for result message with extra fields", () => {
    expect(isResultMessage({ type: "result", subtype: "success", result: "ok", extra: 42 })).toBe(true);
  });
});

describe("TC-MT-002: isResultMessage() with non-result values", () => {
  it("returns false for null", () => {
    expect(isResultMessage(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isResultMessage("result")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isResultMessage(42)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isResultMessage(undefined)).toBe(false);
  });

  it("returns false when type is not 'result'", () => {
    expect(isResultMessage({ type: "text", subtype: "success" })).toBe(false);
    expect(isResultMessage({ type: "assistant", subtype: "success" })).toBe(false);
  });

  it("returns false when subtype is missing", () => {
    expect(isResultMessage({ type: "result" })).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isResultMessage({})).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isResultMessage([])).toBe(false);
  });
});

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
// TC-MT-004: isTextDelta()
// ---------------------------------------------------------------------------

describe("TC-MT-004: isTextDelta() type guard", () => {
  it("returns true for a valid text_delta stream event", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello!" },
      },
    };
    expect(isTextDelta(msg)).toBe(true);
  });

  it("returns false when event.type is not content_block_delta", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_start", content_block: {} },
    };
    expect(isTextDelta(msg)).toBe(false);
  });

  it("returns false when delta.type is not text_delta", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: "{" },
      },
    };
    expect(isTextDelta(msg)).toBe(false);
  });

  it("returns false when delta.text is not a string", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: 42 },
      },
    };
    expect(isTextDelta(msg)).toBe(false);
  });

  it("returns false when delta is null", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_delta", delta: null },
    };
    expect(isTextDelta(msg)).toBe(false);
  });

  it("returns false for non-stream-event messages", () => {
    expect(isTextDelta({ type: "result", subtype: "success" })).toBe(false);
    expect(isTextDelta(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-MT-005: isToolUseStart()
// ---------------------------------------------------------------------------

describe("TC-MT-005: isToolUseStart() type guard", () => {
  it("returns true for a valid content_block_start with tool_use", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read" },
      },
    };
    expect(isToolUseStart(msg)).toBe(true);
  });

  it("returns true for empty string name", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "" },
      },
    };
    expect(isToolUseStart(msg)).toBe(true);
  });

  it("returns false when content_block.type is not tool_use", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "text", text: "hello" },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when content_block.name is missing", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use" },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when content_block.name is not a string", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: 42 },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when event.type is not content_block_start", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hi" },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when content_block is null", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_start", content_block: null },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false for non-stream-event messages", () => {
    expect(isToolUseStart({ type: "result", subtype: "success" })).toBe(false);
    expect(isToolUseStart(null)).toBe(false);
    expect(isToolUseStart(undefined)).toBe(false);
  });
});
