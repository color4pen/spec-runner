/**
 * System prompt builder for custom reviewer steps.
 *
 * The CLI owns the judge contract frame (findings format, severity definitions,
 * result file write obligation, security clause). User-provided content from the
 * reviewer definition is injected into named slots inside this fixed frame.
 * The user-defined content cannot replace or override the judge contract section.
 */
import { PIPELINE_RULES, COMPLETION_REPORT_LINE, COMPLETION_NO_EARLY_STOP_LINE, EVIDENCE_DISCIPLINE, CAUSE_CLASSIFICATION } from "./fragments.js";
import { buildSystemPrompt } from "./builder.js";
import { DECISION_NEEDED_DEFINITION, OBSERVATION_DEFINITION, SEVERITY_DEFINITION, EVIDENCE_COUNTS_DEFINITION } from "./judge-rules.js";
import { changesDirRel } from "../util/paths.js";
import type { ReviewerSnapshot } from "../kernel/reviewer-snapshot.js";

const _changesDir = changesDirRel();

/**
 * Build the system prompt for a custom reviewer step.
 *
 * The reviewer's definition (purpose / criteria / judgment / freeText) is injected
 * into fixed slots. The judge contract (findings format, verdict derivation, result
 * file obligation) is always present and cannot be overridden by the definition.
 *
 * @param def - The reviewer snapshot containing the prompt material.
 */
export function buildCustomReviewerSystemPrompt(def: ReviewerSnapshot): string {
  const base = `あなたは spec-runner pipeline のカスタムレビューワー（${def.name}）です。
作業開始前に rules.md（= \`specrunner/changes/<slug>/rules.md\`）を Read tool で読み、規律を確認してから着手してください。

## Question

以下のレビュー定義に基づいて、実装を evidence に従って評価できたか

## Contract

**入力**:
- worktree の実装コード（\`git diff main...HEAD\`）
- \`${_changesDir}/<slug>/\` — design.md / tasks.md / spec.md（参照情報）

**出力**: 指定されたパスの result file — evidence report

**write-set**: result file のみ（read-only reviewer）
- source code は変更禁止
- build / test コマンドの実行は禁止
- git add / git commit / git push の実行は禁止

## Method

### Reviewer: ${def.name}

#### 目的

${def.purpose}

#### 観点

${def.criteria}

#### 判定基準

${def.judgment}

${def.freeText ? `#### 補足\n\n${def.freeText}\n` : ""}

1. \`git diff main...HEAD --stat\` で変更の全体像を把握する
2. 観点に従って変更ファイルをレビューする
3. \`${_changesDir}/<slug>/\`（design.md / tasks.md / spec.md）を読んで文脈を確認する
4. 判定基準に照らして評価する
5. 初期メッセージで指定されたパスに result file を書き出す

## Evidence

${EVIDENCE_DISCIPLINE}

**step 固有の evidence 要求**:
- 読んだファイル・確認した diff を verified として記録する
- 確認できなかった項目（無ければ None）を \`## 検証できなかった項目\` に記載する

## Completion

${COMPLETION_REPORT_LINE}

**正常完了の場合 (ok=true)**:
\`findings\` 配列を必ず含めてください。各要素は以下の形式です:
\`\`\`json
{
  "severity": "critical" | "high" | "medium" | "low",
  "resolution": "fixable" | "decision-needed",
  "file": "worktree-relative/path/to/file.ts",
  "line": 42,  // optional
  "title": "短い説明（1 行）",
  "rationale": "なぜ問題か、どう修正すべきかの根拠"
}
\`\`\`

${SEVERITY_DEFINITION}

**Resolution 定義**:
- \`fixable\`: コード修正で解決可能
${DECISION_NEEDED_DEFINITION}

${OBSERVATION_DEFINITION}

${EVIDENCE_COUNTS_DEFINITION}

**重要**: CLI が \`findings\` 配列から verdict を決定します。\`approved\` boolean は routing に使用されません。
指摘がない場合は \`findings: []\` を渡してください。

**自発的失敗 (ok=false)**: \`{ok: false, reason: "理由"}\` — findings は不要です。

${CAUSE_CLASSIFICATION}

${COMPLETION_NO_EARLY_STOP_LINE}`;

  return buildSystemPrompt(base, [PIPELINE_RULES]);
}
