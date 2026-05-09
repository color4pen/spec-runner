# implementer prompt に test-cases.md の参照指示を追加する

## Meta

- **type**: spec-change
- **slug**: implementer-test-cases-ref
- **base-branch**: main

## 背景

test-case-gen ステップで生成された test-cases.md を implementer が参照していない。openspec-workflow では implementer agent に TDD アプローチ（must テストケースの全実装、GIVEN/WHEN/THEN 変換、未実装ケースの報告）が指示されているが、spec-runner の implementer prompt にはこの指示がない。

## 要件

1. implementer の system prompt に test-cases.md の読み込み指示を追加する
2. must シナリオのテスト実装を義務化する指示を追加する
3. 実装不可なケースの報告フォーマット（`test_cases_skipped`）を定義する
4. test-cases.md が存在しない場合（test-case-gen 未使用時）はスキップする旨を明記する

## スコープ外

- test-case-gen の prompt 改善（#153 で対応）
- implementer のモデル変更

## 受け入れ基準

- [ ] implementer の system prompt に test-cases.md 参照指示が含まれている
- [ ] must シナリオの実装義務が明示されている
- [ ] 未実装ケースの報告フォーマットが定義されている
- [ ] test-cases.md 非存在時のフォールバックが記載されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

対象は `src/prompts/implementer-system.ts` のみ。参考元は `~/Documents/GitHub/openspec-workflow/agents/implementer.md`。
