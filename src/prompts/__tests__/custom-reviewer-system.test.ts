/**
 * T-03: buildCustomReviewerSystemPrompt unit tests.
 *
 * Verifies the CLI-owned judge contract frame is always present and that
 * reviewer md content is injected only into named slots.
 */
import { describe, it, expect } from "vitest";
import { buildCustomReviewerSystemPrompt } from "../custom-reviewer-system.js";
import { VERDICT_BLOCKING_RULES } from "../judge-rules.js";
import type { ReviewerSnapshot } from "../../core/reviewers/types.js";

function makeSnapshot(overrides: Partial<ReviewerSnapshot> = {}): ReviewerSnapshot {
  return {
    name: "security",
    maxIterations: 3,
    purpose: "セキュリティ観点の検査",
    criteria: "認証・認可の欠落を確認",
    judgment: "CRITICAL/HIGH が 0 件なら approved",
    freeText: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Judge contract frame always present
// ---------------------------------------------------------------------------

describe("buildCustomReviewerSystemPrompt — judge contract frame", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    expect(prompt).toContain(VERDICT_BLOCKING_RULES);
  });

  it("contains the read-only reviewer constraint", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    expect(prompt).toContain("read-only reviewer");
  });

  it("contains findings format requirement (severity field)", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    expect(prompt).toContain("severity");
  });

  it("contains findings format requirement (resolution field)", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    expect(prompt).toContain("resolution");
  });

  it("contains verdict derivation note (CLI derives verdict from findings)", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    expect(prompt).toContain("findings");
  });

  it("contains report_result tool requirement", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    expect(prompt).toContain("report_result");
  });
});

// ---------------------------------------------------------------------------
// Reviewer md content injected into slots only
// ---------------------------------------------------------------------------

describe("buildCustomReviewerSystemPrompt — reviewer content in slots", () => {
  it("includes reviewer name", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot({ name: "performance" }));
    expect(prompt).toContain("performance");
  });

  it("includes purpose content", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot({ purpose: "unique-purpose-xyz" }));
    expect(prompt).toContain("unique-purpose-xyz");
  });

  it("includes criteria content", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot({ criteria: "unique-criteria-abc" }));
    expect(prompt).toContain("unique-criteria-abc");
  });

  it("includes judgment content", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot({ judgment: "unique-judgment-def" }));
    expect(prompt).toContain("unique-judgment-def");
  });

  it("includes freeText when present", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot({ freeText: "unique-freetext-ghi" }));
    expect(prompt).toContain("unique-freetext-ghi");
  });

  it("does not error on empty freeText", () => {
    expect(() => buildCustomReviewerSystemPrompt(makeSnapshot({ freeText: "" }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Security: reviewer content cannot override judge contract
// ---------------------------------------------------------------------------

describe("buildCustomReviewerSystemPrompt — security isolation", () => {
  it("judge contract section appears after reviewer content (cannot be replaced)", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeSnapshot());
    const verdictPos = prompt.indexOf(VERDICT_BLOCKING_RULES);
    expect(verdictPos).toBeGreaterThan(-1);
  });
});
