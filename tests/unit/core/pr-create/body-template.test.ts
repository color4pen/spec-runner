/**
 * Unit tests for renderPrTitle and renderPrBody.
 *
 * TC-032: renderPrTitle — request.md の H1 見出しをそのまま返す
 * TC-033: renderPrBody — Summary / Workflow / Test plan / signature を含む
 * TC-034: renderPrBody — 実行されなかった phase を Workflow テーブルから除外する
 */
import { describe, it, expect } from "vitest";
import { renderPrTitle, renderPrBody } from "../../../../src/core/pr-create/body-template.js";
import type { ParsedRequest } from "../../../../src/parser/request-md.js";
import type { JobState } from "../../../../src/state/schema.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "openspec-workflow/requests/active/pr-create-step/request.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create",
    status: "running",
    branch: "feat/pr-create-step",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeParsedRequest(overrides: Partial<ParsedRequest> = {}): ParsedRequest {
  return {
    type: "new-feature",
    title: "pr-create step 追加（self-host pipeline 完成形）",
    slug: "pr-create-step",
    content: "# pr-create step\n\n## Meta\n- **type**: new-feature\n- **slug**: pr-create-step\n",
    enabled: [],
    sections: {
      背景: "これは背景テキストです。",
      目的: "これは目的テキストです。",
    },
    ...overrides,
  };
}

function makeStepRun(verdict: string, attempt: number = 1, findingsPath: string | null = null) {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict: verdict as import("../../../../src/state/schema.js").Verdict, findingsPath, error: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
  };
}

// TC-032: renderPrTitle — request.md の H1 見出しをそのまま返す
describe("TC-032: renderPrTitle — request.md の H1 見出しをそのまま返す", () => {
  it("returns title as-is from parsedRequest.title", () => {
    const parsedRequest = makeParsedRequest();
    const title = renderPrTitle(parsedRequest);
    expect(title).toBe("pr-create step 追加（self-host pipeline 完成形）");
  });
});

// TC-033: renderPrBody — Summary / Workflow / Test plan / signature を含む
describe("TC-033: renderPrBody — Summary / Workflow / Test plan / signature を含む", () => {
  it("includes ## Summary, ## Workflow with phases, ## Test plan, and signature", () => {
    const parsedRequest = makeParsedRequest();
    const jobState = makeMinimalState({
      steps: {
        "spec-review": [makeStepRun("approved", 1, "openspec/changes/pr-create-step/spec-review-result-001.md")],
        "verification": [makeStepRun("passed", 1, "openspec/changes/pr-create-step/verification-result.md")],
        "code-review": [makeStepRun("approved", 1, "openspec/changes/pr-create-step/review-feedback-001.md")],
      },
    });

    const body = renderPrBody({ parsedRequest, jobState, slug: "pr-create-step" });

    // ## Summary section
    expect(body).toContain("## Summary");
    expect(body).toContain("これは背景テキストです。");
    expect(body).toContain("これは目的テキストです。");

    // ## Workflow table with all 3 phases
    expect(body).toContain("## Workflow");
    expect(body).toContain("spec-review");
    expect(body).toContain("verification");
    expect(body).toContain("code-review");

    // ## Test plan with at least one checkbox
    expect(body).toContain("## Test plan");
    expect(body).toContain("- [ ]");

    // Signature
    expect(body.trimEnd().endsWith("🤖 Generated with SpecRunner")).toBe(true);
  });
});

// TC-034: renderPrBody — 実行されなかった phase を Workflow テーブルから除外する
describe("TC-034: renderPrBody — 実行されなかった phase を Workflow テーブルから除外する", () => {
  it("omits code-review from Workflow table when code-review has 0 step runs", () => {
    const parsedRequest = makeParsedRequest();
    const jobState = makeMinimalState({
      steps: {
        "spec-review": [makeStepRun("approved", 1)],
        "verification": [makeStepRun("passed", 1)],
        // code-review intentionally absent
      },
    });

    const body = renderPrBody({ parsedRequest, jobState, slug: "pr-create-step" });

    // The Workflow table should NOT contain code-review
    const workflowSection = body.split("## Workflow")[1]!.split("## Test plan")[0]!;
    expect(workflowSection).not.toContain("code-review");

    // But spec-review and verification should be present
    expect(workflowSection).toContain("spec-review");
    expect(workflowSection).toContain("verification");
  });
});

// Additional: body with no sections (no 背景/目的)
describe("renderPrBody — sections absent", () => {
  it("still produces a valid body when sections are empty", () => {
    const parsedRequest = makeParsedRequest({ sections: {} });
    const jobState = makeMinimalState({ steps: {} });

    const body = renderPrBody({ parsedRequest, jobState, slug: "pr-create-step" });

    expect(body).toContain("## Summary");
    expect(body).toContain("## Workflow");
    expect(body).toContain("## Test plan");
    expect(body.trimEnd().endsWith("🤖 Generated with SpecRunner")).toBe(true);
  });
});
