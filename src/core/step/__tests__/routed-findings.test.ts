/**
 * TC-005 / TC-009-branch / TC-010-branch: collectRoutedFixerFindings
 *
 * Tests that `collectRoutedFixerFindings` correctly mirrors code-fixer.buildMessage
 * routing precedence and returns the finding target paths from the correct source:
 *   1. conformance branch  (branch 1)
 *   2. coordinator-loop    (branch 2)
 *   3. active reviewer     (branch 3, default)
 *
 * Source: spec.md > Requirement: 免除集合は「当該 fixer run に routing された findings」から機械的に導出される
 */

import { describe, it, expect } from "vitest";
// TC-005 / TC-009-branch / TC-010-branch: imports from the new module (red until T-01 implemented)
import { collectRoutedFixerFindings } from "../routed-findings.js";
import type { JobState } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import { STEP_NAMES } from "../step-names.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../../pipeline/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseState(): JobState {
  return {
    version: 2,
    jobId: "routed-findings-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "code-fixer",
    status: "running",
    branch: "feat/example-abc12345",
    history: [],
    error: null,
    steps: {},
  };
}

/** Creates state where active reviewer (code-review) has findings for the given files. */
function makeStateWithActiveReviewerFindings(files: string[]): JobState {
  return {
    ...makeBaseState(),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: files.map((f) => ({
                severity: "high",
                resolution: "fixable",
                file: f,
                title: "T",
                rationale: "R",
              })),
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/** Creates state where conformance is the active trigger for code-fixer. */
function makeStateWithConformanceFindings(findingFiles: string[]): JobState {
  return {
    ...makeBaseState(),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "low",
                  resolution: "fixable",
                  file: "src/foo.ts",
                  title: "T",
                  rationale: "R",
                },
              ],
            },
          },
        },
      ],
      [STEP_NAMES.CONFORMANCE]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:05:00Z",
          endedAt: "2026-01-01T00:05:30Z",
          outcome: {
            verdict: "needs-fix:code-fixer",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: findingFiles.map((f) => ({
                severity: "high",
                resolution: "fixable",
                file: f,
                title: "T",
                rationale: "R",
              })),
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/** Creates state where coordinator-loop is active and a custom reviewer has findings. */
function makeStateWithCoordinatorLoopFindings(
  reviewerName: string,
  findingFiles: string[],
): JobState {
  return {
    ...makeBaseState(),
    reviewers: [
      {
        name: reviewerName,
        maxIterations: 3,
        purpose: "test reviewer",
        criteria: "criteria",
        judgment: "judgment",
        freeText: "",
      },
    ],
    steps: {
      // coordinator has run with needs-fix
      [CUSTOM_REVIEWERS_STEP_NAME]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:02:00Z",
          endedAt: "2026-01-01T00:02:30Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
      // custom reviewer step has needs-fix finding
      [reviewerName]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:02:05Z",
          endedAt: "2026-01-01T00:02:25Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: findingFiles.map((f) => ({
                severity: "high",
                resolution: "fixable",
                file: f,
                title: "T",
                rationale: "R",
              })),
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

// ---------------------------------------------------------------------------
// TC-005: active reviewer branch — findings are included in the derived target set
// ---------------------------------------------------------------------------

describe("collectRoutedFixerFindings — branch 3: active reviewer", () => {
  // TC-005: 導出は active reviewer の finding を含む
  // Source: spec.md > Requirement: 免除集合は「当該 fixer run に routing された findings」から機械的に導出される
  //         > Scenario: 導出は active reviewer の finding を含む
  it("TC-005: active reviewer findings for files A and B are returned in the derived set", () => {
    const state = makeStateWithActiveReviewerFindings([
      "specrunner/changes/example/implementation-notes.md",
      "src/core/step/executor.ts",
    ]);
    const findings: Finding[] = collectRoutedFixerFindings(state);
    const files = findings.map((f) => f.file);
    expect(files).toContain("specrunner/changes/example/implementation-notes.md");
    expect(files).toContain("src/core/step/executor.ts");
  });

  it("TC-005 extended: returns empty array when active reviewer has no runs", () => {
    const state = makeBaseState(); // no code-review runs
    const findings: Finding[] = collectRoutedFixerFindings(state);
    expect(findings).toEqual([]);
  });

  it("TC-005 extended: only fixable findings are included", () => {
    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:01:00Z",
            endedAt: "2026-01-01T00:01:30Z",
            outcome: {
              verdict: "needs-fix",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [
                  { severity: "high", resolution: "fixable", file: "src/a.ts", title: "A", rationale: "R" },
                  { severity: "low", resolution: "informational", file: "src/b.ts", title: "B", rationale: "R" },
                ],
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    const findings: Finding[] = collectRoutedFixerFindings(state);
    const files = findings.map((f) => f.file);
    // informational is not fixable — only "src/a.ts" (fixable) should be included
    expect(files).toContain("src/a.ts");
    expect(files).not.toContain("src/b.ts");
  });
});

// ---------------------------------------------------------------------------
// conformance branch (branch 1) — TC-009 unit-level branch verification
// ---------------------------------------------------------------------------

describe("collectRoutedFixerFindings — branch 1: conformance", () => {
  it("returns conformance findings when conformance is the active trigger", () => {
    const state = makeStateWithConformanceFindings([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const findings: Finding[] = collectRoutedFixerFindings(state);
    const files = findings.map((f) => f.file);
    expect(files).toContain("specrunner/changes/example/implementation-notes.md");
  });

  it("does NOT include active reviewer findings when conformance takes precedence", () => {
    const state = makeStateWithConformanceFindings([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    // Code-review finding is "src/foo.ts", conformance finding is "implementation-notes.md"
    const findings: Finding[] = collectRoutedFixerFindings(state);
    const files = findings.map((f) => f.file);
    // conformance wins; code-review finding (src/foo.ts) should NOT be returned
    expect(files).not.toContain("src/foo.ts");
    expect(files).toContain("specrunner/changes/example/implementation-notes.md");
  });
});

// ---------------------------------------------------------------------------
// coordinator-loop branch (branch 2) — TC-010 unit-level branch verification
// ---------------------------------------------------------------------------

describe("collectRoutedFixerFindings — branch 2: coordinator-loop", () => {
  it("returns coordinator findings when coordinator-loop is active", () => {
    const state = makeStateWithCoordinatorLoopFindings("doc-reviewer", [
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const findings: Finding[] = collectRoutedFixerFindings(state);
    const files = findings.map((f) => f.file);
    expect(files).toContain("specrunner/changes/example/implementation-notes.md");
  });

  it("coordinator-loop: returns empty when coordinator has no needs-fix members", () => {
    const state: JobState = {
      ...makeBaseState(),
      reviewers: [
        {
          name: "doc-reviewer",
          maxIterations: 3,
          purpose: "p",
          criteria: "c",
          judgment: "j",
          freeText: "",
        },
      ],
      steps: {
        [CUSTOM_REVIEWERS_STEP_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:02:00Z",
            endedAt: "2026-01-01T00:02:30Z",
            outcome: {
              verdict: "needs-fix",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] },
            },
          },
        ],
        // doc-reviewer step has "approved" verdict (not needs-fix)
        "doc-reviewer": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:02:05Z",
            endedAt: "2026-01-01T00:02:25Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    const findings: Finding[] = collectRoutedFixerFindings(state);
    expect(findings).toEqual([]);
  });
});
