/**
 * Unit tests for src/prompts/request-review-system.ts
 *
 * TC-RR-001: Code assertion fact-check step is present
 * TC-RR-002: Severity high includes code assertion mismatch
 * TC-RR-003: Fact-check target and out-of-scope are defined
 * TC-RR-004: Existing read-only constraint and verdict logic are preserved
 */
import { describe, it, expect } from "vitest";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/request-review-system.js";

describe("TC-RR-001: code assertion fact-check step is present", () => {
  it("contains a fact-check step in the Review Process", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Code Assertion Fact-Check");
  });

  it("instructs to scan the entire request, not only the dedicated section", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/entire request|全体が対象/i);
  });

  it("references Read, Grep, Glob tools for fact-checking", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Read");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Grep");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("Glob");
  });
});

describe("TC-RR-002: severity high includes code assertion mismatch", () => {
  it("HIGH severity definition includes code assertion mismatch", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/HIGH.*mismatch|mismatch.*HIGH|high.*不一致|不一致.*high/is);
  });

  it("fact-check findings are severity high", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/severity.*high|high.*severity/is);
  });
});

describe("TC-RR-003: target and out-of-scope are defined", () => {
  it("defines file:line as a fact-check target", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/file:line/);
  });

  it("defines specific symbol names as a fact-check target", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/symbol|シンボル/);
  });

  it("defines file paths as a fact-check target", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/file path|ファイルパス/i);
  });

  it("excludes intentions and future plans from fact-check", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/out of scope|対象外/i);
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/intent|将来|future|plan/i);
  });
});

describe("TC-RR-004: existing read-only constraint and verdict logic are preserved", () => {
  it("still forbids file modification", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/Do NOT modify|編集禁止|read-only/i);
  });

  it("still defines approve / needs-discussion / reject verdict derivation", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("approve");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("needs-discussion");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("reject");
  });

  it("still defines findings array in report_result call", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("findings");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("report_result");
  });
});
