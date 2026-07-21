# Tasks: judge 判定チャネルの typed findings 一本化と evidence report 化

実装は既存挙動（routing / verdict 導出）を不変に保ちつつ、prompt・template・content-format gate の文言と構造のみを変更する。**`src/core/step/judge-verdict.ts` と `src/core/step/__tests__/judge-verdict.test.ts` には手を入れない**（routing 不変の証明）。report tool の zod スキーマ（`src/core/step/report-tool.ts` / `src/core/port/report-result.ts`）も変更しない。

## T-01: judge-rules.ts に severity 単一ソースを追加し、VERDICT_BLOCKING_RULES を更新する

- [x] `src/prompts/judge-rules.ts` に `SEVERITY_DEFINITION` を新設する。文言は既存 code-review/regression-gate/custom-reviewer の Completion 節と同一にする（churn 最小化）:
  - `**Severity 定義**:` / `- \`critical\`: 本番障害、データ損失、セキュリティ侵害に直結` / `- \`high\`: 機能不全、明確なバグ、回避策なし` / `- \`medium\`: 品質低下、保守性問題、将来のリスク` / `- \`low\`: 情報提供、スタイル、微小な改善`
- [x] `src/prompts/judge-rules.ts` に `REQUEST_REVIEW_SEVERITY_DEFINITION` を新設する。文言は既存 request-review-system.ts の Output Format 節と同一にする:
  - `**Severity 定義**（request-review スコープ）:` / `- \`high\`: リクエストレベルの欠陥（目標が不明確、受け入れ基準が未テスト、外部制約が未指定、現状コード断定と実コードの不一致）` / `- \`medium\`: スコープの曖昧さ、推奨追加` / `- \`low\`: 明確さの改善、表現の改良`
- [x] `VERDICT_BLOCKING_RULES` から末尾の findings-priority 段落（「markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。」）を削除する。blocking rules 本体（decision-needed → escalation / critical|high → needs-fix / else → approved）は不変。
- [x] judge-rules.ts が project-internal import を持たない leaf 構造を維持する（循環依存を作らない）。

**Acceptance Criteria**:
- `SEVERITY_DEFINITION` / `REQUEST_REVIEW_SEVERITY_DEFINITION` が export され、既存文言と一致する。
- `VERDICT_BLOCKING_RULES` に「findings 由来の導出が優先」「verdict 行は人間向けの要約」に相当する文言が存在しない。
- `VERDICT_BLOCKING_RULES` は decision-needed → escalation / critical|high → needs-fix の対応を引き続き含む。

## T-02: PIPELINE_RULES から死装置を削除し severity を単一ソース化する

- [x] `src/prompts/fragments.ts` の `PIPELINE_RULES` から `## Scoring`（Score 基準表・Weight 表・`Total = Σ(Score × Weight)`・承認閾値 7.0）セクションを削除する。
- [x] `## Iteration Comparison`（Improvements / Regressions / Unchanged Issues）と `### Convergence Trend`（improving / plateaued / regressing・plateau 2 連続 escalation）セクションを削除する。
- [x] `## Findings Format`（7 列 Markdown 表指示「全エージェントは findings を以下のテーブル形式で返す」）セクションを削除する。
- [x] `## Severity` 表（`| Severity | 定義 | 対応 |` の hardcoded 表）を削除する。severity は各 prompt が judge-rules.ts の定数を埋め込む（T-04）。
- [x] `## Categories` / `## Verdict`（informational な verdict 3 値の意味説明）と `${VERDICT_BLOCKING_RULES}` の埋め込みは保持する。`## Verdict` セクションに verdict 行を書けという出力指示を追加しないこと。

**Acceptance Criteria**:
- `PIPELINE_RULES` を Score / Weight / Total / Convergence Trend / plateau で grep して 0 件。
- `PIPELINE_RULES` に 7 列 findings 表 header（`# | Severity | Category | File | Description | How to Fix | Fix`）が存在しない。
- `PIPELINE_RULES` に severity 定義の文言（例「本番障害、データ損失、セキュリティ侵害に直結」）が hardcoded で存在しない。
- `PIPELINE_RULES` は `VERDICT_BLOCKING_RULES` を引き続き含む。

## T-03: judge 系 result template を evidence report に再定義する

- [x] `src/templates/step-output-templates.ts` の `REQUEST_REVIEW_RESULT_TEMPLATE` / `SPEC_REVIEW_RESULT_TEMPLATE` / `REVIEW_FEEDBACK_TEMPLATE` / `CONFORMANCE_RESULT_TEMPLATE` を evidence report 構造に書き換える。各 template の必須セクション:
  - `## 検証した項目`（Verified — 何をどう確認したか。読んだファイル・辿った Scenario・確認したコマンド出力等）
  - `## 検証できなかった項目`（Unverified — 確認できなかった項目と理由。無ければ `None`）
  - `## Findings 詳細`（typed findings の補足説明。無ければ `None`）
