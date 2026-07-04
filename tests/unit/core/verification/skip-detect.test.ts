/**
 * Unit tests for detectSkippedTests()
 *
 * TC-SD-01: vitest-style "N skipped" in summary line
 * TC-SD-02: jest-style "N skipped" in colon-separated summary
 * TC-SD-03: mocha-style "N pending" on its own line
 * TC-SD-04: "N todo" keyword
 * TC-SD-05: multiple categories summed (skipped + todo)
 * TC-SD-06: case-insensitive match ("SKIPPED")
 * TC-SD-07: "0 skipped" → 0
 * TC-SD-08: no skip keyword present → 0
 * TC-SD-09: empty string → 0
 */
import { describe, it, expect } from "vitest";
import { detectSkippedTests } from "../../../../src/core/verification/skip-detect.js";

// TC-SD-01: vitest-style "N skipped" embedded in a pipe-separated summary
describe("TC-SD-01: vitest-style '2 skipped' in output", () => {
  it("returns 2 when output contains '2 skipped'", () => {
    expect(detectSkippedTests("Tests  1 passed | 2 skipped (3)")).toBe(2);
  });
});

// TC-SD-02: jest-style colon-separated summary "N skipped, M passed, T total"
describe("TC-SD-02: jest-style 'N skipped, M passed, T total'", () => {
  it("returns 2 when output contains 'Tests: 2 skipped, 5 passed, 7 total'", () => {
    expect(detectSkippedTests("Tests: 2 skipped, 5 passed, 7 total")).toBe(2);
  });
});

// TC-SD-03: mocha-style "N pending" on its own line
describe("TC-SD-03: mocha-style '1 pending'", () => {
  it("returns 1 when output contains '1 pending' on a separate line", () => {
    expect(detectSkippedTests("5 passing\n1 pending")).toBe(1);
  });
});

// TC-SD-04: "N todo" keyword (vitest todo tests)
describe("TC-SD-04: '3 todo' keyword", () => {
  it("returns 3 when output contains '3 todo'", () => {
    expect(detectSkippedTests("3 todo")).toBe(3);
  });
});

// TC-SD-05: multiple categories summed (skipped + todo)
describe("TC-SD-05: multiple categories summed", () => {
  it("sums skipped and todo: '5 passed | 2 skipped | 1 todo' → 3", () => {
    expect(detectSkippedTests("5 passed | 2 skipped | 1 todo")).toBe(3);
  });
});

// TC-SD-06: case-insensitive match
describe("TC-SD-06: case-insensitive match", () => {
  it("matches 'SKIPPED' (uppercase) and returns 4", () => {
    expect(detectSkippedTests("SKIPPED: 4 skipped")).toBe(4);
  });
});

// TC-SD-07: zero skipped → 0
describe("TC-SD-07: '0 skipped' → 0", () => {
  it("returns 0 when output contains '0 skipped'", () => {
    expect(detectSkippedTests("all green, 0 skipped")).toBe(0);
  });
});

// TC-SD-08: no skip keyword → 0
describe("TC-SD-08: no skip keyword → 0", () => {
  it("returns 0 when output has no skip/pending/todo keyword", () => {
    expect(detectSkippedTests("42 tests passed")).toBe(0);
  });
});

// TC-SD-09: empty string → 0
describe("TC-SD-09: empty string → 0", () => {
  it("returns 0 for empty string", () => {
    expect(detectSkippedTests("")).toBe(0);
  });
});
