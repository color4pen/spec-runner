/**
 * Regression tests for coverage gate prohibition rules in fixer prompts.
 *
 * T-01 AC: BUILD_FIXER_SYSTEM_PROMPT に lcov 変更行 gate 手順のキーワードが含まれる
 *          旧 TC-ID 手順テキストが含まれない
 *          gate 回避禁止キーワードが含まれる
 * T-02 AC: CODE_FIXER_SYSTEM_PROMPT に gate 回避禁止キーワードが含まれる
 */
import { describe, it, expect } from "vitest";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../build-fixer-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../code-fixer-system.js";

// ---------------------------------------------------------------------------
// BUILD_FIXER_SYSTEM_PROMPT — lcov 変更行 gate 手順
// ---------------------------------------------------------------------------

describe("BUILD_FIXER_SYSTEM_PROMPT: lcov 変更行 gate 手順が含まれる", () => {
  it("verification-result.md への参照が含まれる", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("verification-result.md");
  });

  it("未実行の変更行確認の旨が含まれる", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("変更行");
  });

  it("実テスト追加が唯一の正当な修正であることが含まれる", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("実テストを追加する");
  });
});

// ---------------------------------------------------------------------------
// BUILD_FIXER_SYSTEM_PROMPT — 旧 TC-ID 手順が残っていない
// ---------------------------------------------------------------------------

describe("BUILD_FIXER_SYSTEM_PROMPT: 旧 TC-ID 手順が含まれない", () => {
  it('"missing TC ID" が含まれない', () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).not.toContain("missing TC ID");
  });

  it('"test-cases.md" が含まれない', () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).not.toContain("test-cases.md");
  });

  it('"TC ID を必ず記載" が含まれない', () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).not.toContain("TC ID を必ず記載");
  });
});

// ---------------------------------------------------------------------------
// BUILD_FIXER_SYSTEM_PROMPT — coverage gate 回避禁止規律
// ---------------------------------------------------------------------------

describe("BUILD_FIXER_SYSTEM_PROMPT: coverage gate 回避禁止規律が含まれる", () => {
  it("テスト削除・移設の禁止が含まれる", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("テストの削除");
  });

  it("dead code / dead export 追加の禁止が含まれる", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("dead code");
  });

  it("coverage 設定編集の禁止が含まれる", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("coverage 設定");
  });
});

// ---------------------------------------------------------------------------
// CODE_FIXER_SYSTEM_PROMPT — coverage gate 回避禁止規律
// ---------------------------------------------------------------------------

describe("CODE_FIXER_SYSTEM_PROMPT: coverage gate 回避禁止規律が含まれる", () => {
  it("テスト削除・移設の禁止が含まれる", () => {
    expect(CODE_FIXER_SYSTEM_PROMPT).toContain("テストの削除");
  });

  it("dead code / dead export 追加の禁止が含まれる", () => {
    expect(CODE_FIXER_SYSTEM_PROMPT).toContain("dead code");
  });

  it("coverage 設定編集の禁止が含まれる", () => {
    expect(CODE_FIXER_SYSTEM_PROMPT).toContain("coverage 設定");
  });
});
