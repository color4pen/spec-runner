# Spec: judge 判定チャネルの typed findings 一本化と evidence report 化

このファイルは本変更の自己完結 spec である。Layer-1 の振る舞い（型・FSM 構造が自動では強制しない選択）を記述する。用語:

- **judge 系 step**: request-review / spec-review / code-review / conformance / regression-gate / custom-reviewer。
- **verdict 行**: result md 内の `- **verdict**: <value>` 形式の行。
- **typed findings**: `report_result` tool（`JUDGE_REPORT_TOOL` 等）で報告される構造化 `findings` 配列。
- **evidence report**: agent が何をどう確認し、何を確認できなかったかを記録する人間可読な result md。

## Requirements

### Requirement: judge 系の prompt・message・template は verdict 行の出力を要求しない

judge 系 step の system prompt・initial message・result template は、md verdict 行（`- **verdict**:`）の出力を agent に要求してはならない（MUST NOT）。「required for machine parsing」に相当する機械要求も含めない。agent は verdict を自己集計せず、finding 単位のラベル付けのみを行う。verdict の集計は CLI の決定的関数が行う。

#### Scenario: judge prompt 群に verdict 行の出力指示が存在しない

**Given** 全 judge 系 step の system prompt・initial message builder・result template の出力文字列
**When** `**verdict**` の出力指示（verdict 行を書けという要求）を grep する
**Then** 該当は 0 件である

#### Scenario: verdict 行なしの result md でも routing が成立する

**Given** ある judge step が typed findings を報告し、result md に verdict 行を含めない
**When** CLI が verdict を導出する
**Then** verdict は typed findings のみから決定され、md の内容に依存しない

### Requirement: judge 系 result template は evidence report である

judge 系 result template（request-review / spec-review / code-review / conformance）は、次の必須セクションを持つ evidence report でなければならない（MUST）: 「検証した項目」（何をどう確認したか）、「検証できなかった項目」（unverified — 無い場合は None と明記）、「Findings 詳細」（typed findings の補足説明）。7 列 Markdown findings 表・Scores 表・total 行・verdict 行の要求は template に含めてはならない（MUST NOT）。findings の正典は typed toolResult のみである。

#### Scenario: evidence report template が必須セクションを持つ

**Given** judge 系 result template（`REVIEW_FEEDBACK_TEMPLATE` 等）
**When** template の内容を検査する
**Then** 「検証した項目」セクションと「検証できなかった項目」セクションが存在する

#### Scenario: evidence report template が 7 列 findings 表を要求しない

**Given** judge 系 result template
**When** template の内容を検査する
**Then** `# | Severity | Category | File | Description | How to Fix | Fix` の 7 列表 header と verdict 行 placeholder が存在しない

### Requirement: code-review の content-format gate は evidence セクションを検証する

code-review の content-format output gate は、evidence report の必須セクション（検証した項目 / 検証できなかった項目）の存在を検証しなければならない（MUST）。7 列表 header の存在チェックを含めてはならない（MUST NOT）。gate の目的（空・形骸レポートの機械検出）と `policy: "follow-up"` は維持する。

#### Scenario: 必須セクションを持つ evidence report は gate を通過する

**Given** 検証した項目・検証できなかった項目セクションを持つ review-feedback ファイル
**When** `validateStepOutputs` が content-format contract を評価する
**Then** violation は 0 件である

#### Scenario: 必須セクションを欠く result は follow-up violation になる

**Given** 検証した項目セクションを欠く review-feedback ファイル
**When** `validateStepOutputs` が content-format contract を評価する
**Then** `policy: "follow-up"` の violation が 1 件返り、欠落セクションの label を含む

#### Scenario: gate は 7 列表 header をチェックしない

**Given** code-review の `outputContracts` が返す content-format check 群
**When** check の label / pattern を検査する
**Then** 7 列表 header（`# / Severity / Category / File / Description / How to Fix / Fix`）を検証する check は存在しない

### Requirement: PIPELINE_RULES は死装置を含まない

`PIPELINE_RULES` fragment は、Scoring（Score 基準 / Weight / Total）と、score 差分に基づく Iteration Comparison / Convergence Trend / plateau 検出の指示を含んではならない（MUST NOT）。CLI 実装が実際に行わない処理を agent に指示する文言を残さない。7 列 Markdown findings 表を出力させる指示も含めてはならない（MUST NOT）。

#### Scenario: PIPELINE_RULES にスコアリング・停滞検出が存在しない

**Given** `PIPELINE_RULES` の文字列
**When** Score / Weight / Total / Convergence Trend / plateau を grep する
**Then** 該当は 0 件である

### Requirement: severity 定義は judge-rules.ts に単一ソース化される

severity 定義の文言は `src/prompts/judge-rules.ts` のみに存在しなければならない（MUST）。各 judge prompt は severity 定義を単一ソースからの埋め込みで参照し、prompt ファイル内に severity 定義の重複を持ってはならない（MUST NOT）。`DECISION_NEEDED_DEFINITION` と同じ埋め込みパターンに従う。

#### Scenario: 各 judge prompt が単一ソースの severity を埋め込む

**Given** 各 judge system prompt の rendered 文字列
**When** severity 定義を検査する
**Then** 定義は judge-rules.ts の単一ソース定数（汎用は `SEVERITY_DEFINITION`、request-review は `REQUEST_REVIEW_SEVERITY_DEFINITION`）の埋め込みに由来し、prompt 固有の重複定義は存在しない

#### Scenario: severity 文言が judge-rules.ts 以外に存在しない

**Given** prompt / fragment のソース（`PIPELINE_RULES` を含む）
**When** severity 定義の文言を検査する
**Then** severity 定義の文言は judge-rules.ts のみに存在し、他のソースは定数を参照するのみである

### Requirement: verdict 導出（routing）は不変である

本変更は verdict 導出ロジック・typed findings の完了契約・verdict 3 値（approved / needs-fix / escalation、request-review は approve / needs-discussion）の意味を変更してはならない（MUST NOT）。`deriveJudgeVerdict` 系の導出は既存の振る舞いを保持する。

#### Scenario: 既存の verdict 導出テストが無改変で green

**Given** `src/core/step/__tests__/judge-verdict.test.ts` 等の verdict 導出テスト
**When** 本変更後にテストを実行する
**Then** テストは無改変で green である（routing 不変の証明）

#### Scenario: findings から導出される verdict が変わらない

**Given** critical/high または decision-needed を含む findings 集合と ok=true
**When** `deriveJudgeVerdict` を適用する
**Then** critical/high ≥ 1 → needs-fix、decision-needed ≥ 1 → escalation、それ以外 → approved の対応が保たれる
