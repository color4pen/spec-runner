# Spec: postwork-no-tool-fix

## Requirements

### Requirement: code-review post-work self-check は Markdown result file のみを検査・修正する

`CodeReviewStep` の `followUpPrompt`（post-work self-check）は、出力した review-feedback（Markdown）ファイルの形式検査・修正のみを指示する MUST。`report_result`（captured typed tool result）の提出確認・修正を指示する記述を含んでは**ならない** MUST NOT。

self-check の確認項目は Markdown ファイルに対して検証可能なもの（テーブル形式・必須カラム・Fix カラム値・Severity 定義準拠）に限定される。違反があれば review-feedback ファイルを修正し、なければ変更せず end_turn する。

#### Scenario: post-work self-check の文面が report_result 修正を指示しない

- **Given** `CodeReviewStep.followUpPrompt` の文字列
- **When** その内容を検査する
- **Then** `report_result` という語を含まず、typed findings の提出・修正を指示する記述も含まない

#### Scenario: Markdown 形式違反が post-work で修正される

- **Given** code-review agent が review-feedback ファイルを出力し、Fix カラムが空欄の finding が存在する
- **When** `followUpPrompt` の post-work self-check が実行される
- **Then** review-feedback ファイル（Markdown）を `Edit` で修正して Fix カラムを `yes` / `no` で埋める

#### Scenario: Markdown 形式違反がない場合は変更せず終了する

- **Given** review-feedback ファイルが全 Markdown 検査項目を満たしている
- **When** `followUpPrompt` の post-work self-check が実行される
- **Then** ファイルを変更せず end_turn する

### Requirement: typed findings の正当性は main work turn の完了契約が担保する

code-review の typed findings（必須フィールド、指摘なしなら空配列 `[]`）の正当性は、`report_result` が登録・捕捉される唯一の turn である main work turn の完了契約——system prompt の Completion セクションおよび report tool description——が担保する MUST。この担保は post-work turn に依存しては**ならない** MUST NOT。

#### Scenario: 完了契約が findings 配列の必須性と空配列規約を明示する

- **Given** code-review の main work turn 完了契約（`CODE_REVIEW_SYSTEM_PROMPT` の Completion セクションと `CODE_REVIEW_REPORT_TOOL.description`）
- **When** その内容を検査する
- **Then** 正常完了時に `findings` 配列を提出すること、および指摘がない場合は空配列 `[]` を渡すことが記述されている

#### Scenario: 指摘なしの完了で空の findings が受理される

- **Given** code-review agent が main work turn で指摘なしと判断した
- **When** agent が `report_result` を `findings: []` で呼ぶ
- **Then** CLI は空 findings から `approved` verdict を導出する（既存挙動、不変）

### Requirement: post-work / follow-up prompt は captured tool の呼び出し・修正を指示しない（越境不変）

全 agent step の post-work / follow-up prompt（`followUpPrompt` および `getFollowUpPrompt` の返す文字列）は、post-work turn で捕捉されない captured tool（`report_result`）の呼び出し・提出・修正を指示しては**ならない** MUST NOT。この不変条件は機械的なテストで固定される MUST。

`Edit` / `Write` / `Read` / `Bash` / `Grep` / `Glob` など post-work turn でも有効な標準 tool への言及はこの不変条件に違反しない。

#### Scenario: 全 agent step の post-work prompt が禁止マーカーを含まない

- **Given** pipeline registry に登録された全 agent step
- **When** 各 step の `followUpPrompt` と `getFollowUpPrompt(state, deps)`（発火条件を満たす入力で評価）を収集する
- **Then** いずれの文字列も `report_result`（大文字小文字無視）を含まない

#### Scenario: post-work prompt に report_result 指示を追加すると歯が fail する

- **Given** 越境不変を固定する機械的テスト
- **When** いずれかの agent step の post-work / follow-up prompt に `report_result` の呼び出し・修正を指示する語が混入する
- **Then** そのテストは fail する（退行を fail-closed に検出する）
