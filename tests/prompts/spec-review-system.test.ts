/**
 * Unit tests for src/prompts/spec-review-system.ts
 *
 * TC-015 (add-spec-review-baseline-check): system prompt contains MODIFIED consistency check instruction
 * TC-016 (add-spec-review-baseline-check): system prompt contains REMOVED consistency check instruction
 * TC-017 (add-spec-review-baseline-check): system prompt contains ADDED consistency check instruction
 * TC-018 (add-spec-review-baseline-check): system prompt indicates to skip check when no baseline
 * TC-019 (add-spec-review-baseline-check): buildSpecReviewInitialMessage includes baseline-specs section when provided
 * TC-020 (add-spec-review-baseline-check): buildSpecReviewInitialMessage omits baseline-specs section when absent
 * TC-021 (add-spec-review-baseline-check): SpecReviewStep.buildMessage passes baselineSpecs from dynamicContext
 * TC-022 (add-spec-review-baseline-check): SpecReviewPromptInput has baselineSpecs field
 * TC-003 (add-spec-review-baseline-check): AgentStep interface has optional enrichContext method
 */
import { describe, it, expect } from "vitest";
import {
  SPEC_REVIEW_SYSTEM_PROMPT,
  buildSpecReviewInitialMessage,
  type SpecReviewPromptInput,
} from "../../src/prompts/spec-review-system.js";
import { SpecReviewStep } from "../../src/core/step/spec-review.js";
import type { AgentStep } from "../../src/core/step/types.js";
import type { DynamicContext } from "../../src/git/dynamic-context.js";

// ---------------------------------------------------------------------------
// TC-003: AgentStep interface has optional enrichContext
// ---------------------------------------------------------------------------
describe("TC-003: AgentStep interface has optional enrichContext", () => {
  it("SpecReviewStep.enrichContext is defined as a function", () => {
    expect(typeof SpecReviewStep.enrichContext).toBe("function");
  });

  it("enrichContext signature accepts dynamicContext, cwd, slug and returns Promise<DynamicContext>", async () => {
    // This test verifies the method is callable with the expected signature.
    // We use a temp directory that has no specs/ subdirectory, so it returns dynamicContext as-is.
    const dynamicContext: DynamicContext = { gitLog: "log", diffStat: "stat", changesList: [], specIndex: [] };
    const result = await SpecReviewStep.enrichContext!(dynamicContext, "/nonexistent-cwd", "test-slug");
    expect(result).toEqual(dynamicContext);
  });
});

// ---------------------------------------------------------------------------
// TC-015: system prompt contains MODIFIED consistency check instruction
// ---------------------------------------------------------------------------
describe("TC-015: spec-review system prompt contains MODIFIED requirement check", () => {
  it("mentions MODIFIED requirements and HIGH severity + consistency category", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("MODIFIED");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("HIGH");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("consistency");
  });

  it("states MODIFIED requirements must exist in baseline", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/MODIFIED.*exist.*baseline|MODIFIED.*baseline.*exist/s);
  });
});

// ---------------------------------------------------------------------------
// TC-016: system prompt contains REMOVED consistency check instruction
// ---------------------------------------------------------------------------
describe("TC-016: spec-review system prompt contains REMOVED requirement check", () => {
  it("mentions REMOVED requirements", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("REMOVED");
  });

  it("states REMOVED requirements must exist in baseline", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/REMOVED.*exist.*baseline|REMOVED.*baseline.*exist/s);
  });
});

// ---------------------------------------------------------------------------
// TC-017: system prompt contains ADDED consistency check instruction
// ---------------------------------------------------------------------------
describe("TC-017: spec-review system prompt contains ADDED requirement check", () => {
  it("mentions ADDED requirements", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("ADDED");
  });

  it("states ADDED requirements must NOT already exist in baseline", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/ADDED.*NOT.*exist|ADDED.*must not.*exist/is);
  });
});

// ---------------------------------------------------------------------------
// TC-018: system prompt skips check when no baseline provided
// ---------------------------------------------------------------------------
describe("TC-018: spec-review system prompt indicates to skip check when no baseline", () => {
  it("contains instruction to skip check when baseline specs are absent", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/no baseline.*skip|skip.*no baseline/is);
  });
});

// ---------------------------------------------------------------------------
// TC-019: buildSpecReviewInitialMessage includes baseline-specs when provided
// ---------------------------------------------------------------------------
describe("TC-019: buildSpecReviewInitialMessage includes baseline-specs section when baselineSpecs provided", () => {
  it("includes <baseline-specs> tag and capability content when baselineSpecs is set", () => {
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
      baselineSpecs: { "my-capability": "## Spec content for my-capability" },
    };

    const message = buildSpecReviewInitialMessage(input);

    expect(message).toContain("<baseline-specs>");
    expect(message).toContain("</baseline-specs>");
    expect(message).toContain("my-capability");
    expect(message).toContain("## Spec content for my-capability");
  });

  it("does not contain {{BASELINE_SPECS}} placeholder in output", () => {
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
      baselineSpecs: { "cap-a": "content-a", "cap-b": "content-b" },
    };

    const message = buildSpecReviewInitialMessage(input);

    expect(message).not.toContain("{{BASELINE_SPECS}}");
    expect(message).toContain("cap-a");
    expect(message).toContain("cap-b");
    expect(message).toContain("content-a");
    expect(message).toContain("content-b");
  });

  it("includes capability sections separated by ---", () => {
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
      baselineSpecs: { "cap-a": "spec-a", "cap-b": "spec-b" },
    };

    const message = buildSpecReviewInitialMessage(input);

    expect(message).toContain("### Capability: cap-a");
    expect(message).toContain("### Capability: cap-b");
    expect(message).toContain("---");
  });
});

