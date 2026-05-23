/**
 * rules-followup-prompts.ts — rule ファイル内容を wrap 文言付き follow プロンプトに変換。
 *
 * Design D5: CLI は枠組み (修正範囲 / stop 条件 / 意図解釈の余地) だけ与える。
 * wrap 文言は 3 要素に限定。3 要素以外の wrap を追加する変更は新 ADR を必要とする。
 * pure function — no I/O.
 */

const WRAP_PREFIX = "以下の project 規約に基づいて、直前の作業結果を確認してください。";

const WRAP_SUFFIX = [
  "- 修正範囲: この規約に関連するファイルのみ修正してください。関係のないファイルには触れないでください。",
  "- stop 条件: この規約に対する違反がなければ、何も変更せず end_turn してください。",
  "- 意図解釈: 書かれた言葉をそのまま機械的に適用するのではなく、規約の意図を汲んで判断してください。",
].join("\n");

/**
 * Wrap each rule content string in the 3-element CLI wrapper and return as a prompt array.
 *
 * Empty input → empty output (no prompts).
 */
export function buildRulesFollowUpPrompts(ruleContents: string[]): string[] {
  return ruleContents.map((ruleContent) => buildSinglePrompt(ruleContent));
}

function buildSinglePrompt(ruleContent: string): string {
  return [
    WRAP_PREFIX,
    "",
    "<rule>",
    ruleContent,
    "</rule>",
    "",
    WRAP_SUFFIX,
  ].join("\n");
}
