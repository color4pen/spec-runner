/**
 * Unit tests for dynamic context injection in buildMessage functions.
 *
 * TC-DC-005: design buildInitialMessage includes changesList when dynamicContext present
 * TC-DC-006: design buildInitialMessage works without dynamicContext (backward compat)
 * TC-DC-007: implementer buildImplementerInitialMessage includes gitLog and diffStat when dynamicContext present
 * TC-DC-008: implementer buildImplementerInitialMessage works without dynamicContext (backward compat)
 * TC-DC-009: code-review buildCodeReviewInitialMessage includes diffStat when dynamicContext present
 * TC-DC-010: code-review buildCodeReviewInitialMessage works without dynamicContext (backward compat)
 */
import { describe, it, expect } from "vitest";
import { buildInitialMessage } from "../../src/prompts/design-system.js";
import { buildImplementerInitialMessage } from "../../src/core/step/implementer.js";
import { buildCodeReviewInitialMessage } from "../../src/core/step/code-review.js";
import type { DynamicContext } from "../../src/git/dynamic-context.js";
import { reviewFeedbackPath } from "../../src/util/paths.js";

const FULL_CONTEXT: DynamicContext = {
  gitLog: "abc1234 feat: add context injection\ndef5678 fix: typo",
  diffStat: " src/git/dynamic-context.ts | 80 +++\n 1 file changed, 80 insertions(+)",
  changesList: ["dynamic-context-injection", "other-feature"],
};

// ---------------------------------------------------------------------------
// TC-DC-005 & 006: design buildInitialMessage
// ---------------------------------------------------------------------------
describe("TC-DC-005: buildInitialMessage includes repo context when dynamicContext provided", () => {
  it("includes changesList entries in the message", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", FULL_CONTEXT);
    expect(msg).toContain("dynamic-context-injection");
    expect(msg).toContain("other-feature");
  });

  it("includes a Repository Context section header", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", FULL_CONTEXT);
    expect(msg).toContain("Repository Context");
  });

  it("still contains the original message content with slug and branch", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", FULL_CONTEXT);
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("request body");
  });
});

describe("TC-DC-006: buildInitialMessage works without dynamicContext (backward compat)", () => {
  it("returns a valid message when dynamicContext is undefined", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug");
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("request body");
  });

  it("does not include Repository Context section when dynamicContext is undefined", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug");
    expect(msg).not.toContain("Repository Context");
  });

  it("does not include Repository Context when changesList is empty", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
    });
    expect(msg).not.toContain("Repository Context");
  });
});

// ---------------------------------------------------------------------------
// TC-DC-007 & 008: implementer buildImplementerInitialMessage
// ---------------------------------------------------------------------------
describe("TC-DC-007: buildImplementerInitialMessage includes branch context when dynamicContext provided", () => {
  it("includes gitLog in the message", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "request body",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("abc1234");
    expect(msg).toContain("def5678");
  });

  it("includes diffStat in the message", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "request body",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("dynamic-context.ts");
    expect(msg).toContain("80 insertions");
  });

  it("includes a Branch Context section header", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "request body",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("Branch Context");
  });

  it("still contains the original message content", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "original request here",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("original request here");
  });
});

describe("TC-DC-008: buildImplementerInitialMessage works without dynamicContext (backward compat)", () => {
  it("returns a valid message when dynamicContext is undefined", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "request body",
    });
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("request body");
  });

  it("does not include Branch Context when dynamicContext is undefined", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "request body",
    });
    expect(msg).not.toContain("Branch Context");
  });

  it("does not include Branch Context when gitLog and diffStat are empty", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      requestContent: "request body",
      dynamicContext: { gitLog: "", diffStat: "", changesList: [] },
    });
    expect(msg).not.toContain("Branch Context");
  });
});

// ---------------------------------------------------------------------------
// TC-DC-009 & 010: code-review buildCodeReviewInitialMessage
// ---------------------------------------------------------------------------
describe("TC-DC-009: buildCodeReviewInitialMessage includes diffStat when dynamicContext provided", () => {
  it("includes diffStat in the message", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-slug", 1),
      requestContent: "request body",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("dynamic-context.ts");
    expect(msg).toContain("80 insertions");
  });

  it("includes a Branch Context section header", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-slug", 1),
      requestContent: "request body",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("Branch Context");
  });

  it("still contains the original message fields", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-slug", 1),
      requestContent: "original request here",
      dynamicContext: FULL_CONTEXT,
    });
    expect(msg).toContain("my-slug");
    expect(msg).toContain("review-feedback-001.md");
    expect(msg).toContain("original request here");
  });
});

describe("TC-DC-010: buildCodeReviewInitialMessage works without dynamicContext (backward compat)", () => {
  it("returns a valid message when dynamicContext is undefined", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-slug", 1),
      requestContent: "request body",
    });
    expect(msg).toContain("my-slug");
    expect(msg).toContain("review-feedback-001.md");
    expect(msg).toContain("request body");
  });

  it("does not include Branch Context when dynamicContext is undefined", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-slug", 1),
      requestContent: "request body",
    });
    expect(msg).not.toContain("Branch Context");
  });

  it("does not include Branch Context when diffStat is empty", () => {
    const msg = buildCodeReviewInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      iteration: 1,
      findingsPath: reviewFeedbackPath("my-slug", 1),
      requestContent: "request body",
      dynamicContext: { gitLog: "", diffStat: "", changesList: [] },
    });
    expect(msg).not.toContain("Branch Context");
  });
});

