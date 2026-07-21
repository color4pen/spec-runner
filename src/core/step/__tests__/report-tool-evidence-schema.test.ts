/**
 * Tests for evidence field in report tool zodSchemas.
 *
 * Source: tasks.md T-03
 *
 * TC-022: JUDGE / CODE_REVIEW / CONFORMANCE report tool の zodSchema に evidence キーが存在する
 * TC-023: REQUEST_REVIEW_REPORT_TOOL の zodSchema に evidence キーが存在しない
 */
import { describe, it, expect } from "vitest";
import {
  JUDGE_REPORT_TOOL,
  CODE_REVIEW_REPORT_TOOL,
  CONFORMANCE_REPORT_TOOL,
  REQUEST_REVIEW_REPORT_TOOL,
} from "../report-tool.js";

// ---------------------------------------------------------------------------
// TC-022: 3 judge tools have evidence key in zodSchema
// Source: tasks.md T-03
// ---------------------------------------------------------------------------

describe("TC-022: JUDGE / CODE_REVIEW / CONFORMANCE report tool zodSchema has evidence key", () => {
  it("TC-022: JUDGE_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(JUDGE_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-022: CODE_REVIEW_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(CODE_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-022: CONFORMANCE_REPORT_TOOL.zodSchema has 'evidence' key", () => {
    expect(CONFORMANCE_REPORT_TOOL.zodSchema).toHaveProperty("evidence");
  });

  it("TC-022: JUDGE_REPORT_TOOL description mentions 'evidence'", () => {
    expect(JUDGE_REPORT_TOOL.description).toContain("evidence");
  });

  it("TC-022: JUDGE_REPORT_TOOL description mentions 'checked'", () => {
    expect(JUDGE_REPORT_TOOL.description).toContain("checked");
  });

  it("TC-022: CODE_REVIEW_REPORT_TOOL description mentions 'evidence'", () => {
    expect(CODE_REVIEW_REPORT_TOOL.description).toContain("evidence");
  });

  it("TC-022: CONFORMANCE_REPORT_TOOL description mentions 'evidence'", () => {
    expect(CONFORMANCE_REPORT_TOOL.description).toContain("evidence");
  });
});

// ---------------------------------------------------------------------------
// TC-023: REQUEST_REVIEW_REPORT_TOOL zodSchema does NOT have evidence key
// Source: tasks.md T-03
// ---------------------------------------------------------------------------

describe("TC-023: REQUEST_REVIEW_REPORT_TOOL zodSchema does not have evidence key", () => {
  it("TC-023: REQUEST_REVIEW_REPORT_TOOL.zodSchema does not have 'evidence' key", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.zodSchema).not.toHaveProperty("evidence");
  });

  it("TC-023: REQUEST_REVIEW_REPORT_TOOL.zodSchema has 'ok' and 'findings' (unchanged)", () => {
    expect(REQUEST_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("ok");
    expect(REQUEST_REVIEW_REPORT_TOOL.zodSchema).toHaveProperty("findings");
  });
});
