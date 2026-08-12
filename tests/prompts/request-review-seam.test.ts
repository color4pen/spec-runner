/**
 * Tests for granularity seam judgment in request-review system prompt.
 *
 * TC-003: system prompt に縫い目判定観点・3 基準・実測較正値が含まれる
 * TC-004: system prompt に分割検討済み宣言尊重ルールが含まれる
 * TC-012: Method 6 が独立した観点として存在し、既存 Method 1–5 が保持される
 */
import { describe, it, expect } from "vitest";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/request-review-system.js";

// ---------------------------------------------------------------------------
// TC-003: system prompt に縫い目判定観点・3 基準・実測較正値が含まれる
// Source: spec.md > Requirement: request-review は縫い目判定観点を持つ
//         > Scenario: system prompt に縫い目判定観点・3 基準・較正値が含まれる
// ---------------------------------------------------------------------------

describe("TC-003: request-review system prompt に縫い目判定観点・3 基準・実測較正値が含まれる", () => {
  it("縫い目判定観点（独立して収束できる単位を 2 つ以上含むか）が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/独立して収束|seam|縫い目/i);
  });

  it("分割判定基準 1: 独立して設計・テストできる → 切る が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/独立して設計|独立して.*テスト/);
  });

  it("分割判定基準 2: 収束の意味論が異なる → 必ず切る が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/収束の意味論|意味論が異なる/);
  });

  it("分割判定基準 3: 受け入れ基準の相互参照 → 切らない が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/受け入れ基準の相互参照|相互参照/);
  });

  it("実測較正値 8% が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("8%");
  });

  it("実測較正値 23% が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("23%");
  });

  it("しきい値 15 本以上への言及が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/15\s*(本|項目|以上)/);
  });

  it("分割線が見つかれば decision-needed finding として分割案を提示する指示が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/decision-needed/);
  });
});

// ---------------------------------------------------------------------------
// TC-004: system prompt に分割検討済み宣言尊重ルールが含まれる
// Source: spec.md > Requirement: 分割検討済み宣言は縫い目 finding を抑制する
//         > Scenario: 宣言尊重ルールが system prompt に含まれる
// ---------------------------------------------------------------------------

describe("TC-004: request-review system prompt に分割検討済み宣言尊重ルールが含まれる", () => {
  it("分割検討済み宣言がある場合は縫い目 finding を上げない規則が含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/分割検討済み/);
  });

  it("宣言は理由付きであることが要件として示される", () => {
    // 理由必須 / 理由のない宣言は尊重しない / reason required などの言及
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/理由|reason/i);
  });

  it("宣言がある場合は縫い目 finding を上げないという文脈の記述が含まれる", () => {
    // finding を上げない / skip / suppress / 尊重 などの文脈
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/分割検討済み.{0,100}(finding|尊重|skip|上げない)/s);
  });
});

// ---------------------------------------------------------------------------
// TC-012: Method 6 が独立した観点として存在し、既存 Method 1–5 が保持される
// Source: tasks.md > T-03: request-review system prompt に縫い目判定 Method を追加
// ---------------------------------------------------------------------------

describe("TC-012: Method 6 が独立した観点として存在し、既存 Method 1–5 が保持される", () => {
  it("Method 6 または Granularity Seam 相当の見出しが含まれる", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/Method 6|Granularity Seam|縫い目判定/i);
  });

  it("既存の read-only 制約（ファイル編集禁止）が保持されている", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toMatch(/Do NOT modify|編集禁止|read-only/i);
  });

  it("approve / needs-discussion / reject の verdict 導出が保持されている", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("approve");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("needs-discussion");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("reject");
  });
});
