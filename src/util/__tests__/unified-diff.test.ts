/**
 * Unit tests for src/util/unified-diff.ts
 *
 * TC-042: classifyContent が NUL バイトを正しく判定する
 * TC-043: buildUnifiedDiff が追加のみ・削除のみ・空ファイル・末尾改行差分を処理できる
 * TC-044: unified-diff.ts が import 文を 1 つも持たない
 * TC-045: buildUnifiedDiff が生成した hunk header が parseUnifiedDiffChangedLines で解析できる
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyContent, buildUnifiedDiff } from "../unified-diff.js";
import { parseUnifiedDiffChangedLines } from "../../core/verification/changed-lines.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── TC-042: classifyContent ──────────────────────────────────────────────────

describe("TC-042: classifyContent", () => {
  it("returns 'binary' for Uint8Array with NUL byte", () => {
    const bytes = new Uint8Array([72, 101, 108, 0, 111]);
    expect(classifyContent(bytes)).toBe("binary");
  });

  it("returns 'text' for valid UTF-8 text bytes", () => {
    const bytes = new TextEncoder().encode("hello world\n");
    expect(classifyContent(bytes)).toBe("text");
  });

  it("returns 'binary' for invalid UTF-8 sequence", () => {
    // 0xFF is not valid UTF-8
    const bytes = new Uint8Array([0xff, 0xfe]);
    expect(classifyContent(bytes)).toBe("binary");
  });

  it("returns 'text' for empty bytes", () => {
    expect(classifyContent(new Uint8Array([]))).toBe("text");
  });

  it("returns 'text' for multi-byte UTF-8", () => {
    const bytes = new TextEncoder().encode("日本語テスト\n");
    expect(classifyContent(bytes)).toBe("text");
  });
});

// ─── TC-043: buildUnifiedDiff edge cases ──────────────────────────────────────

describe("TC-043: buildUnifiedDiff edge cases", () => {
  it("(1) addition only: empty old + non-empty new", () => {
    const diff = buildUnifiedDiff("", "line1\nline2\n", { oldPath: "old", newPath: "new" });
    expect(diff).toContain("+line1");
    expect(diff).toContain("+line2");
    // No removal lines in body (the --- header is allowed, body lines starting with - are not)
    const bodyLines = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(bodyLines).toHaveLength(0);
    expect(diff).toContain("@@ -0,0 +1,2 @@");
  });

  it("(2) deletion only: non-empty old + empty new", () => {
    const diff = buildUnifiedDiff("line1\nline2\n", "", { oldPath: "old", newPath: "new" });
    expect(diff).toContain("-line1");
    expect(diff).toContain("-line2");
    expect(diff).not.toContain("+line");
    expect(diff).toContain("@@ -1,2 +0,0 @@");
  });

  it("(3) both sides empty: returns empty string", () => {
    const diff = buildUnifiedDiff("", "", { oldPath: "old", newPath: "new" });
    expect(diff).toBe("");
  });

  it("(4) trailing newline difference: includes no-newline marker", () => {
    const diff = buildUnifiedDiff("hello\n", "hello", { oldPath: "old", newPath: "new" });
    expect(diff).toContain("\\ No newline at end of file");
    expect(diff).toContain("-hello");
    expect(diff).toContain("+hello");
  });

  it("returns empty string for identical inputs", () => {
    const diff = buildUnifiedDiff("same\ncontent\n", "same\ncontent\n", { oldPath: "a", newPath: "b" });
    expect(diff).toBe("");
  });

  it("includes --- and +++ headers", () => {
    const diff = buildUnifiedDiff("old\n", "new\n", { oldPath: "a/old.txt", newPath: "b/new.txt" });
    expect(diff).toContain("--- a/old.txt");
    expect(diff).toContain("+++ b/new.txt");
  });

  it("respects custom context lines", () => {
    const text = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";
    const modified = "1\n2\n3\n4\nX\n6\n7\n8\n9\n10\n";
    const diff0 = buildUnifiedDiff(text, modified, { oldPath: "a", newPath: "b", context: 0 });
    const diff3 = buildUnifiedDiff(text, modified, { oldPath: "a", newPath: "b", context: 3 });
    // context=0 should have fewer lines
    expect(diff0.split("\n").length).toBeLessThan(diff3.split("\n").length);
  });
});

// ─── TC-044: unified-diff.ts has zero imports ─────────────────────────────────

describe("TC-044: unified-diff.ts has no import statements", () => {
  it("source file contains no import declarations", () => {
    const srcPath = path.join(__dirname, "../unified-diff.ts");
    const src = fs.readFileSync(srcPath, "utf-8");
    // Check for import statements (but not JSDoc @import or 'importmeta' etc.)
    const importLines = src.split("\n").filter(
      (line) => /^import\s/.test(line.trim()),
    );
    expect(importLines, `Found import lines:\n${importLines.join("\n")}`).toHaveLength(0);
  });
});

// ─── TC-045: hunk headers parseable by parseUnifiedDiffChangedLines ───────────

describe("TC-045: generated hunk headers are parseable by parseUnifiedDiffChangedLines", () => {
  it("simple modification: changed lines match", () => {
    const old = "a\nb\nc\n";
    const next = "a\nB\nc\n";
    const diff = buildUnifiedDiff(old, next, { oldPath: "f", newPath: "f" });
    const changed = parseUnifiedDiffChangedLines(diff);
    expect(changed.size).toBeGreaterThan(0);
    expect(changed.has(2)).toBe(true); // line 2 changed
  });

  it("addition-only: new lines are in changed set", () => {
    const diff = buildUnifiedDiff("", "line1\nline2\n", { oldPath: "f", newPath: "f" });
    const changed = parseUnifiedDiffChangedLines(diff);
    expect(changed.has(1)).toBe(true);
    expect(changed.has(2)).toBe(true);
  });

  it("deletion-only: no lines in new-side changed set (pure deletion)", () => {
    const diff = buildUnifiedDiff("line1\nline2\n", "", { oldPath: "f", newPath: "f" });
    const changed = parseUnifiedDiffChangedLines(diff);
    // Pure deletion: new side count = 0, so no new lines
    expect(changed.size).toBe(0);
  });

  it("multi-hunk: all changed lines present", () => {
    const old = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n";
    const next = "1\n2\n3\n4\nX\n6\n7\n8\n9\n10\n11\n12\nY\n14\n15\n";
    const diff = buildUnifiedDiff(old, next, { oldPath: "f", newPath: "f", context: 0 });
    const changed = parseUnifiedDiffChangedLines(diff);
    expect(changed.has(5)).toBe(true);  // X was at line 5
    expect(changed.has(13)).toBe(true); // Y was at line 13
  });
});

// ─── deterministic output ─────────────────────────────────────────────────────

describe("buildUnifiedDiff is deterministic", () => {
  it("same inputs always produce same output", () => {
    const old = "a\nb\nc\n";
    const next = "a\nX\nc\n";
    const d1 = buildUnifiedDiff(old, next, { oldPath: "f", newPath: "f" });
    const d2 = buildUnifiedDiff(old, next, { oldPath: "f", newPath: "f" });
    expect(d1).toBe(d2);
  });
});