- [x] 各 template から `- **verdict**:` placeholder、verdict-format HTML コメントブロック、7 列 findings 表、Scores 表、`- **total**:`、`- **iteration**:` を削除する。
- [x] 各 template の HTML コメントに次を明記する: 「verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。findings は `report_result`（typed）で報告し、この file はその補足の evidence report である」。
- [x] `VERDICT_BLOCKING_RULES` の template への埋め込みは削除する（evidence report は verdict 判定を語らない）。
- [x] `getOutputTemplates` の step→template マッピングと A-group 配置ロジックは変更しない（template の内容のみ変更）。

**Acceptance Criteria**:
- 4 template すべてに `## 検証した項目` と `## 検証できなかった項目` が存在する。
- 4 template すべてに `- **verdict**:` placeholder と 7 列表 header が存在しない。
- `getOutputTemplates("code-review", …)` 等が引き続き対応 template を返す。

## T-04: judge prompt の verdict 行指示を削除し severity を単一ソース埋め込みに置換する

- [x] `src/prompts/spec-review-system.ts`: system prompt から verdict 行要求を削除する。Completion 節の inline severity bullet を `${SEVERITY_DEFINITION}` に置換する。initial message template の「The file MUST contain a verdict line: …」行を削除する。「Write your evidence report to」指示に改める。
- [x] `src/prompts/request-review-system.ts`: Output Format 節の verdict 行要求を削除する。inline の request スコープ severity を `${REQUEST_REVIEW_SEVERITY_DEFINITION}` に置換する。「Report your completion result with { ok: true, verdict: … }」を `{ ok: true, findings: [...] }` に改める。`buildRequestReviewInitialMessage` の verdict 行指示を削除／findings 報告に改める。
- [x] `src/prompts/code-review-system.ts`: 「The verdict line MUST be exactly: …」と Scores 表への言及を削除する。Output Format 節を evidence report 指示に改める。Completion 節の inline severity bullet を `${SEVERITY_DEFINITION}` に置換する。
- [x] `src/prompts/conformance-system.ts`: Output Format 節の verdict 行要求を削除し、evidence report 指示に改める。severity 定義（`${SEVERITY_DEFINITION}`）を Resolution 定義の近傍に追加する。
- [x] `src/prompts/regression-gate-system.ts`: Completion 節の inline severity bullet を `${SEVERITY_DEFINITION}` に置換する。
- [x] `src/prompts/custom-reviewer-system.ts`: 「The verdict line MUST be exactly: …」を削除し、evidence report 指示に改める。Completion 節の inline severity bullet を `${SEVERITY_DEFINITION}` に置換する。
- [x] 各 prompt で `DECISION_NEEDED_DEFINITION` / `OBSERVATION_DEFINITION` の埋め込み・「CLI が findings 配列から verdict を決定します」旨の注記は保持する。

**Acceptance Criteria**:
- 全 judge system prompt の rendered 文字列を `**verdict**` の出力指示・「required for machine parsing」で grep して 0 件。
- 各 judge prompt が該当する severity 定数（`SEVERITY_DEFINITION` / request-review は `REQUEST_REVIEW_SEVERITY_DEFINITION`）を埋め込む。
- 各 judge prompt のソースに severity 定義の文言（bullet list）が hardcoded で存在しない。

## T-05: judge step の initial message から verdict 行指示を削除する

- [x] `src/core/step/code-review.ts` `buildCodeReviewInitialMessage`: 「The file MUST contain a verdict line: …」行を削除する。step 6「Write your findings and verdict to」→ evidence report を書く指示に改める。
- [x] `src/core/step/conformance.ts` `buildMessage`: 「The file MUST contain a verdict line: …」行を削除する。step 8「Write your findings and verdict to」→ evidence report を書く指示に改める。
- [x] `src/core/step/custom-reviewer.ts` `buildCustomReviewerMessage`: 「The file MUST contain a verdict line: …」行を削除する。step 5「Write your findings and verdict to」→ evidence report を書く指示に改める。
- [x] `src/core/step/regression-gate.ts` `buildMessage`: 「The file MUST contain a verdict line: …」行を削除する。step 6「Write your result to」を evidence report を書く指示に整合させる。
- [x] initial message の commit/push 案内（「ファイルを worktree に書き出したら…」）は変更しない。

**Acceptance Criteria**:
- 4 step の initial message builder の出力文字列を `**verdict**` の出力指示で grep して 0 件。
- 各 initial message は引き続き findings を `report_result` で報告する誘導を含む。

## T-06: code-review の content-format gate を evidence セクション存在チェックに置換する

