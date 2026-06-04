# Spec: 各 step が入出力を宣言し、実行前に入力の存在を検証する

## Requirements

### Requirement: 各 step は読み書きするファイルを宣言する

各 pipeline step は、自身が読む入力（`reads`）と書く出力（`writes`）を、解決済みのファイル path として宣言 SHALL する。宣言は `util/paths` の既存関数を参照 / そこから導出し、`util/paths` の関数および既存の使い手の呼び出し箇所を変更してはならない（MUST NOT）。`{n}`（反復番号）は job state 由来の iteration に解決される。

#### Scenario: 全 step が reads / writes を宣言している

**Given** 標準 pipeline の 12 step
**When** 各 step の `reads(state, deps)` / `writes(state, deps)` を呼ぶ
**Then** いずれの step も `IoRef[]`（`path` を持つ要素の配列。入力なしの step は空配列）を返す

#### Scenario: 宣言は util/paths を参照して path を導出する

**Given** `code-review` step が iteration 2 の state で実行される
**When** `code-review.writes(state, deps)` を呼ぶ
**Then** 返る `path` は `reviewFeedbackPath(slug, 2)` と一致する（`util/paths` 由来）

### Requirement: `{n}` は job state の iteration に解決される

自 step の `writes` の `{n}` は現在の反復（過去実行回数 + 1）に、他 step の出力を読む `reads` の `{n}` はその producer step の最新反復に解決 SHALL される。解決規約は既存 path helper の規約（`conformanceResultPath(slug, iteration)` 等）に一致しなければならない（MUST）。

#### Scenario: writes は自 step の次反復に解決される

**Given** `code-review` が過去 1 回実行された state（`steps["code-review"].length === 1`）
**When** `code-review.writes(state, deps)` を解決する
**Then** path の iteration は 2（過去実行回数 1 + 1）になる

#### Scenario: reads は producer の最新反復に解決される

**Given** `code-review` が過去 2 回実行された state（`steps["code-review"].length === 2`）
**When** `code-fixer.reads(state, deps)` を解決する
**Then** path は `reviewFeedbackPath(slug, 2)`（producer の最新反復）になる

### Requirement: step 実行前に必須入力の存在を検証する

step 実行の直前に、宣言された `reads` のうち `required` な入力の存在を検証 SHALL する。欠落している場合は、agent / CLI 本体を起動する前に、欠落した path を含む明示エラー（code `STEP_INPUT_MISSING`）で停止しなければならない（MUST）。検証は各 runtime が所有する artifact の在処に対して行われ、local と managed で整合する。

#### Scenario: 必須入力が存在すれば step は実行される

**Given** `code-fixer` の必須入力 `review-feedback-{latest}.md` が artifact の在処に存在する
**When** executor が `code-fixer` を実行しようとする
**Then** 事前検証は通過し、step 本体が実行される

#### Scenario: 必須入力が欠落していれば明示エラーで停止する

**Given** `code-fixer` の必須入力 `review-feedback-{latest}.md` が在処に存在しない
**When** executor が `code-fixer` を実行しようとする
**Then** step 本体（agent session）を起動する前に `STEP_INPUT_MISSING` で停止し、エラーは欠落した path を含む

#### Scenario: 検証は両 runtime で同じ宣言 path を対象にする

**Given** ある step の必須 file 入力 `p`
**When** local runtime と managed runtime でそれぞれ事前検証が走る
**Then** local は worktree 上の `p` を、managed は branch git state 上の `p` を検証し、対象 path は同一である

### Requirement: 直し工程の state 逆引き halt を宣言入力＋事前検証へ置換する

`code-fixer` / `build-fixer` / `spec-fixer` は、直前の成果物の在処を job state から逆引き（`getLatestStepResult(...).findingsPath`）して無ければ halt する方式を廃止 SHALL する。入力 path は宣言と同一の純粋導出で計算し、存在保証は事前検証に委ねなければならない（MUST）。これにより「探して見つからず halt」のクラスが消える。

#### Scenario: code-fixer は state 逆引きせず宣言由来の path を使う

**Given** `code-review` が完了し review-feedback が在処に存在する state
**When** `code-fixer.buildMessage(state, deps)` を呼ぶ
**Then** prompt に埋め込まれる findings path は `reviewFeedbackPath(slug, latestIteration)` であり、`getLatestStepResult` の逆引き結果に依存しない

#### Scenario: 旧 halt error code が廃止される

**Given** 本変更適用後のコードベース
**When** `code-fixer` / `build-fixer` の実装を確認する
**Then** `CODE_FIXER_NO_REVIEW_RESULT` / `BUILD_FIXER_NO_VERIFICATION_RESULT` による halt は存在せず、欠落時の停止は `STEP_INPUT_MISSING` 経由となる

### Requirement: 標準 pipeline の挙動は不変である

本変更は標準 pipeline の実行・画面出力・PR を変えてはならない（MUST NOT）。`util/paths` の関数とその使い手の呼び出し箇所、および副作用クラス・cache・並列分岐は導入しない。

#### Scenario: 標準フローで事前検証は素通りする

**Given** 標準 pipeline の正常経路（各 step に到達する時点で producer が先行実行済み）
**When** 各 step の事前検証が走る
**Then** すべての必須入力が在処に存在し、検証は halt を起こさず、step 実行順序と画面出力が従来と一致する

#### Scenario: util/paths とその使い手は不変

**Given** 本変更適用後のコードベース
**When** `src/util/paths.ts` と既存の使い手（`getOutputTemplates` 等）を確認する
**Then** 関数シグネチャと呼び出し箇所は変更されておらず、step 宣言はそれらを参照して path を導出している
