# Tasks: spec-fixer-delta-format-injection

## T-01: spec-fixer prompt に delta spec format rules を inline 記載する

- [x] `src/prompts/spec-fixer-system.ts` の `## Delta Spec Format Rules` セクション（L36-38）を拡張する
- [x] 既存の「詳細ルールは rules.md 参照」の一文を維持しつつ、以下の 5 項目を箇条書きで追記する:
  - `## Removed` は `- "requirement name"` のリスト形式（ブロック形式・散文形式は禁止）
  - `## Renamed` は `- "old name" → "new name"` のリスト形式
  - `### Requirement:` header は baseline と完全一致（MODIFIED 時）
  - 各 Requirement は最低 1 つの `#### Scenario:` を含む
  - Requirement 本文に英語の `SHALL` または `MUST` を含める

**受け入れ基準**: prompt 文字列に `- "requirement name"` と `- "old name"` が含まれている

## T-02: code-fixer の禁止事項を authority spec に限定する

- [x] `src/prompts/code-fixer-system.ts` の禁止事項 `- 仕様変更（spec ファイルの変更）` を `- authority spec（\`specrunner/specs/\` 配下）の変更` に変更する

**受け入れ基準**: prompt 文字列に `specrunner/specs/` が含まれ、delta spec が禁止対象から除外されている

## T-03: code-fixer prompt に delta spec format rules を追加する

- [x] `src/prompts/code-fixer-system.ts` の修正手順セクションとセキュリティセクションの間に `## Delta Spec Format Rules` セクションを追加する
- [x] T-01 と同じ 5 項目の inline 規約を記載する
- [x] `specrunner/changes/<slug>/rules.md` の「delta spec 記法」セクション参照の指示を含める

**受け入れ基準**: code-fixer prompt 文字列に `## Delta Spec Format Rules`、`- "requirement name"`、`rules.md` が含まれている

## T-04: typecheck & test green を確認する

- [x] `bun run typecheck` が pass する
- [x] `bun run test` が pass する

**受け入れ基準**: 両コマンドの exit code が 0
