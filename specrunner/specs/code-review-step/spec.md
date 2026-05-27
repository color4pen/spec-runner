## Purpose

TBD

## Requirements

### Requirement: code-review step は出力フォーマットの self-check pass を実行する

`CodeReviewStep` は MUST `followUpPrompt` を持ち、作業 turn 完了後に同一 session 内で self-check を実行する。

self-check の確認項目:

1. **テーブル形式**: Findings セクションが `| # | Severity | Category | File | Description | How to Fix | Fix |` のテーブル形式で記述されているか（散文形式・リスト形式は不可）
2. **必須カラム**: `#` / `Severity` / `Category` / `File` / `Description` / `How to Fix` / `Fix` の 7 カラムが全て存在するか
3. **Fix カラム値**: 全 finding の Fix カラムが `yes` または `no` のいずれかで記入されているか（空欄・他の値は不可）
4. **verdict 整合性**: `CRITICAL >= 1` または `HIGH >= 1` → `needs-fix`、`CRITICAL = 0` かつ `HIGH = 0` → `approved`（escalation を除く）
5. **severity 定義準拠**: 各 finding の severity が PIPELINE_RULES の Severity 定義と一致しているか

違反がある場合は review-feedback ファイルを修正する。違反がない場合は変更せず end_turn する。

#### Scenario: Findings テーブルの Fix カラムが未記載の場合に修正される

- **GIVEN** code-review step が review-feedback ファイルを出力した
- **WHEN** followUpPrompt の self-check pass が実行される
- **THEN** Fix カラムが空欄の finding があれば `yes` または `no` で埋めて review-feedback ファイルを修正する

#### Scenario: LOW のみで needs-fix verdict の場合に修正される

- **GIVEN** review-feedback ファイルに CRITICAL / HIGH finding が 0 件で verdict が `needs-fix` である
- **WHEN** followUpPrompt の self-check pass が実行される
- **THEN** verdict を `approved` に修正して review-feedback ファイルを更新する

#### Scenario: 散文形式 findings の場合にテーブル形式へ修正される

- **GIVEN** review-feedback ファイルの Findings セクションが散文形式またはリスト形式で記述されている
- **WHEN** followUpPrompt の self-check pass が実行される
- **THEN** Findings セクションを必須 7 カラムの Markdown テーブル形式に変換して review-feedback ファイルを修正する

#### Scenario: フォーマット違反がない場合は変更せず end_turn する

- **GIVEN** review-feedback ファイルが全チェック項目を満たしている
- **WHEN** followUpPrompt の self-check pass が実行される
- **THEN** ファイルを変更せず end_turn する
