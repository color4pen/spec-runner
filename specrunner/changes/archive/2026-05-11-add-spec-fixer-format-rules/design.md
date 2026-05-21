# Design: add-spec-fixer-format-rules

## 概要

spec-fixer のシステムプロンプトに delta spec format rules を追加する。propose-system.ts に定義済みのルールを移植し、spec-review の findings を正しく修正できるようにする。

## 現状の問題

- spec-review は delta spec のフォーマット違反を検出する（セクションヘッダー、Scenario 必須、normative keywords 等）
- spec-fixer のプロンプトには format rules が含まれていないため、fixer は「何が正しいフォーマットか」を知らずに修正を試みる
- 結果、修正が不完全になるか、再度同じ findings が発生する

## 設計方針

### 移植するルール（propose-system.ts L85-137 から）

1. **セクションヘッダー**: `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`
2. **Requirement ヘッダー**: `### Requirement:` 形式
3. **Scenario 必須**: 各 Requirement に `#### Scenario:` を最低 1 つ（MODIFIED 含む）
4. **MODIFIED の header 一致**: 変更前の元 header と完全一致。変更時は RENAMED 併記
5. **独自フォーマット禁止**: `## Changed Requirement:` 等は不可
6. **Normative keywords**: 本文に `SHALL` または `MUST` を最低 1 つ
7. **コードブロック制約**: `### Requirement:` と最初の `#### Scenario:` の間にコードブロック禁止
8. **ファイル配置**: `specs/<capability-name>/spec.md` 形式

### 移植しないもの

- **Self-review checklist**: spec-fixer は findings ベースで修正するため、self-review は不要
- **ファイル配置ルールの詳細**: spec-fixer は既存ファイルを修正するだけで、新規ファイル配置の判断はしない。ただしルール自体は参照情報として含める

### 実装方法

`SPEC_FIXER_SYSTEM_PROMPT` の文字列リテラルに `## Delta Spec Format Rules` セクションを追加する。`修正手順` と `修正不能な findings の扱い` の間に配置し、fixer が修正時にフォーマットを参照できるようにする。

propose-system.ts のルールテキストをそのまま複製する（テンプレートリテラルの `${_changesDir}` 等の変数展開は spec-fixer では不要なので、固定パスの説明文に置き換える）。

### 変更しないもの

- `propose-system.ts` — 既存ルールはそのまま維持
- `buildSpecFixerSystemPrompt()` の signature — 静的プロンプトのまま
- テスト — プロンプト文字列の内容テストは存在しないため追加不要

## Capabilities

- spec-fixer-prompt（既存 `src/prompts/spec-fixer-system.ts` の変更）
