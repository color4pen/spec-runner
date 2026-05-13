/**
 * Unit tests for dynamic context injection in buildMessage functions.
 *
 * TC-DC-005: design buildInitialMessage includes changesList when dynamicContext present
 * TC-DC-006: design buildInitialMessage works without dynamicContext (backward compat)
 * TC-DC-007: implementer buildImplementerInitialMessage includes gitLog and diffStat when dynamicContext present
 * TC-DC-008: implementer buildImplementerInitialMessage works without dynamicContext (backward compat)
 * TC-DC-009: code-review buildCodeReviewInitialMessage includes diffStat when dynamicContext present
 * TC-DC-010: code-review buildCodeReviewInitialMessage works without dynamicContext (backward compat)
 * TC-DC-011: buildInitialMessage includes Baseline Specs table when specIndex is non-empty
 * TC-DC-012: buildInitialMessage omits Baseline Specs table when specIndex is empty
 * TC-DC-013: buildInitialMessage handles both changesList and specIndex simultaneously
 * TC-DC-014: buildInitialMessage handles changesList-only and specIndex-only independently
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
  specIndex: [],
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

  it("does not include Repository Context when changesList and specIndex are empty", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [],
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
      dynamicContext: { gitLog: "", diffStat: "", changesList: [], specIndex: [] },
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
      dynamicContext: { gitLog: "", diffStat: "", changesList: [], specIndex: [] },
    });
    expect(msg).not.toContain("Branch Context");
  });
});

// ---------------------------------------------------------------------------
// TC-DC-011: buildInitialMessage — specIndex が非空の場合に Baseline Specs テーブルが含まれる
// ---------------------------------------------------------------------------
describe("TC-DC-011: buildInitialMessage includes Baseline Specs table when specIndex is non-empty", () => {
  it("includes 'Baseline Specs' section header", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [
        { capability: "cli-commands", purpose: "Define the CLI subcommands", requirementCount: 5 },
        { capability: "propose-session", purpose: "Run a propose session", requirementCount: 7 },
      ],
    });
    expect(msg).toContain("Baseline Specs");
  });

  it("includes capability names from specIndex", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [
        { capability: "cli-commands", purpose: "Define the CLI subcommands", requirementCount: 5 },
        { capability: "propose-session", purpose: "Run a propose session", requirementCount: 7 },
      ],
    });
    expect(msg).toContain("cli-commands");
    expect(msg).toContain("propose-session");
  });

  it("includes requirement counts and purposes", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [
        { capability: "cli-commands", purpose: "Define the CLI subcommands", requirementCount: 5 },
        { capability: "propose-session", purpose: "Run a propose session", requirementCount: 7 },
      ],
    });
    expect(msg).toContain("5");
    expect(msg).toContain("7");
    expect(msg).toContain("Define the CLI subcommands");
  });

  it("includes Repository Context section header", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [
        { capability: "foo", purpose: "Foo purpose", requirementCount: 1 },
      ],
    });
    expect(msg).toContain("Repository Context");
  });
});

// ---------------------------------------------------------------------------
// TC-DC-012: buildInitialMessage — specIndex が空の場合にテーブルが含まれない
// ---------------------------------------------------------------------------
describe("TC-DC-012: buildInitialMessage omits Baseline Specs when specIndex is empty", () => {
  it("does not include Baseline Specs when specIndex is empty and changesList is empty", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [],
    });
    expect(msg).not.toContain("Baseline Specs");
    expect(msg).not.toContain("Repository Context");
  });
});

// ---------------------------------------------------------------------------
// TC-DC-013: buildInitialMessage — changesList と specIndex の両方を同時に処理
// ---------------------------------------------------------------------------
describe("TC-DC-013: buildInitialMessage handles both changesList and specIndex simultaneously", () => {
  it("includes both changesList entries and specIndex table", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "abc123 feat: something",
      diffStat: "1 file changed",
      changesList: ["existing-feature"],
      specIndex: [{ capability: "foo-cap", purpose: "Foo purpose", requirementCount: 3 }],
    });
    expect(msg).toContain("existing-feature");
    expect(msg).toContain("foo-cap");
    expect(msg).toContain("Repository Context");
    expect(msg).toContain("Baseline Specs");
  });
});

// ---------------------------------------------------------------------------
// TC-DC-014: buildInitialMessage — changesList のみ・specIndex のみの独立した条件分岐
// ---------------------------------------------------------------------------
describe("TC-DC-014: buildInitialMessage handles changesList-only and specIndex-only independently", () => {
  it("[Subcase A] changesList only — includes changesList, omits Baseline Specs", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: ["some-feature"],
      specIndex: [],
    });
    expect(msg).toContain("some-feature");
    expect(msg).not.toContain("Baseline Specs");
  });

  it("[Subcase B] specIndex only — includes Baseline Specs, omits changesList section", () => {
    const msg = buildInitialMessage("request body", "my-slug", "feat/my-slug", {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [{ capability: "bar", purpose: "Bar purpose", requirementCount: 2 }],
    });
    expect(msg).toContain("bar");
    expect(msg).toContain("Baseline Specs");
    expect(msg).not.toContain("Active Changes");
  });
});
