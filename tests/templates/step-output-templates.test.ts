/**
 * Unit tests for src/templates/step-output-templates.ts
 *
 * TC-T001: getOutputTemplates returns correct list for each agent step
 * TC-T002: iteration numbers reflect prior step runs
 * TC-T003: steps without templates return empty array
 * TC-T004: delta-spec-template.md has cleanup: true in design step
 * TC-T005: template constants contain HTML comment format constraints
 */
import { describe, it, expect } from "vitest";
import {
  getOutputTemplates,
  SPEC_REVIEW_RESULT_TEMPLATE,
  REVIEW_FEEDBACK_TEMPLATE,
  TEST_CASES_TEMPLATE,
  DESIGN_TEMPLATE,
  TASKS_TEMPLATE,
  SPEC_TEMPLATE,
} from "../../src/templates/step-output-templates.js";
import type { JobState } from "../../src/state/schema.js";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "my-slug" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-T001: getOutputTemplates returns correct list for each agent step
// ---------------------------------------------------------------------------
describe("TC-T001: getOutputTemplates returns correct list per step", () => {
  it("design step returns design.md, tasks.md, spec.md", () => {
    const state = makeState();
    const templates = getOutputTemplates("design", "my-slug", state);
    expect(templates).toHaveLength(3);
    const paths = templates.map((t) => t.path);
    expect(paths).toContain("specrunner/changes/my-slug/design.md");
    expect(paths).toContain("specrunner/changes/my-slug/tasks.md");
    expect(paths).toContain("specrunner/changes/my-slug/spec.md");
  });

  it("spec-review step returns spec-review-result-001.md for first iteration", () => {
    const state = makeState();
    const templates = getOutputTemplates("spec-review", "my-slug", state);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/spec-review-result-001.md");
  });

  it("test-case-gen step returns test-cases.md", () => {
    const state = makeState();
    const templates = getOutputTemplates("test-case-gen", "my-slug", state);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/test-cases.md");
  });

  it("code-review step returns review-feedback-001.md for first iteration", () => {
    const state = makeState();
    const templates = getOutputTemplates("code-review", "my-slug", state);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/review-feedback-001.md");
  });

  it("conformance step returns conformance-result-001.md for first iteration", () => {
    const state = makeState();
    const templates = getOutputTemplates("conformance", "my-slug", state);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/conformance-result-001.md");
  });
});

