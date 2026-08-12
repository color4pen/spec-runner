/**
 * Unit tests for extractMarkdownSections and buildRequestConstraintsBlock
 *
 * TC-01: 単一 heading の抽出
 * TC-02: heading が存在しない場合 (Map にエントリなし)
 * TC-03: 複数 heading を同時抽出
 * TC-04: heading 直下が空（本文なし）→ Map にエントリなし
 * TC-05: `###` レベル heading は section 境界にならない
 * TC-06: headings 配列に指定されていない heading は無視される
 * TC-07: headings 配列が空の場合 → 空 Map
 * TC-08: content が空文字列 → 空 Map
 * TC-09: 3 section 全て存在する場合のブロック生成
 * TC-10: 全 section が存在しない場合は undefined を返す
 * TC-11: 一部 section のみ存在する場合
 * TC-12: REQUEST_CONSTRAINT_HEADINGS 定数が正しい値を持つ
 * TC-13: ブロック内の説明文 (CLI-injected 注記) が含まれる
 */
import { describe, it, expect } from "vitest";
import {
  extractMarkdownSections,
  buildRequestConstraintsBlock,
  REQUEST_CONSTRAINT_HEADINGS,
  countTopLevelAcceptanceCriteria,
} from "../../../src/parser/extract-section.js";

// ---------------------------------------------------------------------------
// extractMarkdownSections
// ---------------------------------------------------------------------------

describe("TC-01: 単一 heading の抽出", () => {
  it("extracts content under ## スコープ外, trimming surrounding blank lines", () => {
    const content =
      "## スコープ外\n\n- item A\n- item B\n\n## 次のセクション\n...\n";
    const result = extractMarkdownSections(content, ["スコープ外"]);
    expect(result.has("スコープ外")).toBe(true);
    expect(result.get("スコープ外")).toBe("- item A\n- item B");
  });
});

describe("TC-02: heading が存在しない場合", () => {
  it("returns Map without an entry for missing heading", () => {
    const content = "## 背景\n\nsome text\n";
    const result = extractMarkdownSections(content, ["スコープ外"]);
    expect(result.has("スコープ外")).toBe(false);
    expect(result.size).toBe(0);
  });
});

describe("TC-03: 複数 heading を同時抽出", () => {
  it("extracts all three constraint headings in one call", () => {
    const content =
      "## スコープ外\n\ncontent-A\n\n## 受け入れ基準\n\ncontent-B\n\n## architect 評価済みの設計判断\n\ncontent-C\n";
    const result = extractMarkdownSections(content, [
      "スコープ外",
      "受け入れ基準",
      "architect 評価済みの設計判断",
    ]);
    expect(result.size).toBe(3);
    expect(result.get("スコープ外")).toBe("content-A");
    expect(result.get("受け入れ基準")).toBe("content-B");
    expect(result.get("architect 評価済みの設計判断")).toBe("content-C");
  });
});

describe("TC-04: heading 直下が空（本文なし）", () => {
  it("returns no entry for heading with empty body", () => {
    const content = "## スコープ外\n\n## 次のセクション\n\ncontent\n";
    const result = extractMarkdownSections(content, ["スコープ外"]);
    // Either no entry, or empty string — spec says "no entry or empty string"
    const hasEntry = result.has("スコープ外");
    if (hasEntry) {
      expect(result.get("スコープ外")).toBe("");
    } else {
      expect(hasEntry).toBe(false);
    }
  });
});

describe("TC-05: `###` レベル heading は section 境界にならない", () => {
  it("includes ### subheading content inside the parent ## section", () => {
    const content =
      "## スコープ外\n\nline1\n\n### サブセクション\n\nline2\n\n## 受け入れ基準\n\ncontent-B\n";
    const result = extractMarkdownSections(content, ["スコープ外"]);
    const value = result.get("スコープ外");
    expect(value).toBeDefined();
    expect(value).toContain("line1");
    expect(value).toContain("### サブセクション");
    expect(value).toContain("line2");
    // content-B belongs to 受け入れ基準, not スコープ外
    expect(value).not.toContain("content-B");
  });
});

describe("TC-06: headings 配列に指定されていない heading は無視される", () => {
  it("only returns entries for requested headings", () => {
    const content = "## 背景\n\nbg-content\n\n## スコープ外\n\nscope-content\n";
    const result = extractMarkdownSections(content, ["スコープ外"]);
    expect(result.has("スコープ外")).toBe(true);
    expect(result.has("背景")).toBe(false);
  });
});

describe("TC-07: headings 配列が空の場合", () => {
  it("returns empty Map when headings array is empty", () => {
    const content = "## スコープ外\n\nsome content\n";
    const result = extractMarkdownSections(content, []);
    expect(result.size).toBe(0);
  });
});

