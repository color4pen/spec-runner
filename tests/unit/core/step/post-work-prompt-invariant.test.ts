/**
 * Post-work prompt invariant tests
 *
 * T-02: code-review post-work self-check — report_result 非包含の固定
 * T-03: main work turn 完了契約に typed findings 担保が残る確認（lock test）
 * T-04: 越境不変の機械的な歯 — 全 agent step post-work / follow-up prompt 走査
 *
 * 越境不変: post-work / rules follow-up prompt は tool call の生成・修正を指示してはならない。
 * post-work turn は tool call を捕捉しないため、typed tool result の修正指示は構造上無効である。
 * （agent-runner.ts の設計意図: postWorkPrompts turns で tool calls は intentionally NOT detected）
 *
 * NOTE: pipeline に captured typed tool を追加した場合は、禁止マーカー集合（FORBIDDEN_MARKERS）を拡張すること。
 * 現在の禁止マーカー: ["report_result"]
 */
import { describe, it, expect } from "vitest";
import { CodeReviewStep } from "../../../../src/core/step/code-review.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../../src/prompts/code-review-system.js";
import { CODE_REVIEW_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import { STANDARD_DESCRIPTOR, FAST_DESCRIPTOR } from "../../../../src/core/pipeline/registry.js";
import { buildRulesFollowUpPrompts } from "../../../../src/core/step/rules-followup-prompts.js";
import type { AgentStep, StepDeps } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// 禁止マーカー集合
// pipeline に captured typed tool を追加した場合はここを拡張すること。
// ---------------------------------------------------------------------------
const FORBIDDEN_MARKERS = ["report_result"];

function containsForbiddenMarker(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

// ---------------------------------------------------------------------------
// 共通ヘルパー
// ---------------------------------------------------------------------------

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(adr = false): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr,
    },
    slug: "test-slug",
  };
}

// ---------------------------------------------------------------------------
// T-02: code-review post-work self-check の固定テスト
// ---------------------------------------------------------------------------