// ---------------------------------------------------------------------------
// TC-020: buildSpecReviewInitialMessage omits baseline-specs when absent
// ---------------------------------------------------------------------------
describe("TC-020: buildSpecReviewInitialMessage omits baseline-specs section when baselineSpecs absent or empty", () => {
  it("does not include <baseline-specs> when baselineSpecs is undefined", () => {
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
    };

    const message = buildSpecReviewInitialMessage(input);

    expect(message).not.toContain("<baseline-specs>");
    expect(message).not.toContain("{{BASELINE_SPECS}}");
  });

  it("does not include <baseline-specs> when baselineSpecs is empty object", () => {
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
      baselineSpecs: {},
    };

    const message = buildSpecReviewInitialMessage(input);

    expect(message).not.toContain("<baseline-specs>");
    expect(message).not.toContain("{{BASELINE_SPECS}}");
  });
});

// ---------------------------------------------------------------------------
// TC-021: SpecReviewStep.buildMessage passes baselineSpecs from dynamicContext
// ---------------------------------------------------------------------------
describe("TC-021: SpecReviewStep.buildMessage passes baselineSpecs from dynamicContext", () => {
  it("initial message contains baseline spec content when dynamicContext.baselineSpecs is set", () => {
    const baselineSpecs = { "spec-review-session": "## Baseline spec content" };
    const state = {
      version: 1 as const,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "spec-review" as const,
      status: "running" as const,
      branch: "feat/test",
      history: [],
      error: null,
      steps: {},
    };

    const deps = {
      config: {
        version: 1 as const,
        agents: {},
      },
      slug: "test-slug",
      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },

      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        specIndex: [],
        baselineSpecs,
      },
    };

    const message = SpecReviewStep.buildMessage(state, deps);

    expect(message).toContain("<baseline-specs>");
    expect(message).toContain("spec-review-session");
    expect(message).toContain("## Baseline spec content");
  });

  it("initial message has no baseline section when dynamicContext.baselineSpecs is absent", () => {
    const state = {
      version: 1 as const,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "spec-review" as const,
      status: "running" as const,
      branch: "feat/test",
      history: [],
      error: null,
      steps: {},
    };

    const deps = {
      config: {
        version: 1 as const,
        agents: {},
      },
      slug: "test-slug",
      request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },

      dynamicContext: {
        gitLog: "",
        diffStat: "",
        changesList: [],
        specIndex: [],
        // no baselineSpecs
      },
    };

    const message = SpecReviewStep.buildMessage(state, deps);

    expect(message).not.toContain("<baseline-specs>");
  });
});

// ---------------------------------------------------------------------------
// TC-022: SpecReviewPromptInput has baselineSpecs field
// ---------------------------------------------------------------------------
describe("TC-022: SpecReviewPromptInput has baselineSpecs field", () => {
  it("accepts baselineSpecs as optional Record<string, string>", () => {
    // Type-level check — if this compiles, the field exists.
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
      baselineSpecs: { "my-cap": "spec content" },
    };

    expect(input.baselineSpecs).toBeDefined();
    expect(input.baselineSpecs!["my-cap"]).toBe("spec content");
  });

  it("baselineSpecs is optional (can be omitted)", () => {
    const input: SpecReviewPromptInput = {
      slug: "test-slug",
      requestType: "feature",
    };

    expect(input.baselineSpecs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// enrichContext no-op when specs/ directory absent (TC-010)
// ---------------------------------------------------------------------------
describe("TC-010: SpecReviewStep.enrichContext returns dynamicContext unchanged when specs/ absent", () => {
  it("returns the original dynamicContext when the specs directory does not exist", async () => {
    const dynamicContext: DynamicContext = {
      gitLog: "abc",
      diffStat: "def",
      changesList: ["some-change"],
      specIndex: [],
    };

    // Using a cwd path where specrunner/changes/test-slug/specs/ does not exist
    const result = await SpecReviewStep.enrichContext!(dynamicContext, "/nonexistent-path-xyz", "test-slug");

    expect(result).toEqual(dynamicContext);
    expect(result.baselineSpecs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Delta Spec Presence Check — prompt keyword tests
// ---------------------------------------------------------------------------
describe("Delta Spec Presence Check: system prompt contains presence check instructions", () => {
  it("contains 'Delta Spec Presence Check' section header", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Delta Spec Presence Check");
  });

  it("mentions spec-change and new-feature as types requiring delta specs", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("spec-change");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("new-feature");
  });

  it("specifies HIGH severity for missing delta specs", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/specs\/.*directory.*empty.*missing.*HIGH/s);
  });

  it("instructs to skip check for bug-fix and refactoring types", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("bug-fix");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("refactoring");
  });

  it("mentions this check is independent of dsv", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/independent.*dsv|dsv.*independent/is);
  });
});

// ---------------------------------------------------------------------------
// Structural check: SpecReviewStep satisfies AgentStep interface with enrichContext
// ---------------------------------------------------------------------------
describe("AgentStep interface compliance with enrichContext", () => {
  it("SpecReviewStep satisfies AgentStep with enrichContext as optional method", () => {
    // Type assignment — if this compiles, the interface is satisfied
    const step: AgentStep = SpecReviewStep;
    expect(step.kind).toBe("agent");
    expect(step.name).toBe("spec-review");
    expect(typeof step.enrichContext).toBe("function");
  });
});