// ---------------------------------------------------------------------------
// TC-T002: iteration numbers reflect prior step runs
// ---------------------------------------------------------------------------
describe("TC-T002: iteration numbers based on prior step state", () => {
  it("spec-review iteration 2 when one prior run exists", () => {
    const state = makeState({
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const templates = getOutputTemplates("spec-review", "my-slug", state);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/spec-review-result-002.md");
  });

  it("code-review iteration 3 when two prior runs exist", () => {
    const state = makeState({
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            attempt: 2,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:01:00.000Z",
            endedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
      },
    });
    const templates = getOutputTemplates("code-review", "my-slug", state);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/review-feedback-003.md");
  });

  it("spec-review produces 3-digit zero-padded file name for iteration 10", () => {
    const steps = Array.from({ length: 9 }, (_, i) => ({
      attempt: i + 1,
      sessionId: null,
      outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    }));
    const state = makeState({ steps: { "spec-review": steps } });
    const templates = getOutputTemplates("spec-review", "my-slug", state);
    expect(templates[0]!.path).toBe("specrunner/changes/my-slug/spec-review-result-010.md");
  });
});

// ---------------------------------------------------------------------------
// TC-T003: steps without templates return empty array
// ---------------------------------------------------------------------------
describe("TC-T003: steps without templates return empty array", () => {
  const noTemplateSteps = [
    "spec-fixer",
    "implementer",
    "build-fixer",
    "code-fixer",
    "adr-gen",
    "verification",
    "pr-create",
    "unknown-step",
  ];

  for (const stepName of noTemplateSteps) {
    it(`${stepName} returns empty array`, () => {
      const state = makeState();
      expect(getOutputTemplates(stepName, "my-slug", state)).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-T004: design step templates are all A-group (no cleanup: true)
// ---------------------------------------------------------------------------
describe("TC-T004: design step templates are A-group (no cleanup)", () => {
  it("spec.md does NOT have cleanup: true (A-group)", () => {
    const state = makeState();
    const templates = getOutputTemplates("design", "my-slug", state);
    const specMd = templates.find((t) => t.path.endsWith("spec.md"));
    expect(specMd).toBeDefined();
    expect(specMd!.cleanup).toBeFalsy();
  });

  it("design.md does NOT have cleanup: true (A-group)", () => {
    const state = makeState();
    const templates = getOutputTemplates("design", "my-slug", state);
    const designMd = templates.find((t) => t.path.endsWith("design.md"));
    expect(designMd).toBeDefined();
    expect(designMd!.cleanup).toBeFalsy();
  });

  it("tasks.md does NOT have cleanup: true (A-group)", () => {
    const state = makeState();
    const templates = getOutputTemplates("design", "my-slug", state);
    const tasksMd = templates.find((t) => t.path.endsWith("tasks.md"));
    expect(tasksMd).toBeDefined();
    expect(tasksMd!.cleanup).toBeFalsy();
  });

  it("spec-review-result template does NOT have cleanup: true (A-group)", () => {
    const state = makeState();
    const templates = getOutputTemplates("spec-review", "my-slug", state);
    expect(templates[0]!.cleanup).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// TC-T005: template constants contain HTML comment format constraints
// ---------------------------------------------------------------------------
describe("TC-T005: template constants contain HTML comment format constraints", () => {
  it("SPEC_REVIEW_RESULT_TEMPLATE contains verdict format instruction", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("- **verdict**:");
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("approved");
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("needs-fix");
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("escalation");
  });

  it("SPEC_REVIEW_RESULT_TEMPLATE contains Findings table 6 columns", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("| # | Severity | Category | File | Description | How to Fix |");
  });

  it("SPEC_REVIEW_RESULT_TEMPLATE contains severity values", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("CRITICAL");
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("HIGH");
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("MEDIUM");
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("LOW");
  });

  it("REVIEW_FEEDBACK_TEMPLATE contains verdict and iteration format", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("- **verdict**:");
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("- **iteration**:");
  });

  it("REVIEW_FEEDBACK_TEMPLATE contains Findings table 7 columns (with Fix)", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("| # | Severity | Category | File | Description | How to Fix | Fix |");
  });

  it("REVIEW_FEEDBACK_TEMPLATE contains Scores table", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("| Category | Score | Weight |");
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("correctness");
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("security");
  });

  it("REVIEW_FEEDBACK_TEMPLATE contains total line format", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("- **total**:");
  });

  it("TEST_CASES_TEMPLATE contains TC-NNN format instruction", () => {
    expect(TEST_CASES_TEMPLATE).toContain("TC-{NNN}");
  });

  it("TEST_CASES_TEMPLATE Source field references spec Scenario path format", () => {
    expect(TEST_CASES_TEMPLATE).toContain("spec.md > Requirement: <name> > Scenario: <name>");
  });

  it("TEST_CASES_TEMPLATE contains GIVEN/WHEN/THEN structure", () => {
    expect(TEST_CASES_TEMPLATE).toContain("GIVEN");
    expect(TEST_CASES_TEMPLATE).toContain("WHEN");
    expect(TEST_CASES_TEMPLATE).toContain("THEN");
  });

  it("TEST_CASES_TEMPLATE contains Summary 4 items", () => {
    expect(TEST_CASES_TEMPLATE).toContain("Total");
    expect(TEST_CASES_TEMPLATE).toContain("Automated");
    expect(TEST_CASES_TEMPLATE).toContain("Manual");
    expect(TEST_CASES_TEMPLATE).toContain("Priority");
  });

  it("TEST_CASES_TEMPLATE contains Result YAML keys", () => {
    expect(TEST_CASES_TEMPLATE).toContain("result:");
    expect(TEST_CASES_TEMPLATE).toContain("total:");
    expect(TEST_CASES_TEMPLATE).toContain("automated:");
    expect(TEST_CASES_TEMPLATE).toContain("manual:");
    expect(TEST_CASES_TEMPLATE).toContain("must:");
    expect(TEST_CASES_TEMPLATE).toContain("should:");
    expect(TEST_CASES_TEMPLATE).toContain("could:");
    expect(TEST_CASES_TEMPLATE).toContain("blocked_reasons:");
  });

  it("DESIGN_TEMPLATE contains required section headings", () => {
    expect(DESIGN_TEMPLATE).toContain("Context");
    expect(DESIGN_TEMPLATE).toContain("Goals");
    expect(DESIGN_TEMPLATE).toContain("Decisions");
    expect(DESIGN_TEMPLATE).toContain("Risks");
    expect(DESIGN_TEMPLATE).toContain("Open Questions");
  });

  it("TASKS_TEMPLATE contains T-NN format and checkbox format", () => {
    expect(TASKS_TEMPLATE).toContain("T-NN");
    expect(TASKS_TEMPLATE).toContain("- [ ]");
    expect(TASKS_TEMPLATE).toContain("Acceptance Criteria");
  });

  it("SPEC_TEMPLATE contains ## Requirements section format", () => {
    expect(SPEC_TEMPLATE).toContain("## Requirements");
    expect(SPEC_TEMPLATE).toContain("### Requirement:");
    expect(SPEC_TEMPLATE).toContain("#### Scenario:");
  });

  it("SPEC_TEMPLATE contains SHALL/MUST normative keyword requirement", () => {
    expect(SPEC_TEMPLATE).toContain("SHALL");
    expect(SPEC_TEMPLATE).toContain("MUST");
  });

  it("SPEC_TEMPLATE contains Given/When/Then structure", () => {
    expect(SPEC_TEMPLATE).toContain("Given");
    expect(SPEC_TEMPLATE).toContain("When");
    expect(SPEC_TEMPLATE).toContain("Then");
  });

  it("all templates contain HTML comment markers", () => {
    for (const tpl of [SPEC_REVIEW_RESULT_TEMPLATE, REVIEW_FEEDBACK_TEMPLATE, TEST_CASES_TEMPLATE, DESIGN_TEMPLATE, TASKS_TEMPLATE, SPEC_TEMPLATE]) {
      expect(tpl).toContain("<!--");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-004: TEST_CASES_TEMPLATE contains mixed format rule
// Source: specs/test-case-generator/spec.md > Requirement: TEST_CASES_TEMPLATE のコメントに混在形式を明記しなければならない > Scenario: テンプレートコメントに混在形式が記載されている
// ---------------------------------------------------------------------------
describe("TC-004: TEST_CASES_TEMPLATE mixed format documentation", () => {
  it("documents that Scenario-derived TCs omit GWT (Source reference only)", () => {
    expect(TEST_CASES_TEMPLATE).toContain("Scenario 由来 TC");
    expect(TEST_CASES_TEMPLATE).toContain("GWT は記述しない");
  });

  it("documents that non-Scenario-derived TCs must include GWT", () => {
    expect(TEST_CASES_TEMPLATE).toContain("非 Scenario 由来 TC");
    expect(TEST_CASES_TEMPLATE).toContain("GWT は必須");
  });

  it("mixed format label is present in the HTML comment", () => {
    expect(TEST_CASES_TEMPLATE).toContain("mixed format");
  });

  it("Source reference format for Scenario-derived TCs is shown", () => {
    expect(TEST_CASES_TEMPLATE).toContain("spec.md > Requirement: <name> > Scenario: <name>");
  });
});

// ---------------------------------------------------------------------------
// path correctness: slug is included in all returned paths
// ---------------------------------------------------------------------------
describe("path correctness", () => {
  it("all returned paths start with specrunner/changes/<slug>", () => {
    const state = makeState();
    const slug = "some-feature";
    const allSteps = ["design", "spec-review", "test-case-gen", "code-review"];
    for (const step of allSteps) {
      const templates = getOutputTemplates(step, slug, state);
      for (const tpl of templates) {
        expect(tpl.path).toMatch(new RegExp(`^specrunner/changes/${slug}/`));
      }
    }
  });
});
