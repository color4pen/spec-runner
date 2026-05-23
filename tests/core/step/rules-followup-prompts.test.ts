/**
 * Unit tests for buildRulesFollowUpPrompts (T-03)
 */
import { describe, it, expect } from "vitest";
import { buildRulesFollowUpPrompts } from "../../../src/core/step/rules-followup-prompts.js";

describe("buildRulesFollowUpPrompts", () => {
  it("単一ファイル: wrap に 3 要素 (修正範囲 / stop 条件 / 意図解釈) が含まれる", () => {
    const result = buildRulesFollowUpPrompts(["# Rule\nDo this."]);
    expect(result).toHaveLength(1);
    const prompt = result[0]!;
    expect(prompt).toContain("修正範囲");
    expect(prompt).toContain("stop 条件");
    expect(prompt).toContain("意図解釈");
  });

  it("rule 内容が <rule>...</rule> タグで囲まれている", () => {
    const ruleContent = "# My Rule\nFollow this convention.";
    const result = buildRulesFollowUpPrompts([ruleContent]);
    const prompt = result[0]!;
    expect(prompt).toContain("<rule>");
    expect(prompt).toContain(ruleContent);
    expect(prompt).toContain("</rule>");
  });

  it("3 要素以外の wrap 箇条書きが </rule> 以降に含まれない", () => {
    const result = buildRulesFollowUpPrompts(["# Rule\nSome content here."]);
    const prompt = result[0]!;
    // </rule> 以降の部分で - 箇条書きを確認
    const afterRule = prompt.split("</rule>")[1] ?? "";
    const bulletLines = afterRule.split("\n").filter((l) => l.match(/^- /));
    // 許可される箇条書きは 修正範囲 / stop 条件 / 意図解釈 の 3 つのみ
    const allowedKeywords = ["修正範囲", "stop 条件", "意図解釈"];
    const extraBullets = bulletLines.filter(
      (l) => !allowedKeywords.some((kw) => l.includes(kw)),
    );
    expect(extraBullets).toHaveLength(0);
  });

  it("空配列入力 → 空配列出力", () => {
    const result = buildRulesFollowUpPrompts([]);
    expect(result).toEqual([]);
  });

  it("複数ファイル: 出力配列の長さが入力と一致", () => {
    const result = buildRulesFollowUpPrompts(["rule1", "rule2", "rule3"]);
    expect(result).toHaveLength(3);
  });

  it("複数ファイル: 各 prompt に対応する rule 内容が含まれる", () => {
    const result = buildRulesFollowUpPrompts(["content-one", "content-two"]);
    expect(result[0]).toContain("content-one");
    expect(result[1]).toContain("content-two");
  });

  it("pure function — 同じ入力は同じ出力を返す", () => {
    const input = ["# Rule A\nDo X.", "# Rule B\nDo Y."];
    const r1 = buildRulesFollowUpPrompts(input);
    const r2 = buildRulesFollowUpPrompts(input);
    expect(r1).toEqual(r2);
  });
});
