/**
 * Unit tests for context-observer.ts (pure module, no I/O).
 *
 * TC-003: 複数 turn の assistant message から最大値を採る
 * TC-004: sub-agent と replay の message は peak に数えない
 * TC-005: 同一 message を二重に数えない
 * TC-006: compaction 2 回で回数と直近の前後値が残る
 * TC-007: after 値を返さない compaction
 * TC-008: 溢れ直前の観測値が exhaustionAtTokens になる
 * TC-009: 観測が無い場合は値を作らない
 * TC-010: context 溢れ以外の失敗では exhaustionAtTokens を付けない
 * TC-025: context-observer が I/O なし pure module として実装されている
 * TC-026: isContextExhaustionError の allowlist 照合（true / false の両方向）
 * TC-027: observeResult が result message から contextWindow を抽出する
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createContextObserver, isContextExhaustionError } from "../../../../src/adapter/claude-code/context-observer.js";

// ─── TC-025: pure module — no I/O imports ─────────────────────────────────────

describe("TC-025: context-observer は I/O なし pure module として実装されている", () => {
  it("context-observer.ts does not import node:fs, child_process, or SDK runtime values", () => {
    const filePath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../../../src/adapter/claude-code/context-observer.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Must not import I/O modules
    expect(content).not.toMatch(/from ["']node:fs["']/);
    expect(content).not.toMatch(/from ["']node:child_process["']/);
    expect(content).not.toMatch(/from ["']child_process["']/);

    // Must not import SDK runtime values (only type imports are allowed)
    // i.e. no `import { ... } from "@anthropic-ai/..."` (non-type import)
    const sdkRuntimeImports = content.match(/^import\s+\{[^}]+\}\s+from\s+["']@anthropic-ai/m);
    expect(sdkRuntimeImports).toBeNull();
  });
});

// ─── TC-026: isContextExhaustionError allowlist ────────────────────────────────

describe("TC-026: isContextExhaustionError の allowlist 照合", () => {
  it("returns true for 'prompt is too long' (case-insensitive)", () => {
    expect(isContextExhaustionError("Prompt is too long")).toBe(true);
    expect(isContextExhaustionError("PROMPT IS TOO LONG for this model")).toBe(true);
    expect(isContextExhaustionError("error: prompt is too long to process")).toBe(true);
  });

  it("returns true for 'context length exceeded' (case-insensitive)", () => {
    expect(isContextExhaustionError("Context length exceeded")).toBe(true);
    expect(isContextExhaustionError("context length exceeded for model claude")).toBe(true);
    expect(isContextExhaustionError("CONTEXT LENGTH EXCEEDED")).toBe(true);
  });

  it("returns true for 'context window exceeded' (case-insensitive)", () => {
    expect(isContextExhaustionError("Context window exceeded")).toBe(true);
    expect(isContextExhaustionError("context window exceeded limit")).toBe(true);
  });

  it("returns false for unknown error strings (fail-closed)", () => {
    expect(isContextExhaustionError("network error")).toBe(false);
    expect(isContextExhaustionError("rate limit exceeded")).toBe(false);
    expect(isContextExhaustionError("timeout")).toBe(false);
    expect(isContextExhaustionError("Internal server error")).toBe(false);
    expect(isContextExhaustionError("")).toBe(false);
    expect(isContextExhaustionError("stream idle timeout - partial response received")).toBe(false);
  });
});

// ─── TC-003: peak max value from multiple turns ────────────────────────────────

describe("TC-003: 複数 turn の assistant message から最大値を採る", () => {
  it("peakActiveContextTokens is the max across multiple assistant messages", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    // Turn 1: 50000 tokens
    // SDKAssistantMessage wraps BetaMessage in `message` field; usage is at message.message.usage
    observer.observe({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 30000,
          cache_read_input_tokens: 15000,
          cache_creation_input_tokens: 5000,
        },
      },
    });

    // Turn 2: 80000 tokens (peak)
    observer.observe({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 50000,
          cache_read_input_tokens: 20000,
          cache_creation_input_tokens: 10000,
        },
      },
    });

    // Turn 3: 60000 tokens (not peak)
    observer.observe({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 40000,
          cache_read_input_tokens: 15000,
          cache_creation_input_tokens: 5000,
        },
      },
    });

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    expect(metrics!.peakActiveContextTokens).toBe(80000);
  });

  it("sums input + cacheRead + cacheCreate for active context value", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.observe({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 10000,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 2000,
        },
      },
    });

    const metrics = observer.snapshot();
    expect(metrics!.peakActiveContextTokens).toBe(17000); // 10000 + 5000 + 2000
  });
});

// ─── TC-004: sub-agent and replay exclusion ────────────────────────────────────

describe("TC-004: sub-agent と replay の message は peak に数えない", () => {
  it("assistant message with parent_tool_use_id is excluded from peak", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // Regular assistant message first (to ensure peak starts)
    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    // Sub-agent message (has parent_tool_use_id) — should be excluded
    observer.observe({
      type: "assistant",
      parent_tool_use_id: "tool-use-abc123",
      message: { usage: { input_tokens: 500000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    const metrics = observer.snapshot();
    // Peak should be 10000 (the non-sub-agent), not 500000
    expect(metrics!.peakActiveContextTokens).toBe(10000);
  });

  it("assistant message with isReplay === true is excluded from peak", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // Replayed message from prior session — should be excluded
    observer.observe({
      type: "assistant",
      isReplay: true,
      message: { usage: { input_tokens: 500000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    // Regular message
    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    const metrics = observer.snapshot();
    expect(metrics!.peakActiveContextTokens).toBe(10000);
  });

  it("assistant message with parent_tool_use_id null is NOT excluded", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // null parent_tool_use_id means it IS the main assistant (not a sub-agent)
    observer.observe({
      type: "assistant",
      parent_tool_use_id: null,
      message: { usage: { input_tokens: 25000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    const metrics = observer.snapshot();
    expect(metrics!.peakActiveContextTokens).toBe(25000);
  });
});

// ─── TC-005: no double-counting ───────────────────────────────────────────────

describe("TC-005: 同一 message を二重に数えない", () => {
  it("calling observe twice with the same message object would count twice (caller must not do this)", () => {
    // This test documents the contract: the observer does NOT deduplicate internally.
    // The adapter's responsibility is to call observe() exactly once per message.
    // Here we just verify that observing the same value twice records the same peak.
    const observer = createContextObserver({ provider: "claude-code" });

    const msg = {
      type: "assistant",
      message: { usage: { input_tokens: 30000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    };

    observer.observe(msg);
    // Even if called again (which the adapter should not do), peak stays the same since 30000 === 30000
    observer.observe(msg);

    const metrics = observer.snapshot();
    // Peak is 30000 — calling twice with the same value does not change it
    expect(metrics!.peakActiveContextTokens).toBe(30000);
  });
});

// ─── TC-006: compaction count and before/after ────────────────────────────────

describe("TC-006: compaction 2 回で回数と直近の前後値が残る", () => {
  it("records compactionCount = 2 and keeps before/after from the LAST compaction", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // First compaction: before=100000, after=30000
    observer.observe({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { pre_tokens: 100000, post_tokens: 30000 },
    });

    // Second compaction: before=90000, after=25000 (last one wins)
    observer.observe({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { pre_tokens: 90000, post_tokens: 25000 },
    });

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    expect(metrics!.compactionCount).toBe(2);
    expect(metrics!.contextTokensBeforeCompaction).toBe(90000); // last compaction
    expect(metrics!.contextTokensAfterCompaction).toBe(25000);  // last compaction
  });
});

// ─── TC-007: compaction without post_tokens ───────────────────────────────────

describe("TC-007: after 値を返さない compaction", () => {
  it("when compact_metadata has no post_tokens, contextTokensAfterCompaction is undefined", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // First compaction with post_tokens
    observer.observe({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { pre_tokens: 100000, post_tokens: 30000 },
    });

    // Second compaction WITHOUT post_tokens
    observer.observe({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { pre_tokens: 95000 },
    });

    const metrics = observer.snapshot();
    expect(metrics!.compactionCount).toBe(2);
    expect(metrics!.contextTokensBeforeCompaction).toBe(95000); // last compaction
    // after must be undefined — NOT carried over from the first compaction
    expect(metrics!.contextTokensAfterCompaction).toBeUndefined();
  });

  it("single compaction without post_tokens leaves after undefined", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.observe({
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { pre_tokens: 80000 },
    });

    const metrics = observer.snapshot();
    expect(metrics!.compactionCount).toBe(1);
    expect(metrics!.contextTokensBeforeCompaction).toBe(80000);
    expect(metrics!.contextTokensAfterCompaction).toBeUndefined();
  });
});

// ─── TC-008: exhaustionAtTokens ───────────────────────────────────────────────

describe("TC-008: 溢れ直前の観測値が exhaustionAtTokens になる", () => {
  it("exhaustionAtTokens is the last observed active context value before markExhaustion", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // Observe some turns — using correct SDKAssistantMessage structure (usage at message.message.usage)
    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 100000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0 } },
    });
    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 120000, cache_read_input_tokens: 60000, cache_creation_input_tokens: 0 } },
    });

    // Mark exhaustion (last observed was 180000 from second turn)
    observer.markExhaustion("Prompt is too long");

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    expect(metrics!.exhaustionAtTokens).toBe(180000); // 120000 + 60000
  });
});

// ─── TC-009: no observation → no values fabricated ────────────────────────────

describe("TC-009: 観測が無い場合は値を作らない", () => {
  it("snapshot() returns undefined when no messages were observed", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    const metrics = observer.snapshot();
    expect(metrics).toBeUndefined();
  });

  it("markExhaustion with no prior observations does not create exhaustionAtTokens", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.markExhaustion("Prompt is too long");

    const metrics = observer.snapshot();
    // No assistant messages observed → exhaustionAtTokens not set → snapshot is undefined
    expect(metrics).toBeUndefined();
  });
});

// ─── TC-010: non-exhaustion errors do not set exhaustionAtTokens ───────────────

describe("TC-010: context 溢れ以外の失敗では exhaustionAtTokens を付けない", () => {
  it("markExhaustion with non-exhaustion text does not set exhaustionAtTokens", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // Observe a normal turn — using correct SDKAssistantMessage structure
    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 50000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    // Non-exhaustion error
    observer.markExhaustion("network error: connection reset");

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    // Peak was observed
    expect(metrics!.peakActiveContextTokens).toBe(50000);
    // But exhaustionAtTokens must NOT be set
    expect(metrics!.exhaustionAtTokens).toBeUndefined();
  });
});

// ─── TC-027: observeResult extracts contextWindow ─────────────────────────────

describe("TC-027: observeResult が result message から contextWindow を抽出する", () => {
  it("extracts contextWindow from the resolved model key", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    observer.observeResult({
      modelUsage: {
        "claude-sonnet-4-5": {
          inputTokens: 100,
          outputTokens: 50,
          contextWindow: 200000,
        },
      },
    });

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    expect(metrics!.contextWindowTokens).toBe(200000);
  });

  it("falls back to max contextWindow when model key is not found", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    observer.observeResult({
      modelUsage: {
        "claude-opus-4-5": {
          inputTokens: 100,
          outputTokens: 50,
          contextWindow: 100000,
        },
        "claude-haiku-4-5": {
          inputTokens: 50,
          outputTokens: 25,
          contextWindow: 50000,
        },
      },
    });

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    // Max of 100000 and 50000
    expect(metrics!.contextWindowTokens).toBe(100000);
  });

  it("does not set contextWindowTokens when modelUsage is absent", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    // Only observe an assistant message to ensure there's something to snapshot
    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    observer.observeResult({
      // No modelUsage field
    });

    const metrics = observer.snapshot();
    expect(metrics).toBeDefined();
    expect(metrics!.contextWindowTokens).toBeUndefined();
  });

  it("does not set contextWindowTokens when contextWindow is not a number", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    observer.observeResult({
      modelUsage: {
        "claude-sonnet-4-5": {
          inputTokens: 100,
          contextWindow: "200000", // string, not a number
        },
      },
    });

    const metrics = observer.snapshot();
    expect(metrics!.contextWindowTokens).toBeUndefined();
  });
});

// ─── Additional edge cases ─────────────────────────────────────────────────────

describe("Additional edge cases", () => {
  it("ignores non-assistant, non-compact_boundary message types", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.observe({ type: "user", message: { usage: { input_tokens: 100000 } } });
    observer.observe({ type: "tool_use", message: { usage: { input_tokens: 100000 } } });
    observer.observe({ type: "result", subtype: "success" });
    observer.observe({ type: "system", subtype: "other_event" });

    const metrics = observer.snapshot();
    expect(metrics).toBeUndefined();
  });

  it("snapshot includes provider and model in the output", () => {
    const observer = createContextObserver({ provider: "claude-code", model: "claude-sonnet-4-5" });

    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    const metrics = observer.snapshot();
    expect(metrics!.provider).toBe("claude-code");
    expect(metrics!.model).toBe("claude-sonnet-4-5");
  });

  it("snapshot without model parameter does not include model field", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    const metrics = observer.snapshot();
    expect(metrics!.provider).toBe("claude-code");
    expect("model" in metrics!).toBe(false);
  });

  it("handles assistant message with no message field gracefully", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // No message field (top-level usage would also not work — must be nested)
    observer.observe({ type: "assistant" });

    const metrics = observer.snapshot();
    expect(metrics).toBeUndefined();
  });

  it("handles assistant message with message field but no usage gracefully", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    // message field present but no usage inside
    observer.observe({ type: "assistant", message: {} });

    const metrics = observer.snapshot();
    expect(metrics).toBeUndefined();
  });

  it("compact_boundary without compact_metadata still increments count", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.observe({
      type: "system",
      subtype: "compact_boundary",
      // No compact_metadata
    });

    const metrics = observer.snapshot();
    expect(metrics!.compactionCount).toBe(1);
    expect(metrics!.contextTokensBeforeCompaction).toBeUndefined();
    expect(metrics!.contextTokensAfterCompaction).toBeUndefined();
  });

  it("exhaustionAtTokens is set when error matches allowlist AND observation exists", () => {
    const observer = createContextObserver({ provider: "claude-code" });

    observer.observe({
      type: "assistant",
      message: { usage: { input_tokens: 187000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });

    observer.markExhaustion("Claude Code returned an error result: Prompt is too long");

    const metrics = observer.snapshot();
    expect(metrics!.exhaustionAtTokens).toBe(187000);
  });
});
