/**
 * Unit tests for src/core/verification/changed-lines.ts
 *
 * TC-CL-01: Simple +c,d hunk → lines c..c+d-1
 * TC-CL-02: Hunk without count (`,d` omitted) → 1 line
 * TC-CL-03: Pure deletion (d=0) → no lines added
 * TC-CL-04: Multiple hunks → union of all ranges
 * TC-CL-05: Empty diff text → empty set
 * TC-CL-06: Diff with only context lines (no hunk headers) → empty set
 */
import { describe, it, expect } from "vitest";
import { parseUnifiedDiffChangedLines } from "../../../../src/core/verification/changed-lines.js";

describe("TC-CL-01: Simple +c,d hunk", () => {
  it("+5,3 → lines 5, 6, 7", () => {
    const diff = `@@ -10,3 +5,3 @@ context`;
    const result = parseUnifiedDiffChangedLines(diff);
    expect(result.has(5)).toBe(true);
    expect(result.has(6)).toBe(true);
    expect(result.has(7)).toBe(true);
    expect(result.size).toBe(3);
  });
});

describe("TC-CL-02: Hunk without count (`,d` omitted)", () => {
  it("+10 (no comma) → single line 10", () => {
    const diff = `@@ -5 +10 @@ context`;
    const result = parseUnifiedDiffChangedLines(diff);
    expect(result.has(10)).toBe(true);
    expect(result.size).toBe(1);
  });
});

describe("TC-CL-03: Pure deletion (d=0)", () => {
  it("+5,0 → no lines added (pure deletion)", () => {
    const diff = `@@ -3,2 +5,0 @@ context`;
    const result = parseUnifiedDiffChangedLines(diff);
    expect(result.size).toBe(0);
  });
});

describe("TC-CL-04: Multiple hunks", () => {
  it("two hunks → union of both ranges", () => {
    const diff = [
      `@@ -1,2 +1,2 @@ first`,
      `@@ -10,3 +20,2 @@ second`,
    ].join("\n");
    const result = parseUnifiedDiffChangedLines(diff);
    // First hunk: lines 1, 2
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    // Second hunk: lines 20, 21
    expect(result.has(20)).toBe(true);
    expect(result.has(21)).toBe(true);
    expect(result.size).toBe(4);
  });
});

describe("TC-CL-05: Empty diff text", () => {
  it("empty string → empty set", () => {
    const result = parseUnifiedDiffChangedLines("");
    expect(result.size).toBe(0);
  });
});

describe("TC-CL-06: No hunk headers", () => {
  it("diff without @@ lines → empty set", () => {
    const diff = `diff --git a/foo b/foo\nindex 000..111 100644\n--- a/foo\n+++ b/foo`;
    const result = parseUnifiedDiffChangedLines(diff);
    expect(result.size).toBe(0);
  });
});

describe("TC-CL edge: d=1 (single line, explicit)", () => {
  it("+5,1 → exactly line 5", () => {
    const diff = `@@ -3,1 +5,1 @@ ctx`;
    const result = parseUnifiedDiffChangedLines(diff);
    expect(result.has(5)).toBe(true);
    expect(result.size).toBe(1);
  });
});
