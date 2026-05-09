## 1. implementer system prompt の拡張

- [x] 1.1 `src/prompts/implementer-system.ts` の「実装手順」ステップ 1 に test-cases.md の読み込み指示を追加（「change folder の test-cases.md を読み込む（存在する場合）」）
- [x] 1.2 ステップ 3 の TDD 指示を具体化: must シナリオの全実装義務、GIVEN/WHEN/THEN → テストコード変換、プロジェクト既存テストのパターン準拠
- [x] 1.3 実装不可なテストケースの報告フォーマットを追加: `test_cases_skipped: [TC-ID — 理由]` を commit message に含める指示
- [x] 1.4 test-cases.md 非存在時のフォールバック記載: 「test-cases.md が存在しない場合は従来通り tasks.md ベースで TDD を行う」

## 2. 検証

- [x] 2.1 `bun run typecheck` が green
- [x] 2.2 `bun run test` が green
