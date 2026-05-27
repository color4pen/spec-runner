# code-review step に PIPELINE_RULES 準拠の self-check フォローアップを追加する

## Meta

- **type**: bug-fix
- **slug**: code-review-format-selfcheck
- **base-branch**: main
- **adr**: false

## 背景

`cli-log-level-system` の run で code-review が以下の問題を起こした:

1. **Findings テーブルの Fix カラム未記載** — fixer が修正対象を特定できず staged changes なしで 2 回 halt
2. **LOW severity 1 件で needs-fix verdict** — Verdict Derivation Rules では HIGH ≥ 1 が needs-fix の条件だが、LOW のみで needs-fix を返した
3. **テーブル形式ではなく散文形式で findings を記述** — CLI の `parseFixableFindings` がテーブルを parse できなかった

これらの情報は system prompt の `PIPELINE_RULES` fragment に全て記載済みだが、reviewer agent が準拠しなかった。

design step では delta spec フォーマット準拠の self-fix pass を `followUpPrompt` で実装済み（`src/core/step/design.ts` L62-77）。同じアプローチで code-review にも出力フォーマットの self-check を追加する。

## 要件

### 1. code-review step に followUpPrompt を追加

`src/core/step/code-review.ts` の step 定義に `followUpPrompt` を追加する。作業完了後に同一 session で self-check を実行させる:

- Findings セクションがテーブル形式（`| # | Severity | ... | Fix |`）で記述されているか
- 必須カラム（#, Severity, Category, File, Description, How to Fix, Fix）が全て存在するか
- Fix カラムが全 finding に対して yes / no のいずれかで記入されているか
- verdict が Verdict Derivation Rules と整合しているか（CRITICAL ≥ 1 または HIGH ≥ 1 → needs-fix、両方 = 0 → approved）
- severity の判定基準が Severity 定義と一致しているか

違反があれば出力ファイルを修正し、違反がなければ変更せず end_turn する。

## スコープ外

- **PIPELINE_RULES fragment の内容変更** — ルール自体は正しい、self-check の追加のみ
- **parseFixableFindings の parse ロジック変更** — テーブル形式が前提、散文形式への対応は不要
- **verdict の CLI 側再計算** — PR #407 で廃止済み、agent verdict を採用する方針を維持

## 受け入れ基準

- [ ] code-review step 定義に `followUpPrompt` が追加されている
- [ ] フォローアップが Findings テーブル形式 / 必須カラム / Fix カラム / verdict 整合性を確認する指示を含んでいる
- [ ] 違反時に出力ファイルを修正し、違反なしなら end_turn する指示がある
- [ ] `bun run typecheck && bun run test` が green