- [x] `src/core/step/code-review.ts` `CodeReviewStep.outputContracts` の content-format `checks` を差し替える。削除: separator row check（`\|[-:]+\|`）と 7 列 header check。追加（`policy: "follow-up"` 維持）:
  - label「Verified section present (## 検証した項目)」 / pattern `##\\s+検証した項目`
  - label「Unverified section present (## 検証できなかった項目)」 / pattern `##\\s+検証できなかった項目`
- [x] contract の `kind: "content-format"` / `path`（review-feedback path）/ `policy: "follow-up"` は不変。
- [x] `evaluateContentFormatChecks` / `validateStepOutputs` / `output-verify.ts` のロジックは変更しない（宣言的 check の差し替えのみ）。

**Acceptance Criteria**:
- `CodeReviewStep.outputContracts` が返す check に 7 列 header（`# / Severity / Category / File / Description / How to Fix / Fix`）を検証するものが存在しない。
- 検証した項目 / 検証できなかった項目セクションを持つ review-feedback は違反 0、欠く場合は follow-up 違反（欠落 label 付き）。

## T-07: テストを追加／更新して受け入れ基準を機械固定する

- [x] evidence report template テスト（`src/templates/__tests__/step-output-templates.test.ts`）を更新: 4 template が `## 検証した項目` / `## 検証できなかった項目` を含み、`- **verdict**:` placeholder と 7 列表 header を含まないことを固定する。旧 assertion を削除／置換する。
- [x] `tests/templates/step-output-templates.test.ts` の 7 列表 assertion（SPEC_REVIEW / REVIEW_FEEDBACK）を evidence report 構造の assertion に更新する。
- [x] PIPELINE_RULES テスト（`tests/unit/prompts/fragments.test.ts`）を更新: Scoring（TC-05）・Iteration Comparison / Convergence Trend（TC-07）・Findings Format 7 列（TC-04）・Severity 表（TC-02）の assertion を削除／新契約に更新する。Score / Weight / Total / Convergence Trend / plateau が 0 件であることを固定する negative test を追加する。
- [x] fragment-coverage テスト（`src/prompts/__tests__/fragment-coverage.test.ts`）を更新: VERDICT_BLOCKING_RULES の「findings 由来の導出が優先」assertion を削除する。
- [x] code-review gate テスト（`tests/unit/step/content-format-detection.test.ts` T-06、`tests/unit/step/code-review.test.ts` の content-format 系）を更新: fixture を evidence report 形式に置換し、gate が evidence セクションを検証し 7 列表を検証しないことを固定する。
- [x] **`src/core/step/__tests__/judge-verdict.test.ts` は無改変で green を維持する**（変更しない）。

**Acceptance Criteria**:
- 追加/更新した全テストが green。
- severity 文言が judge-rules.ts のみに存在することがテストで固定されている。
- evidence report 必須セクションの存在・7 列表チェック不在・`**verdict**` 出力指示 0 件がテストで固定されている。
- `judge-verdict.test.ts` は diff なしで green。

## T-08: 破れる既存テスト・mock を整合させ、全 gate を green にする

- [x] `tests/helpers/pipeline-mock-client.ts`: judge step の result md 生成（verdict 行 + 7 列表）を evidence report 形式に更新し、code-review content-format gate を通す統合テストが green を保つようにする。routing は typed toolResult 由来のため、mock の toolResult（findings）契約は変更しない。
- [x] 旧チャネル契約を固定する他のテスト（`tests/unit/step/agent-definition.test.ts`、`src/prompts/__tests__/fragment-coverage.test.ts` 等で verdict 行文字列や 7 列表・Scoring を assert している箇所）を新契約に合わせて更新する。
- [x] `pipeline.ts` の CLI stdout loop verdict 行表示（`[iter N/M] … approved`）と `cli-stdout-snapshot.test.ts` / `pipeline.loop-iter-stdout.test.ts` / `job-stats` の Convergence 列は **変更しない**（md verdict 行とは別チャネル）。

**Acceptance Criteria**:
- `bun run typecheck` が green。
- `bun run test`（全 suite）が green。
- CLI stdout 関連テスト（cli-stdout-snapshot / loop-iter-stdout / job-stats）が無改変で green。

## T-09: 最終検証

- [x] `bun run typecheck && bun run test` を実行し green を確認する。
- [x] 受け入れ基準の grep を手動確認する:
  - judge prompt / initial message / result template に `**verdict**` の出力指示が 0 件。
  - `PIPELINE_RULES` に Score / Weight / Total / Convergence Trend / plateau が 0 件。
  - severity 定義の文言が judge-rules.ts のみ。
- [x] `git diff` で `src/core/step/judge-verdict.ts` と `src/core/step/__tests__/judge-verdict.test.ts` に変更が無いことを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 上記 grep 3 点がすべて 0 件／単一ソースを満たす。
- verdict 導出ロジックとそのテストに diff が無い。
