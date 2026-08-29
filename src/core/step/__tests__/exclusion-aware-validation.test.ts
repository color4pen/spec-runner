/**
 * Unit tests for exclusion-aware validation and delivery exclusions block injection.
 *
 * Covers:
 *   TC-009 (must):   design 初期メッセージに delivery exclusions block が注入される
 *   TC-010 (must):   stagingExcludePatterns が未設定の場合 delivery exclusions block は含まれない
 *   TC-017 (must):   buildDeliveryExclusionsBlock — 空 patterns で空文字列を返す
 *   TC-018 (must):   buildDeliveryExclusionsBlock — 非空 patterns で markdown ブロックを生成する
 *   TC-019 (must):   code-review メッセージに delivery exclusions block が注入される
 *   TC-020 (must):   conformance メッセージに delivery exclusions block が注入される
 *   TC-021 (should): custom-reviewer メッセージに delivery exclusions block が注入される
 */

import { describe, it, expect } from "vitest";
import { buildDeliveryExclusionsBlock } from "../staging-containment.js";
import { buildInitialMessage } from "../../../prompts/design-system.js";
import { buildCodeReviewInitialMessage } from "../code-review.js";
import { DesignStep } from "../design.js";
import { CodeReviewStep } from "../code-review.js";
import { ConformanceStep } from "../conformance.js";
import { buildCustomReviewerMessage } from "../custom-reviewer.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../../port/step-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "test-slug";
const BRANCH = "feat/test-slug";

function makeBaseJobState(stepName = "design"): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: stepName as never,
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
    synthesizedCommits: [],
  };
}

function makeDeps(stagingExcludePatterns?: string[]): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      ...(stagingExcludePatterns && stagingExcludePatterns.length > 0
        ? { pipeline: { stagingExcludePatterns } }
        : {}),
    } as never,
    slug: SLUG,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "This is the test request content.",
      adr: false,
      path: `specrunner/changes/${SLUG}/request.md`,
    },
    dynamicContext: undefined,
  } as unknown as StepDeps;
}

// ---------------------------------------------------------------------------
// TC-017: buildDeliveryExclusionsBlock — 空 patterns で空文字列を返す
// ---------------------------------------------------------------------------

