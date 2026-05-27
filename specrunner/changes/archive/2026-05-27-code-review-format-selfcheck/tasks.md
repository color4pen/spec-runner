# Tasks: code-review-format-selfcheck

## Task 1: [x] CodeReviewStep に followUpPrompt を追加

**File**: `src/core/step/code-review.ts`

`CodeReviewStep` オブジェクト（L105）に `followUpPrompt` プロパティを追加する。

追加位置は `needsProjectContext: true` の後、`buildMessage` の前。

followUpPrompt の内容:

```
作業完了後の self-check pass です。
出力した review-feedback ファイルを Read tool で読み、以下を確認してください:

1. Findings セクションがテーブル形式（`| # | Severity | Category | File | Description | How to Fix | Fix |`）で記述されているか
   - 散文形式やリスト形式は不可。必ず Markdown テーブルであること
2. 必須カラム（#, Severity, Category, File, Description, How to Fix, Fix）が全て存在するか
   - ヘッダー行にこの 7 カラムが揃っていること
3. Fix カラムが全 finding に対して yes / no のいずれかで記入されているか
   - 空欄や他の値は不可
4. verdict が Verdict Derivation Rules と整合しているか
   - CRITICAL >= 1 または HIGH >= 1 → verdict は needs-fix でなければならない
   - CRITICAL = 0 かつ HIGH = 0 → verdict は approved でなければならない（escalation を除く）
5. 各 finding の severity が Severity 定義と一致しているか
   - CRITICAL: 本番障害、データ損失、セキュリティ侵害に直結
   - HIGH: 機能不全、明確なバグ、回避策なし
   - MEDIUM: 品質低下、保守性問題、将来のリスク
   - LOW: 情報提供、スタイル、微小な改善

違反があれば review-feedback ファイルを修正してください。
違反がなければ変更せず end_turn してください。
```

design.ts の followUpPrompt と同じく `[...].join("\n")` で記述する。

## Task 2: [x] typecheck & test の確認

`bun run typecheck && bun run test` が green であることを確認する。

followUpPrompt は `string` 型のプロパティ追加のみなので型エラーは発生しないはずだが、既存テストの regression がないことを検証する。
