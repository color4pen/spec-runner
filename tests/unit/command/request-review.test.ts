/**
 * Unit tests for src/core/command/request-review.ts
 *
 * TC-RR-001: parseReviewOutput — valid JSON block → extracts structured result
 * TC-RR-002: parseReviewOutput — no JSON block → fallback needs-discussion
 * TC-RR-003: parseReviewOutput — invalid verdict value → fallback
 * TC-RR-004: parseReviewOutput — multiple JSON blocks → uses last one
 * TC-RR-005: parseReviewOutput — malformed JSON → fallback
 * TC-RR-006: verdictToExitCode — approve → 0
 * TC-RR-007: verdictToExitCode — needs-discussion → 0
 * TC-RR-008: verdictToExitCode — reject → 1
 * TC-RR-009: buildInitialMessage — requestContent wrapped in <request> tags
 * TC-RR-010: buildInitialMessage — projectContext wrapped in <project-context> tags
 */
import { describe, it, expect } from "vitest";
import {
  parseReviewOutput,
  verdictToExitCode,
  buildInitialMessage,
  type RequestReviewResult,
} from "../../../src/core/command/request-review.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/request-review-system.js";

// ---------------------------------------------------------------------------
// TC-RR-001: parseReviewOutput — valid JSON block → extracts structured result
// ---------------------------------------------------------------------------
describe("TC-RR-001: parseReviewOutput with valid JSON block", () => {
  it("extracts verdict, findings, and summary from a valid JSON block", () => {
    const validResult: RequestReviewResult = {
      verdict: "approve",
      findings: [
        { number: 1, severity: "LOW", category: "maintainability", description: "Minor naming inconsistency" },
      ],
      summary: "The request is well-defined and ready for pipeline execution.",
    };

    const text = `
## Findings Summary
| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | LOW | maintainability | Minor naming inconsistency |

## Verdict: approve

The request is well-defined and ready for pipeline execution.

\`\`\`json
${JSON.stringify(validResult, null, 2)}
\`\`\`
`;

    const result = parseReviewOutput(text);
    expect(result.verdict).toBe("approve");
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding?.severity).toBe("LOW");
    expect(finding?.category).toBe("maintainability");
    expect(result.summary).toBe("The request is well-defined and ready for pipeline execution.");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-002: parseReviewOutput — no JSON block → fallback needs-discussion
// ---------------------------------------------------------------------------
describe("TC-RR-002: parseReviewOutput with no JSON block", () => {
  it("returns fallback needs-discussion when no JSON block is present", () => {
    const text = "Some review output without any JSON block.";
    const result = parseReviewOutput(text);

    expect(result.verdict).toBe("needs-discussion");
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding?.severity).toBe("HIGH");
    expect(finding?.category).toBe("parse-error");
    expect(result.summary).toBe(text.slice(0, 500));
  });
});

// ---------------------------------------------------------------------------
// TC-RR-003: parseReviewOutput — invalid verdict value → fallback
// ---------------------------------------------------------------------------
describe("TC-RR-003: parseReviewOutput with invalid verdict value", () => {
  it("returns fallback when verdict is not a valid value", () => {
    const invalidJson = JSON.stringify({
      verdict: "maybe",
      findings: [],
      summary: "invalid",
    });

    const text = `
Some review text.
\`\`\`json
${invalidJson}
\`\`\`
`;

    const result = parseReviewOutput(text);
    expect(result.verdict).toBe("needs-discussion");
    expect(result.findings[0]?.category).toBe("parse-error");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-004: parseReviewOutput — multiple JSON blocks → uses last one
// ---------------------------------------------------------------------------
describe("TC-RR-004: parseReviewOutput uses the last JSON block", () => {
  it("extracts data from the last ```json block when multiple exist", () => {
    const firstResult = { verdict: "reject", findings: [], summary: "first" };
    const lastResult: RequestReviewResult = {
      verdict: "approve",
      findings: [],
      summary: "last",
    };

    const text = `
\`\`\`json
${JSON.stringify(firstResult)}
\`\`\`

Some more text.

\`\`\`json
${JSON.stringify(lastResult)}
\`\`\`
`;

    const result = parseReviewOutput(text);
    expect(result.verdict).toBe("approve");
    expect(result.summary).toBe("last");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-005: parseReviewOutput — malformed JSON → fallback
// ---------------------------------------------------------------------------
describe("TC-RR-005: parseReviewOutput with malformed JSON", () => {
  it("returns fallback when JSON is malformed", () => {
    const text = `
\`\`\`json
{ verdict: approve, findings: [] }
\`\`\`
`;

    const result = parseReviewOutput(text);
    expect(result.verdict).toBe("needs-discussion");
    expect(result.findings[0]?.category).toBe("parse-error");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-006: verdictToExitCode — approve → 0
// ---------------------------------------------------------------------------
describe("TC-RR-006: verdictToExitCode approve", () => {
  it("returns 0 for approve", () => {
    expect(verdictToExitCode("approve")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-RR-007: verdictToExitCode — needs-discussion → 0
// ---------------------------------------------------------------------------
describe("TC-RR-007: verdictToExitCode needs-discussion", () => {
  it("returns 0 for needs-discussion", () => {
    expect(verdictToExitCode("needs-discussion")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-RR-008: verdictToExitCode — reject → 1
// ---------------------------------------------------------------------------
describe("TC-RR-008: verdictToExitCode reject", () => {
  it("returns 1 for reject", () => {
    expect(verdictToExitCode("reject")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-RR-009: buildInitialMessage — requestContent wrapped in <request> tags
// ---------------------------------------------------------------------------
describe("TC-RR-009: buildInitialMessage wraps requestContent in <request> tags", () => {
  it("wraps requestContent with <request> and </request>", () => {
    const requestContent = "# My Request\n\n## Meta\n\n- type: new-feature";
    const projectContext = "Project context info";

    const message = buildInitialMessage(requestContent, projectContext);

    expect(message).toContain("<request>");
    expect(message).toContain("</request>");
    expect(message).toContain(requestContent);

    const requestStart = message.indexOf("<request>");
    const requestEnd = message.indexOf("</request>");
    const contentBetween = message.slice(requestStart + "<request>".length, requestEnd);
    expect(contentBetween).toContain(requestContent);
  });
});

// ---------------------------------------------------------------------------
// TC-RR-010: buildInitialMessage — projectContext wrapped in <project-context> tags
// ---------------------------------------------------------------------------
describe("TC-RR-010: buildInitialMessage wraps projectContext in <project-context> tags", () => {
  it("wraps projectContext with <project-context> and </project-context>", () => {
    const requestContent = "# My Request";
    const projectContext = "## Stack\n\n- Runtime: Bun";

    const message = buildInitialMessage(requestContent, projectContext);

    expect(message).toContain("<project-context>");
    expect(message).toContain("</project-context>");
    expect(message).toContain(projectContext);

    const ctxStart = message.indexOf("<project-context>");
    const ctxEnd = message.indexOf("</project-context>");
    const contentBetween = message.slice(ctxStart + "<project-context>".length, ctxEnd);
    expect(contentBetween).toContain(projectContext);
  });

  it("handles empty projectContext gracefully", () => {
    const message = buildInitialMessage("# Request", "");

    expect(message).toContain("<project-context>");
    expect(message).toContain("</project-context>");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-011: REQUEST_REVIEW_SYSTEM_PROMPT — contains authority path intent detection rule
// ---------------------------------------------------------------------------
describe("TC-RR-011: REQUEST_REVIEW_SYSTEM_PROMPT contains authority path intent detection rule", () => {
  it("includes intent-based authority path HIGH finding detection rule", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Authority path intent");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("specrunner/specs/");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("HIGH severity finding");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-012: REQUEST_REVIEW_SYSTEM_PROMPT — contains referential exclusion clause
// ---------------------------------------------------------------------------
describe("TC-RR-012: REQUEST_REVIEW_SYSTEM_PROMPT contains referential exclusion clause", () => {
  it("includes exclusion for referential/policy references from HIGH finding", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("policy statement");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("NOT a HIGH finding");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-013: REQUEST_REVIEW_SYSTEM_PROMPT — intent 3-category classification and no verb enumeration
// ---------------------------------------------------------------------------
describe("TC-RR-013: REQUEST_REVIEW_SYSTEM_PROMPT intent-based detection covers 3 categories without verb enumeration", () => {
  it("contains 3-category intent classification for authority path references", () => {
    // Covers observation cases: line-number rewrites, arrow notation, grep commands, completeness
    // demands — all are caught by agent intent judgment rather than pattern matching
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Reference/mention");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Design reflection");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Direct operation");
  });

  it("does not contain specific edit verb enumeration in detection rule", () => {
    // Abstraction verified: no patchwork verb listing
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).not.toContain("MODIFIED, ADDED");
  });
});

// ---------------------------------------------------------------------------
// TC-RR-014: REQUEST_REVIEW_SYSTEM_PROMPT — HIGH finding recommendation guidance
// ---------------------------------------------------------------------------
describe("TC-RR-014: REQUEST_REVIEW_SYSTEM_PROMPT contains spec-merge / read-only / delta spec recommendation", () => {
  it("contains spec-merge, read-only within the PR, and delta spec guidance in recommendation", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("spec-merge");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("read-only within the PR");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("delta spec");
  });
});

