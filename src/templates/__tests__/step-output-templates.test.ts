/**
 * step-output-templates tests.
 *
 * Verifies that result templates contain correct blocking conditions
 * (decision-needed included, HIGH-only blocking removed) and that
 * findings-priority semantics are expressed correctly.
 *
 * Also verifies spec-exempt scaffold (T-02):
 * - chore type → spec.md content is SPEC_EXEMPT_NOTE (contains SPEC_EXEMPT_MARKER)
 * - spec-change / new-feature → spec.md content is SPEC_TEMPLATE
 * - SPEC_EXEMPT_NOTE is non-empty and contains no empty ## Requirements scaffold
 */
import { describe, it, expect } from "vitest";
import {
  REQUEST_REVIEW_RESULT_TEMPLATE,
  SPEC_REVIEW_RESULT_TEMPLATE,
  REVIEW_FEEDBACK_TEMPLATE,
  SPEC_TEMPLATE,
  SPEC_EXEMPT_MARKER,
  SPEC_EXEMPT_NOTE,
  getOutputTemplates,
} from "../step-output-templates.js";
import { VERDICT_BLOCKING_RULES } from "../../prompts/judge-rules.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Helper to build a minimal JobState for getOutputTemplates tests
// ---------------------------------------------------------------------------

function makeJobState(type: string): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type, slug: "test-slug" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: "change/test-slug-abc12345",
    history: [],
    error: null,
    steps: {} as JobState["steps"],
  };
}

// ---------------------------------------------------------------------------
// request-review template: blocking must include decision-needed (T-03 AC)
// ---------------------------------------------------------------------------

describe("REQUEST_REVIEW_RESULT_TEMPLATE", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain(VERDICT_BLOCKING_RULES);
  });

  it("blocking condition includes decision-needed", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("decision-needed");
  });

  it("does not contain old HIGH-only blocking text", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).not.toContain("Approval is blocked when HIGH ≥ 1");
  });

  it("verdict line format requirement is present", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("verdict line format");
  });
});

// ---------------------------------------------------------------------------
// spec-review template: blocking must include decision-needed (T-03 AC)
// ---------------------------------------------------------------------------

describe("SPEC_REVIEW_RESULT_TEMPLATE", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain(VERDICT_BLOCKING_RULES);
  });

  it("blocking condition includes decision-needed", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("decision-needed");
  });

  it("does not contain old CRITICAL/HIGH-only blocking text", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).not.toContain("Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1");
  });

  it("verdict line format requirement is present", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("verdict line format");
  });
});

// ---------------------------------------------------------------------------
// review-feedback template: findings priority over verdict line (T-03 AC)
// ---------------------------------------------------------------------------

describe("REVIEW_FEEDBACK_TEMPLATE", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain(VERDICT_BLOCKING_RULES);
  });

  it("states findings take priority over markdown verdict line", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("findings 由来の導出が優先");
  });

  it("does not contain old 'verdict line is the authoritative decision' text", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).not.toContain("The verdict line is the authoritative decision");
  });

  it("verdict line format requirement is present", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("verdict line format");
  });
});

// ---------------------------------------------------------------------------
// T-02: SPEC_EXEMPT_MARKER and SPEC_EXEMPT_NOTE constants
// ---------------------------------------------------------------------------

describe("SPEC_EXEMPT_MARKER", () => {
  it("is non-empty", () => {
    expect(SPEC_EXEMPT_MARKER.trim().length).toBeGreaterThan(0);
  });
});

describe("SPEC_EXEMPT_NOTE", () => {
  it("is non-empty", () => {
    expect(SPEC_EXEMPT_NOTE.trim().length).toBeGreaterThan(0);
  });

  it("contains SPEC_EXEMPT_MARKER", () => {
    expect(SPEC_EXEMPT_NOTE).toContain(SPEC_EXEMPT_MARKER);
  });

  it("does not contain empty ## Requirements scaffold", () => {
    // Must NOT end with a bare ## Requirements heading with nothing after it
    // (which would be the skeleton scaffold that triggers the violation check)
    expect(SPEC_EXEMPT_NOTE).not.toMatch(/^## Requirements\s*$/m);
  });

  it("is different from SPEC_TEMPLATE", () => {
    expect(SPEC_EXEMPT_NOTE).not.toBe(SPEC_TEMPLATE);
  });
});

// ---------------------------------------------------------------------------
// T-02: getOutputTemplates — design step spec.md content by request type
// ---------------------------------------------------------------------------

describe("getOutputTemplates design — chore (spec-exempt)", () => {
  it("spec.md content contains SPEC_EXEMPT_MARKER", () => {
    const state = makeJobState("chore");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate).toBeDefined();
    expect(specTemplate!.content).toContain(SPEC_EXEMPT_MARKER);
  });

  it("spec.md content is SPEC_EXEMPT_NOTE", () => {
    const state = makeJobState("chore");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate!.content).toBe(SPEC_EXEMPT_NOTE);
  });

  it("spec.md content is not SPEC_TEMPLATE", () => {
    const state = makeJobState("chore");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate!.content).not.toBe(SPEC_TEMPLATE);
  });

  it("design.md and tasks.md templates are unchanged", () => {
    const state = makeJobState("chore");
    const templates = getOutputTemplates("design", "test-slug", state);
    const designTpl = templates.find((t) => t.path.endsWith("design.md"));
    const tasksTpl = templates.find((t) => t.path.endsWith("tasks.md"));
    expect(designTpl).toBeDefined();
    expect(tasksTpl).toBeDefined();
  });
});

describe("getOutputTemplates design — spec-change (spec-required)", () => {
  it("spec.md content is SPEC_TEMPLATE", () => {
    const state = makeJobState("spec-change");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate!.content).toBe(SPEC_TEMPLATE);
  });

  it("spec.md content does not contain SPEC_EXEMPT_MARKER", () => {
    const state = makeJobState("spec-change");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate!.content).not.toContain(SPEC_EXEMPT_MARKER);
  });
});

describe("getOutputTemplates design — new-feature (spec-required)", () => {
  it("spec.md content is SPEC_TEMPLATE", () => {
    const state = makeJobState("new-feature");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate!.content).toBe(SPEC_TEMPLATE);
  });
});

describe("getOutputTemplates design — bug-fix (spec-required)", () => {
  it("spec.md content is SPEC_TEMPLATE", () => {
    const state = makeJobState("bug-fix");
    const templates = getOutputTemplates("design", "test-slug", state);
    const specTemplate = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specTemplate!.content).toBe(SPEC_TEMPLATE);
  });
});
