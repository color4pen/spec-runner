import { describe, it, expect } from "vitest";
import { shouldRunFollowUp, mergeFollowUpResult } from "../../../src/adapter/shared/follow-up.js";
import type { AgentRunResult } from "../../../src/core/port/agent-runner.js";

function makeBaseResult(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    completionReason: "success",
    resultContent: "base content",
    sessionId: "sess-turn1",
    toolResult: null,
    followUpAttempts: 0,
    modelUsage: { "claude-opus-4": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
    ...overrides,
  };
}

describe("shouldRunFollowUp", () => {
  it("returns true when postWorkPrompts has entries and completionReason is success", () => {
    expect(shouldRunFollowUp({ policy: { postWorkPrompts: ["fix this"] } }, "success")).toBe(true);
  });

  it("returns true when postWorkPrompts has multiple entries and completionReason is success", () => {
    expect(shouldRunFollowUp({ policy: { postWorkPrompts: ["a", "b"] } }, "success")).toBe(true);
  });

  it("returns false when postWorkPrompts has entries and completionReason is error", () => {
    expect(shouldRunFollowUp({ policy: { postWorkPrompts: ["fix this"] } }, "error")).toBe(false);
  });

  it("returns false when postWorkPrompts has entries and completionReason is timeout", () => {
    expect(shouldRunFollowUp({ policy: { postWorkPrompts: ["fix this"] } }, "timeout")).toBe(false);
  });

  it("returns false when postWorkPrompts is empty array and completionReason is success", () => {
    expect(shouldRunFollowUp({ policy: { postWorkPrompts: [] } }, "success")).toBe(false);
  });

  it("returns false when postWorkPrompts is undefined and completionReason is success", () => {
    expect(shouldRunFollowUp({ policy: { postWorkPrompts: undefined } }, "success")).toBe(false);
  });
});

describe("mergeFollowUpResult", () => {
  it("maintains sessionId from base result (turn 1)", () => {
    const base = makeBaseResult({ sessionId: "sess-base-turn1" });
    const merged = mergeFollowUpResult(base, "follow content");
    expect(merged.sessionId).toBe("sess-base-turn1");
  });

  it("uses resultContent from follow-up turn", () => {
    const base = makeBaseResult({ resultContent: "work turn content" });
    const merged = mergeFollowUpResult(base, "follow-up fixed content");
    expect(merged.resultContent).toBe("follow-up fixed content");
  });

  it("maintains modelUsage from base result (adapter pre-updated)", () => {
    const base = makeBaseResult({
      modelUsage: { "claude-opus-4": { inputTokens: 300, outputTokens: 150, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
    });
    const merged = mergeFollowUpResult(base, "content");
    expect(merged.modelUsage).toEqual(base.modelUsage);
  });

  it("handles null followUpResultContent", () => {
    const base = makeBaseResult({ resultContent: "work content" });
    const merged = mergeFollowUpResult(base, null);
    expect(merged.resultContent).toBeNull();
  });
});
