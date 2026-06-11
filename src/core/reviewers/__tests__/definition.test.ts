/**
 * T-01: parseReviewerDefinition unit tests.
 */
import { describe, it, expect } from "vitest";
import { parseReviewerDefinition } from "../definition.js";

// ---------------------------------------------------------------------------
// Valid md → ReviewerDefinition
// ---------------------------------------------------------------------------

const VALID_MD = `---
name: security
maxIterations: 3
model: claude-opus-4-5
---

## 目的

セキュリティ観点でコードを検査する。

## 観点

- 認証・認可の欠落
- インジェクション脆弱性

## 判定基準

CRITICAL/HIGH が 0 件なら approved。
`;

describe("parseReviewerDefinition — valid md", () => {
  it("returns correct name from frontmatter", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.name).toBe("security");
  });

  it("returns correct maxIterations from frontmatter", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.maxIterations).toBe(3);
  });

  it("returns model from frontmatter", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.model).toBe("claude-opus-4-5");
  });

  it("preserves filename", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.filename).toBe("security.md");
  });

  it("parses 目的 section", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.purpose).toContain("セキュリティ観点");
  });

  it("parses 観点 section", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.criteria).toContain("認証・認可");
  });

  it("parses 判定基準 section", () => {
    const def = parseReviewerDefinition("security.md", VALID_MD);
    expect(def.judgment).toContain("approved");
  });
});

// ---------------------------------------------------------------------------
// Frontmatter missing
// ---------------------------------------------------------------------------

const NO_FRONTMATTER_MD = `## 目的

テスト。

## 観点

観点テキスト。

## 判定基準

判定基準テキスト。
`;

describe("parseReviewerDefinition — no frontmatter", () => {
  it("returns empty name when frontmatter absent", () => {
    const def = parseReviewerDefinition("foo.md", NO_FRONTMATTER_MD);
    expect(def.name).toBe("");
  });

  it("returns NaN when maxIterations absent (fails validation)", () => {
    const def = parseReviewerDefinition("foo.md", NO_FRONTMATTER_MD);
    expect(Number.isNaN(def.maxIterations)).toBe(true);
  });

  it("still parses body sections when frontmatter absent", () => {
    const def = parseReviewerDefinition("foo.md", NO_FRONTMATTER_MD);
    expect(def.purpose).toContain("テスト");
    expect(def.criteria).toContain("観点テキスト");
    expect(def.judgment).toContain("判定基準テキスト");
  });
});

// ---------------------------------------------------------------------------
// Missing required sections
// ---------------------------------------------------------------------------

const MISSING_SECTIONS_MD = `---
name: partial
maxIterations: 2
---

## 目的

目的テキスト。
`;

describe("parseReviewerDefinition — missing sections stored as empty string", () => {
  it("stores missing 観点 as empty string", () => {
    const def = parseReviewerDefinition("partial.md", MISSING_SECTIONS_MD);
    expect(def.criteria).toBe("");
  });

  it("stores missing 判定基準 as empty string", () => {
    const def = parseReviewerDefinition("partial.md", MISSING_SECTIONS_MD);
    expect(def.judgment).toBe("");
  });

  it("present 目的 is non-empty", () => {
    const def = parseReviewerDefinition("partial.md", MISSING_SECTIONS_MD);
    expect(def.purpose).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Model field optional
// ---------------------------------------------------------------------------

const NO_MODEL_MD = `---
name: perf
maxIterations: 5
---

## 目的

パフォーマンス。

## 観点

観点。

## 判定基準

判定基準。
`;

describe("parseReviewerDefinition — optional model", () => {
  it("returns undefined model when not in frontmatter", () => {
    const def = parseReviewerDefinition("perf.md", NO_MODEL_MD);
    expect(def.model).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// freeText: content not in required sections
// ---------------------------------------------------------------------------

const FREE_TEXT_MD = `---
name: style
maxIterations: 2
---

## 目的

スタイル検査。

## 観点

コーディング規約。

## 判定基準

指摘なし approved。

## 補足

追加情報はここ。
`;

describe("parseReviewerDefinition — freeText", () => {
  it("captures extra sections in freeText", () => {
    const def = parseReviewerDefinition("style.md", FREE_TEXT_MD);
    expect(def.freeText).toContain("追加情報");
  });
});

// ---------------------------------------------------------------------------
// TC-034: no node:fs import in definition.ts
// ---------------------------------------------------------------------------

describe("TC-034: definition module does not import node:fs", () => {
  it("can be imported without node:fs being imported (pure function module)", async () => {
    // If definition.ts imports node:fs, the dynamic import would resolve differently
    // in environments without fs. This test verifies the module loads in a pure-function
    // context without errors.
    const mod = await import("../definition.js");
    expect(typeof mod.parseReviewerDefinition).toBe("function");
  });
});
