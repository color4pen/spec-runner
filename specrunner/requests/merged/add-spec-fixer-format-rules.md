# spec-fixer に delta spec format rules を追加する

## Meta

- **slug**: add-spec-fixer-format-rules
- **type**: spec-change
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

spec-review が delta spec のフォーマット違反を指摘しても、spec-fixer のプロンプトに delta spec format rules が含まれていないため、fixer が正しく修正できない。propose のシステムプロンプトには Delta Spec Format Rules が定義されているが、spec-fixer には移植されていない。

## 目的

spec-fixer が delta spec のフォーマットを正しく修正できるよう、format rules をプロンプトに追加する。

## 要件

1. `src/prompts/spec-fixer-system.ts` に delta spec format rules を追加する。propose-system.ts に定義されている以下のルールを移植する:
   - `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` のセクション構造
   - `### Requirement:` ヘッダの書式
   - `#### Scenario:` の WHEN/THEN パターン
   - SHALL/MUST の normative keywords
   - REMOVED セクションではヘッダのみ（本文不要）

2. propose-system.ts の既存ルールと矛盾しないこと

## 受け入れ基準

- [ ] spec-fixer-system.ts に delta spec format rules が追加されている
- [ ] propose-system.ts のルールと整合している
- [ ] `bun run typecheck` / `bun run test` が全 pass