describe("TC-08: content が空文字列", () => {
  it("returns empty Map without error when content is empty", () => {
    const result = extractMarkdownSections("", ["スコープ外"]);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildRequestConstraintsBlock
// ---------------------------------------------------------------------------

describe("TC-09: 3 section 全て存在する場合のブロック生成", () => {
  const requestContent = [
    "# タイトル",
    "",
    "## スコープ外",
    "",
    "- rules ファイルでの対応",
    "",
    "## 受け入れ基準",
    "",
    "- [ ] design step に注入される",
    "",
    "## architect 評価済みの設計判断",
    "",
    "- CLI 内フォローアップを採用",
    "",
  ].join("\n");

  it("returns a string containing ## Request Constraints (CLI-injected)", () => {
    const result = buildRequestConstraintsBlock(requestContent);
    expect(result).toBeDefined();
    expect(result).toContain("## Request Constraints (CLI-injected)");
  });

  it("includes all three ### headings", () => {
    const result = buildRequestConstraintsBlock(requestContent)!;
    expect(result).toContain("### スコープ外");
    expect(result).toContain("### 受け入れ基準");
    expect(result).toContain("### architect 評価済みの設計判断");
  });

  it("includes the section body for each heading", () => {
    const result = buildRequestConstraintsBlock(requestContent)!;
    expect(result).toContain("rules ファイルでの対応");
    expect(result).toContain("design step に注入される");
    expect(result).toContain("CLI 内フォローアップを採用");
  });
});

describe("TC-10: 全 section が存在しない場合は undefined を返す", () => {
  it("returns undefined when no constraint sections exist", () => {
    const content = "## 背景\n\ncontent\n\n## 要件\n\ncontent\n";
    const result = buildRequestConstraintsBlock(content);
    expect(result).toBeUndefined();
  });
});

describe("TC-11: 一部 section のみ存在する場合", () => {
  it("includes only present sections, omits missing ones", () => {
    const content =
      "## スコープ外\n\n- scope item\n\n## 背景\n\ncontent\n";
    const result = buildRequestConstraintsBlock(content)!;
    expect(result).toBeDefined();
    expect(result).toContain("### スコープ外");
    expect(result).toContain("scope item");
    // Missing sections should not appear as headings
    expect(result).not.toContain("### 受け入れ基準");
    expect(result).not.toContain("### architect 評価済みの設計判断");
  });
});

describe("TC-12: REQUEST_CONSTRAINT_HEADINGS 定数が正しい値を持つ", () => {
  it("equals the expected three headings", () => {
    expect([...REQUEST_CONSTRAINT_HEADINGS]).toEqual([
      "スコープ外",
      "受け入れ基準",
      "architect 評価済みの設計判断",
    ]);
  });
});

describe("TC-13: ブロック内の説明文 (CLI-injected 注記) が含まれる", () => {
  it("includes a description mentioning CLI extraction", () => {
    const content =
      "## スコープ外\n\n- item\n\n## 受け入れ基準\n\n- criteria\n\n## architect 評価済みの設計判断\n\n- decision\n";
    const result = buildRequestConstraintsBlock(content)!;
    expect(result).toContain("request.md から CLI が抽出した制約情報");
  });
});

// ---------------------------------------------------------------------------
// countTopLevelAcceptanceCriteria
// ---------------------------------------------------------------------------

describe("TC-007: countTopLevelAcceptanceCriteria — 15 項目の受け入れ基準で 15 を返す", () => {
  it("行頭無インデントの - マーカー項目が 15 行ある場合 15 を返す", () => {
    const items = Array.from({ length: 15 }, (_, i) => `- [ ] 基準 ${i + 1}`).join("\n");
    const content = `# Test\n\n## 受け入れ基準\n\n${items}\n`;
    expect(countTopLevelAcceptanceCriteria(content)).toBe(15);
  });
});

describe("TC-008: countTopLevelAcceptanceCriteria — インデント済みネスト項目を数えない", () => {
  it("top-level 3 行 + 2 スペースインデントのサブ項目 5 行で 3 を返す", () => {
    const content = [
      "# Test",
      "",
      "## 受け入れ基準",
      "",
      "- [ ] 基準 1",
      "- [ ] 基準 2",
      "- [ ] 基準 3",
      "  - サブ項目 1",
      "  - サブ項目 2",
      "  - サブ項目 3",
      "  - サブ項目 4",
      "  - サブ項目 5",
      "",
    ].join("\n");
    expect(countTopLevelAcceptanceCriteria(content)).toBe(3);
  });
});

describe("TC-009: countTopLevelAcceptanceCriteria — HTML コメント内のリスト行を数えない", () => {
  it("コメント内の - 行を除外し top-level 2 行で 2 を返す", () => {
    const content = [
      "# Test",
      "",
      "## 受け入れ基準",
      "",
      "<!-- - コメント内の項目 -->",
      "- [ ] 基準 1",
      "- [ ] 基準 2",
      "",
    ].join("\n");
    expect(countTopLevelAcceptanceCriteria(content)).toBe(2);
  });

  it("複数行 HTML コメント内の - 行を除外する", () => {
    const content = [
      "# Test",
      "",
      "## 受け入れ基準",
      "",
      "<!--",
      "- コメント行 1",
      "- コメント行 2",
      "-->",
      "- [ ] 基準 1",
      "",
    ].join("\n");
    expect(countTopLevelAcceptanceCriteria(content)).toBe(1);
  });
});

describe("TC-010: countTopLevelAcceptanceCriteria — 受け入れ基準節が無いとき 0 を返す", () => {
  it("受け入れ基準見出しが存在しない場合 0 を返す", () => {
    const content = [
      "# Test",
      "",
      "## 背景",
      "",
      "背景の説明",
      "",
      "## 要件",
      "",
      "1. 要件 1",
      "",
    ].join("\n");
    expect(countTopLevelAcceptanceCriteria(content)).toBe(0);
  });

  it("空文字列に対して 0 を返す", () => {
    expect(countTopLevelAcceptanceCriteria("")).toBe(0);
  });
});

describe("TC-014: countTopLevelAcceptanceCriteria — `-` / `*` / `+` / `1.` / `1)` の各マーカーを top-level として認識する", () => {
  it("5 種類のマーカー（各 1 行）で 5 を返す", () => {
    const content = [
      "# Test",
      "",
      "## 受け入れ基準",
      "",
      "- 項目1",
      "* 項目2",
      "+ 項目3",
      "1. 項目4",
      "1) 項目5",
      "",
    ].join("\n");
    expect(countTopLevelAcceptanceCriteria(content)).toBe(5);
  });
});
