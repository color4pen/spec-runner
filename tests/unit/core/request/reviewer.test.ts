/**
 * Unit tests for src/core/request/reviewer.ts
 *
 * TC-RVR-001: parseReviewOutput — valid JSON block → extracts structured result
 * TC-RVR-002: parseReviewOutput — no JSON block → fallback needs-discussion
 * TC-RVR-003: parseReviewOutput — invalid verdict value → fallback
 * TC-RVR-004: parseReviewOutput — multiple JSON blocks → uses last one
 * TC-RVR-005: parseReviewOutput — malformed JSON → fallback
 * TC-RVR-006: verdictToExitCode — approve → 0
 * TC-RVR-007: verdictToExitCode — needs-discussion → 0
 * TC-RVR-008: verdictToExitCode — reject → 1
 * TC-RVR-009: buildInitialMessage — requestContent wrapped in <request> tags
 * TC-RVR-010: buildInitialMessage — projectContext wrapped in <project-context> tags
 * TC-RVR-011: runReview() with mock queryFn returns RequestReviewResult
 */
import { describe, it, expect } from "vitest";
import {
  parseReviewOutput,
  verdictToExitCode,
  buildInitialMessage,
  runReview,
  type RequestReviewResult,
} from "../../../../src/core/request/reviewer.js";

// ---------------------------------------------------------------------------
// TC-RVR-001
// ---------------------------------------------------------------------------
describe("TC-RVR-001: parseReviewOutput with valid JSON block", () => {
  it("extracts verdict, findings, and summary from a valid JSON block", () => {
    const validResult: RequestReviewResult = {
      verdict: "approve",
      findings: [
        { severity: "LOW", category: "maintainability", description: "Minor naming inconsistency" },
      ],
      summary: "The request is well-defined and ready for pipeline execution.",
    };

    const text = `
## Findings Summary

\`\`\`json
${JSON.stringify(validResult, null, 2)}
\`\`\`
`;

    const result = parseReviewOutput(text);
    expect(result.verdict).toBe("approve");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("LOW");
    expect(result.findings[0]?.category).toBe("maintainability");
    expect(result.summary).toBe("The request is well-defined and ready for pipeline execution.");
  });
});

// ---------------------------------------------------------------------------
// TC-RVR-002
// ---------------------------------------------------------------------------
describe("TC-RVR-002: parseReviewOutput with no JSON block", () => {
  it("returns fallback needs-discussion when no JSON block is present", () => {
    const text = "Some review output without any JSON block.";
    const result = parseReviewOutput(text);

    expect(result.verdict).toBe("needs-discussion");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("HIGH");
    expect(result.findings[0]?.category).toBe("parse-error");
    expect(result.summary).toBe(text.slice(0, 500));
  });
});

// ---------------------------------------------------------------------------
// TC-RVR-003
// ---------------------------------------------------------------------------
describe("TC-RVR-003: parseReviewOutput with invalid verdict value", () => {
  it("returns fallback when verdict is not a valid value", () => {
    const invalidJson = JSON.stringify({ verdict: "maybe", findings: [], summary: "invalid" });

    const text = `
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
// TC-RVR-004
// ---------------------------------------------------------------------------
describe("TC-RVR-004: parseReviewOutput uses the last JSON block", () => {
  it("extracts data from the last ```json block when multiple exist", () => {
    const firstResult = { verdict: "reject", findings: [], summary: "first" };
    const lastResult: RequestReviewResult = { verdict: "approve", findings: [], summary: "last" };

    const text = `
\`\`\`json
${JSON.stringify(firstResult)}
\`\`\`

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
// TC-RVR-005
// ---------------------------------------------------------------------------
describe("TC-RVR-005: parseReviewOutput with malformed JSON", () => {
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
// TC-RVR-006
// ---------------------------------------------------------------------------
describe("TC-RVR-006: verdictToExitCode approve", () => {
  it("returns 0 for approve", () => {
    expect(verdictToExitCode("approve")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-RVR-007
// ---------------------------------------------------------------------------
describe("TC-RVR-007: verdictToExitCode needs-discussion", () => {
  it("returns 0 for needs-discussion", () => {
    expect(verdictToExitCode("needs-discussion")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-RVR-008
// ---------------------------------------------------------------------------
describe("TC-RVR-008: verdictToExitCode reject", () => {
  it("returns 1 for reject", () => {
    expect(verdictToExitCode("reject")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-RVR-009
// ---------------------------------------------------------------------------
describe("TC-RVR-009: buildInitialMessage wraps requestContent in <request> tags", () => {
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
// TC-RVR-010
// ---------------------------------------------------------------------------
describe("TC-RVR-010: buildInitialMessage wraps projectContext in <project-context> tags", () => {
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
// TC-RVR-011
// ---------------------------------------------------------------------------
describe("TC-RVR-011: runReview() with mock queryFn returns RequestReviewResult", () => {
  it("returns parsed RequestReviewResult from mock query", async () => {
    const approveResult: RequestReviewResult = {
      verdict: "approve",
      findings: [],
      summary: "looks good",
    };

    const mockResultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      result: `\`\`\`json\n${JSON.stringify(approveResult)}\n\`\`\``,
    };

    async function* mockQueryFn(_args: unknown): AsyncGenerator<typeof mockResultMessage, void> {
      yield mockResultMessage;
    }

    // Use a temp dir to avoid reading project.md
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmpDir = await mkdtemp(join(tmpdir(), "reviewer-test-"));

    try {
      const result = await runReview(
        "# Test Request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: test-slug\n- **base-branch**: main\n",
        {} as import("../../../../src/config/schema.js").SpecRunnerConfig,
        tmpDir,
        mockQueryFn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
      );

      expect(result.verdict).toBe("approve");
      expect(result.findings).toEqual([]);
      expect(result.summary).toBe("looks good");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
