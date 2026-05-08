/**
 * Unit tests for src/adapter/claude-code/message-types.ts
 *
 * TC-MT-001: isResultMessage() returns true for valid result messages
 * TC-MT-002: isResultMessage() returns false for non-result objects
 */
import { describe, it, expect } from "vitest";
import { isResultMessage } from "../../../../src/adapter/claude-code/message-types.js";

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