describe("TC-017: buildDeliveryExclusionsBlock returns empty string for empty patterns", () => {
  it("TC-017: empty patterns → empty string", () => {
    expect(buildDeliveryExclusionsBlock([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-018: buildDeliveryExclusionsBlock — 非空 patterns で markdown ブロックを生成する
// ---------------------------------------------------------------------------

describe("TC-018: buildDeliveryExclusionsBlock returns markdown block for non-empty patterns", () => {
  it("TC-018: non-empty patterns → contains '## Delivery exclusions' header", () => {
    const result = buildDeliveryExclusionsBlock([".github/workflows/**"]);
    expect(result).toContain("## Delivery exclusions");
  });

  it("TC-018b: patterns are listed as bullet items", () => {
    const result = buildDeliveryExclusionsBlock([".github/workflows/**", "vendor/**"]);
    expect(result).toContain("- .github/workflows/**");
    expect(result).toContain("- vendor/**");
  });

  it("TC-018c: block contains 'must not be required in the synthesized commits'", () => {
    const result = buildDeliveryExclusionsBlock([".github/workflows/**"]);
    expect(result).toContain("must not be required in the synthesized commits");
  });
});

// ---------------------------------------------------------------------------
// TC-009: design 初期メッセージに delivery exclusions block が注入される
// ---------------------------------------------------------------------------

describe("TC-009: design initial message contains delivery exclusions block when configured", () => {
  it("TC-009: buildInitialMessage with deliveryExclusionsBlock → contains '## Delivery exclusions'", () => {
    const exclusionsBlock = buildDeliveryExclusionsBlock([".github/workflows/**"]);
    const message = buildInitialMessage(
      "Test request content",
      SLUG,
      BRANCH,
      undefined,
      "bug-fix",
      undefined,
      exclusionsBlock,
    );

    expect(message).toContain("## Delivery exclusions");
    expect(message).toContain("- .github/workflows/**");
  });

  it("TC-009b: DesignStep.buildMessage with stagingExcludePatterns → message contains delivery exclusions", () => {
    const state = makeBaseJobState("design");
    const deps = makeDeps([".github/workflows/**"]);
    const message = DesignStep.buildMessage(state, deps);

    expect(message).toContain("## Delivery exclusions");
    expect(message).toContain("- .github/workflows/**");
  });
});

// ---------------------------------------------------------------------------
// TC-010: stagingExcludePatterns が未設定の場合 delivery exclusions block は含まれない
// ---------------------------------------------------------------------------

describe("TC-010: delivery exclusions block absent when stagingExcludePatterns is not set", () => {
  it("TC-010: buildInitialMessage without deliveryExclusionsBlock → no '## Delivery exclusions'", () => {
    const message = buildInitialMessage(
      "Test request content",
      SLUG,
      BRANCH,
      undefined,
      "bug-fix",
      undefined,
      undefined, // no exclusions
    );
    expect(message).not.toContain("## Delivery exclusions");
  });

  it("TC-010b: DesignStep.buildMessage without stagingExcludePatterns → no delivery exclusions", () => {
    const state = makeBaseJobState("design");
    const deps = makeDeps(); // no stagingExcludePatterns
    const message = DesignStep.buildMessage(state, deps);

    expect(message).not.toContain("## Delivery exclusions");
  });
});

// ---------------------------------------------------------------------------
// TC-019: code-review メッセージに delivery exclusions block が注入される
// ---------------------------------------------------------------------------

describe("TC-019: code-review message contains delivery exclusions block when configured", () => {
  it("TC-019: buildCodeReviewInitialMessage with deliveryExclusionsBlock → '## Delivery exclusions'", () => {
    const exclusionsBlock = buildDeliveryExclusionsBlock([".github/workflows/**"]);
    const message = buildCodeReviewInitialMessage({
      slug: SLUG,
      branch: BRANCH,
      iteration: 1,
      findingsPath: `specrunner/changes/${SLUG}/review-feedback-001.md`,
      requestContent: "Test request content",
      deliveryExclusionsBlock: exclusionsBlock,
    });

    expect(message).toContain("## Delivery exclusions");
    expect(message).toContain("- .github/workflows/**");
  });

  it("TC-019b: CodeReviewStep.buildMessage with stagingExcludePatterns → message contains delivery exclusions", () => {
    const state = makeBaseJobState("code-review");
    const deps = makeDeps([".github/workflows/**"]);
    const message = CodeReviewStep.buildMessage(state, deps);

    expect(message).toContain("## Delivery exclusions");
    expect(message).toContain("- .github/workflows/**");
  });

  it("TC-019c: CodeReviewStep.buildMessage without stagingExcludePatterns → no delivery exclusions", () => {
    const state = makeBaseJobState("code-review");
    const deps = makeDeps(); // no stagingExcludePatterns
    const message = CodeReviewStep.buildMessage(state, deps);

    expect(message).not.toContain("## Delivery exclusions");
  });
});

// ---------------------------------------------------------------------------
// TC-020: conformance メッセージに delivery exclusions block が注入される
// ---------------------------------------------------------------------------

describe("TC-020: conformance message contains delivery exclusions block when configured", () => {
  it("TC-020: ConformanceStep.buildMessage with stagingExcludePatterns → '## Delivery exclusions'", () => {
    const state = makeBaseJobState("conformance");
    const deps = makeDeps([".github/workflows/**"]);
    const message = ConformanceStep.buildMessage(state, deps);

    expect(message).toContain("## Delivery exclusions");
    expect(message).toContain("- .github/workflows/**");
  });

  it("TC-020b: ConformanceStep.buildMessage without stagingExcludePatterns → no delivery exclusions", () => {
    const state = makeBaseJobState("conformance");
    const deps = makeDeps(); // no stagingExcludePatterns
    const message = ConformanceStep.buildMessage(state, deps);

    expect(message).not.toContain("## Delivery exclusions");
  });
});

// ---------------------------------------------------------------------------
// TC-021: custom-reviewer メッセージに delivery exclusions block が注入される
// ---------------------------------------------------------------------------

describe("TC-021: custom-reviewer message contains delivery exclusions block when configured", () => {
  it("TC-021: buildCustomReviewerMessage with deliveryExclusionsBlock → '## Delivery exclusions'", () => {
    const exclusionsBlock = buildDeliveryExclusionsBlock([".github/workflows/**"]);
    const message = buildCustomReviewerMessage({
      slug: SLUG,
      reviewerName: "security-reviewer",
      purpose: "Security review",
      iteration: 1,
      resultFilePath: `specrunner/changes/${SLUG}/security-reviewer-result-001.md`,
      requestContent: "Test request content",
      deliveryExclusionsBlock: exclusionsBlock,
    });

    expect(message).toContain("## Delivery exclusions");
    expect(message).toContain("- .github/workflows/**");
  });

  it("TC-021b: buildCustomReviewerMessage without deliveryExclusionsBlock → no delivery exclusions", () => {
    const message = buildCustomReviewerMessage({
      slug: SLUG,
      reviewerName: "security-reviewer",
      purpose: "Security review",
      iteration: 1,
      resultFilePath: `specrunner/changes/${SLUG}/security-reviewer-result-001.md`,
      requestContent: "Test request content",
      // no deliveryExclusionsBlock
    });

    expect(message).not.toContain("## Delivery exclusions");
  });
});
