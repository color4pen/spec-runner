# Design: code-review-format-selfcheck

## Problem

code-review agent が PIPELINE_RULES fragment に記載された出力フォーマット規律を守らないケースがある:

1. Findings テーブルの Fix カラム未記載 → fixer が修正対象を特定できず halt
2. LOW severity のみで needs-fix verdict → Verdict Derivation Rules 違反
3. 散文形式で findings 記述 → `parseFixableFindings` がテーブルを parse 不能

ルール自体は正しく system prompt に注入済み。問題は agent が従わないこと。

## Approach

design step で実証済みの `followUpPrompt` パターンを code-review に適用する。作業 turn 完了後に同一 session 内で self-check を実行させ、PIPELINE_RULES 準拠の出力フォーマットを機械的に検証・修正させる。

### D1: followUpPrompt の内容

以下の 5 項目を self-check させる:

1. **テーブル形式**: Findings セクションが `| # | Severity | ... | Fix |` のテーブル形式か（散文形式でないか）
2. **必須カラム**: `#`, `Severity`, `Category`, `File`, `Description`, `How to Fix`, `Fix` の 7 カラムが全て存在するか
3. **Fix カラム値**: 全 finding の Fix カラムが `yes` または `no` のいずれかで記入されているか
4. **verdict 整合性**: CRITICAL >= 1 または HIGH >= 1 → needs-fix、両方 = 0 → approved が守られているか
5. **severity 定義準拠**: 各 finding の severity が PIPELINE_RULES の定義と一致しているか（LOW を HIGH に格上げしていないか等）

違反があれば出力ファイルを修正。違反がなければ変更せず end_turn。

### D2: 実装箇所

`src/core/step/code-review.ts` の `CodeReviewStep` オブジェクトに `followUpPrompt` プロパティを追加する。design.ts L62-77 と同じパターン。

executor.ts は既存の followUpPrompt 解決チェーン（L138: `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt`）で自動的にピックアップするため、executor 側の変更は不要。

### D3: スコープ制限

- PIPELINE_RULES fragment (`src/prompts/fragments.ts`) は変更しない
- `parseFixableFindings` の parse ロジックは変更しない
- verdict の CLI 側再計算は行わない（agent verdict 採用方針を維持）
- system prompt (`src/prompts/code-review-system.ts`) は変更しない

## Risks

- **R1**: followUpPrompt で修正させても agent が再度誤る可能性 → 低リスク。design step で同パターンが有効に機能している実績あり。self-check は「ルールの再適用」ではなく「出力の機械的検証」なので成功率が高い。