describe("T-02: CodeReviewStep.followUpPrompt — report_result 非包含", () => {
  const prompt = CodeReviewStep.followUpPrompt ?? "";

  it("followUpPrompt が非空文字列として定義されている", () => {
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("followUpPrompt が report_result を含まない（大文字小文字無視）", () => {
    expect(containsForbiddenMarker(prompt)).toBe(false);
  });

  it("followUpPrompt が typed findings 提出・修正指示を含まない（findings 配列語）", () => {
    // typed-result 提出語: "findings 配列" / "[] を渡し" のいずれも含まれない
    expect(prompt).not.toMatch(/findings\s*配列/);
    expect(prompt).not.toMatch(/\[\]\s*を渡し/);
  });

  it("followUpPrompt が Markdown result file の Read 指示を保持している", () => {
    // Markdown 検査の観測挙動: review-feedback ファイルを Read tool で読む指示が残る
    expect(prompt).toContain("review-feedback");
    expect(prompt).toContain("Read tool");
  });

  it("followUpPrompt の検査項目番号が連番で欠番なし（1〜4）", () => {
    // 現行は 4 項目（Markdown テーブル形式・必須カラム・Fix カラム・severity 定義）
    expect(prompt).toContain("1.");
    expect(prompt).toContain("2.");
    expect(prompt).toContain("3.");
    expect(prompt).toContain("4.");
    // 5 番目以降がないこと（旧 item 5 は 4 に繰り上がり済み）
    expect(prompt).not.toContain("5.");
  });

  it("followUpPrompt が review-feedback ファイルの修正指示を保持している（Markdown 検査の action）", () => {
    expect(prompt).toContain("review-feedback ファイルを修正してください");
  });

  it("followUpPrompt が 'report_result findings を修正' という旧記述を含まない", () => {
    expect(prompt).not.toContain("report_result findings を修正");
  });
});

// ---------------------------------------------------------------------------
// T-03: main work turn 完了契約に typed findings 担保が残る（lock test）
// ---------------------------------------------------------------------------

describe("T-03: 完了契約（main work turn）が typed findings 担保を保持している", () => {
  describe("CODE_REVIEW_SYSTEM_PROMPT — typed findings 担保", () => {
    it("findings 配列を必ず含める旨の記述が存在する", () => {
      // main work turn の system prompt が findings 提出を要求している
      expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("findings");
      expect(CODE_REVIEW_SYSTEM_PROMPT).toMatch(/findings.*配列.*必ず|必ず.*findings.*配列/);
    });

    it("指摘がない場合は findings: [] を渡す旨の記述が存在する", () => {
      // 空 findings の指定も main work turn 完了契約で担保されている
      expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("findings: []");
    });
  });

  describe("CODE_REVIEW_REPORT_TOOL.description — findings REQUIRED", () => {
    it("description が 'findings' を REQUIRED として記述している", () => {
      // report tool description が findings 配列を REQUIRED と宣言している
      expect(CODE_REVIEW_REPORT_TOOL.description).toContain("REQUIRED");
      expect(CODE_REVIEW_REPORT_TOOL.description).toContain("findings");
      expect(CODE_REVIEW_REPORT_TOOL.description).toContain("REQUIRED when ok=true");
    });

    it("description が findings 配列の各要素スキーマを含む", () => {
      // severity / resolution / file / title / rationale が description に記述されている
      const desc = CODE_REVIEW_REPORT_TOOL.description;
      expect(desc).toContain("severity");
      expect(desc).toContain("resolution");
      expect(desc).toContain("file");
      expect(desc).toContain("title");
      expect(desc).toContain("rationale");
    });
  });
});

// ---------------------------------------------------------------------------
// T-04: 越境不変の機械的な歯 — 全 agent step post-work / follow-up prompt 走査
// ---------------------------------------------------------------------------

/**
 * 全 pipeline descriptor から agent step を列挙し、重複を排除して返す。
 * step 追加時に自動的に対象へ含まれる（step 名ハードコード列挙に非依存）。
 */
function collectUniqueAgentSteps(): AgentStep[] {
  const seen = new Set<string>();
  const steps: AgentStep[] = [];
  const allDescriptors = [STANDARD_DESCRIPTOR, FAST_DESCRIPTOR];

  for (const descriptor of allDescriptors) {
    for (const [, step] of descriptor.steps) {
      if (step.kind === "agent" && !seen.has(step.name)) {
        seen.add(step.name);
        steps.push(step);
      }
    }
  }
  return steps;
}

describe("T-04: 越境不変 — 全 agent step の post-work / follow-up prompt に report_result が含まれない", () => {
  const state = makeMinimalState();
  // adr: true で adr-gen の getFollowUpPrompt を発火させる（最小発火条件）
  const depsAdrTrue = makeMinimalDeps(true);
  const depsDefault = makeMinimalDeps(false);

  const agentSteps = collectUniqueAgentSteps();

  it("pipeline registry から agent step が 1 件以上列挙できる", () => {
    expect(agentSteps.length).toBeGreaterThan(0);
  });

  it("列挙した agent step に code-review が含まれる", () => {
    const names = agentSteps.map((s) => s.name);
    expect(names).toContain("code-review");
  });

  it("列挙した agent step に adr-gen が含まれる", () => {
    const names = agentSteps.map((s) => s.name);
    expect(names).toContain("adr-gen");
  });

  describe("各 agent step の post-work prompt が report_result を含まない", () => {
    for (const step of collectUniqueAgentSteps()) {
      // 静的 followUpPrompt の検査
      // TypeScript 非 null 保証のため変数に取り出してからクロージャに渡す
      const staticPrompt = step.followUpPrompt;
      if (staticPrompt !== undefined) {
        it(`${step.name}: 静的 followUpPrompt が report_result を含まない`, () => {
          expect(containsForbiddenMarker(staticPrompt)).toBe(false);
        });
      }

      // 動的 getFollowUpPrompt の検査
      const dynamicFn = step.getFollowUpPrompt;
      if (dynamicFn !== undefined) {
        // adr-gen は deps.request.adr === true で発火するため、両方で評価する
        it(`${step.name}: getFollowUpPrompt(adr=true) が report_result を含まない`, () => {
          const prompt = dynamicFn.call(step, state, depsAdrTrue);
          if (prompt !== undefined) {
            expect(containsForbiddenMarker(prompt)).toBe(false);
          }
        });

        it(`${step.name}: getFollowUpPrompt(adr=false) が report_result を含まない（undefined は skip）`, () => {
          const prompt = dynamicFn.call(step, state, depsDefault);
          if (prompt !== undefined) {
            expect(containsForbiddenMarker(prompt)).toBe(false);
          }
        });
      }
    }
  });

  describe("rules follow-up wrapper（buildRulesFollowUpPrompts）が report_result を含まない", () => {
    it("buildRulesFollowUpPrompts の生成する定型枠に report_result が含まれない", () => {
      // sample rule content（ツール指示を含まない通常の規約文）でラップ文言を検査する
      const sampleRuleContent = "コードの可読性を保ってください。変数名は意味のある名前にすること。";
      const wrapped = buildRulesFollowUpPrompts([sampleRuleContent]);
      expect(wrapped.length).toBe(1);
      const wrappedFirst = wrapped[0] ?? "";
      expect(containsForbiddenMarker(wrappedFirst)).toBe(false);
    });

    it("buildRulesFollowUpPrompts が空配列を渡した場合は空配列を返す", () => {
      const result = buildRulesFollowUpPrompts([]);
      expect(result).toEqual([]);
    });

    it("buildRulesFollowUpPrompts の定型枠が rule content を <rule> タグで囲む", () => {
      const sampleRuleContent = "規約テスト内容";
      const wrapped = buildRulesFollowUpPrompts([sampleRuleContent]);
      expect(wrapped[0]).toContain("<rule>");
      expect(wrapped[0]).toContain("</rule>");
      expect(wrapped[0]).toContain(sampleRuleContent);
    });
  });
});
