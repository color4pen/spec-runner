/**
 * Unit tests for rules-delivery.ts
 *
 * TC-001: frontmatter が本文から除去される
 * TC-002: frontmatter の無いファイルは全体が本文
 * TC-009: splitRulesByDelivery — delivery: prompt 単独ファイルが prompt バケットに入る
 * TC-010: splitRulesByDelivery — prompt / followup 混在の複数ファイルを正しく分類する
 * TC-011: splitRulesByDelivery — 出力の順序が入力順を保つ
 * TC-012: buildRulesPromptSection — preamble が 1 回のみ出力される
 * TC-013: buildRulesPromptSection — 複数本文が <rule> タグで昇順連結される
 * TC-014: buildRulesPromptSection — 空入力で undefined を返す
 * TC-015: buildRulesPromptSection — follow-up 3 要素 wrap の文言を含まない
 * TC-027: splitRulesByDelivery — エラーメッセージに不正値・許容値・本文冒頭行が含まれる
 */
import { describe, it, expect } from "vitest";
import { splitRulesByDelivery, buildRulesPromptSection } from "../../../src/core/step/rules-delivery.js";

// ---------------------------------------------------------------------------
// TC-001: frontmatter が本文から除去される
// ---------------------------------------------------------------------------

describe("TC-001: frontmatter が本文から除去される", () => {
  it("delivery: prompt — frontmatter は prompt バケット本文に含まれない", () => {
    const content = "---\ndelivery: prompt\n---\n## 本文\nbody content";
    const { prompt, followup } = splitRulesByDelivery([content]);
    expect(prompt).toHaveLength(1);
    expect(prompt[0]).not.toContain("---");
    expect(prompt[0]).not.toContain("delivery: prompt");
    expect(prompt[0]).toContain("## 本文");
    expect(followup).toHaveLength(0);
  });

  it("delivery: followup — frontmatter は followup バケット本文に含まれない", () => {
    const content = "---\ndelivery: followup\n---\n## 本文\nbody content";
    const { followup, prompt } = splitRulesByDelivery([content]);
    expect(followup).toHaveLength(1);
    expect(followup[0]).not.toContain("---");
    expect(followup[0]).not.toContain("delivery: followup");
    expect(followup[0]).toContain("## 本文");
    expect(prompt).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-002: frontmatter の無いファイルは全体が本文
// ---------------------------------------------------------------------------

describe("TC-002: frontmatter の無いファイルは全体が本文", () => {
  it("frontmatter なし → 全体が本文 → followup バケット", () => {
    const content = "## 本文\nbody content";
    const { followup, prompt } = splitRulesByDelivery([content]);
    expect(followup).toHaveLength(1);
    expect(followup[0]).toBe(content);
    expect(prompt).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-009: delivery: prompt 単独ファイルが prompt バケットに入る
// ---------------------------------------------------------------------------

describe("TC-009: delivery: prompt 単独ファイルが prompt バケットに入る", () => {
  it("prompt バケットに frontmatter 除去済み本文が 1 件入り、followup は空", () => {
    const content = "---\ndelivery: prompt\n---\nprompt rule body";
    const result = splitRulesByDelivery([content]);
    expect(result.prompt).toHaveLength(1);
    expect(result.prompt[0]).toBe("prompt rule body");
    expect(result.followup).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-010: prompt / followup 混在の複数ファイルを正しく分類する
// ---------------------------------------------------------------------------

describe("TC-010: prompt / followup 混在を正しく分類する", () => {
  it("3 件混在: prompt 1 件 / followup 1 件 / 未指定 1 件", () => {
    const promptContent = "---\ndelivery: prompt\n---\nprompt body";
    const followupContent = "---\ndelivery: followup\n---\nfollowup body";
    const noneContent = "no frontmatter body";
    const result = splitRulesByDelivery([promptContent, followupContent, noneContent]);
    expect(result.prompt).toHaveLength(1);
    expect(result.prompt[0]).toContain("prompt body");
    expect(result.followup).toHaveLength(2);
    expect(result.followup[0]).toContain("followup body");
    expect(result.followup[1]).toBe(noneContent);
  });
});

// ---------------------------------------------------------------------------
// TC-011: 出力の順序が入力順を保つ
// ---------------------------------------------------------------------------

describe("TC-011: 出力の順序が入力順を保つ", () => {
  it("delivery: prompt の 3 件が入力順で保持される", () => {
    const a = "---\ndelivery: prompt\n---\nbody A";
    const b = "---\ndelivery: prompt\n---\nbody B";
    const c = "---\ndelivery: prompt\n---\nbody C";
    const result = splitRulesByDelivery([a, b, c]);
    expect(result.prompt[0]).toContain("body A");
    expect(result.prompt[1]).toContain("body B");
    expect(result.prompt[2]).toContain("body C");
  });
});

// ---------------------------------------------------------------------------
// TC-027: エラーメッセージに不正値・許容値・本文冒頭行が含まれる
// ---------------------------------------------------------------------------

describe("TC-027: 未知 delivery 値で throw — メッセージに不正値・許容値・本文冒頭行", () => {
  it("delivery: unknown_value で例外を投げ、メッセージに必要情報が含まれる", () => {
    const content = "---\ndelivery: unknown_value\n---\n## identifiable first line\nbody";
    expect(() => splitRulesByDelivery([content])).toThrow();
    try {
      splitRulesByDelivery([content]);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("unknown_value");
      expect(msg).toContain("followup");
      expect(msg).toContain("prompt");
      expect(msg).toContain("## identifiable first line");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-012: preamble が 1 回のみ出力される
// ---------------------------------------------------------------------------

describe("TC-012: buildRulesPromptSection — preamble が 1 回のみ出力される", () => {
  it("<project-rules> タグが 1 回だけ現れる", () => {
    const result = buildRulesPromptSection(["body1", "body2", "body3"]);
    expect(result).toBeDefined();
    const openCount = (result!.match(/<project-rules>/g) ?? []).length;
    const closeCount = (result!.match(/<\/project-rules>/g) ?? []).length;
    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-013: 複数本文が <rule> タグで昇順連結される
// ---------------------------------------------------------------------------

describe("TC-013: buildRulesPromptSection — 複数本文が <rule> タグで昇順連結される", () => {
  it("RULE_A が RULE_B より前に現れる", () => {
    const result = buildRulesPromptSection(["RULE_A", "RULE_B"]);
    expect(result).toBeDefined();
    const posA = result!.indexOf("<rule>\nRULE_A\n</rule>");
    const posB = result!.indexOf("<rule>\nRULE_B\n</rule>");
    expect(posA).toBeGreaterThanOrEqual(0);
    expect(posB).toBeGreaterThanOrEqual(0);
    expect(posA).toBeLessThan(posB);
  });
});

// ---------------------------------------------------------------------------
// TC-014: 空入力で undefined を返す
// ---------------------------------------------------------------------------

describe("TC-014: buildRulesPromptSection — 空入力で undefined を返す", () => {
  it("空配列 → undefined", () => {
    expect(buildRulesPromptSection([])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-015: follow-up 3 要素 wrap の文言を含まない
// ---------------------------------------------------------------------------

describe("TC-015: buildRulesPromptSection — follow-up 3 要素 wrap の文言を含まない", () => {
  it("「直前の作業結果を確認してください」を含まない", () => {
    const result = buildRulesPromptSection(["body"]);
    expect(result).toBeDefined();
    expect(result).not.toContain("直前の作業結果を確認してください");
    expect(result).not.toContain("修正範囲");
    expect(result).not.toContain("stop 条件");
    expect(result).not.toContain("意図解釈");
  });
});
