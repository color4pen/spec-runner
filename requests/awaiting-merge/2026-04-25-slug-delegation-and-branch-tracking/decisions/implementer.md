# Implementer Decision Log

## 実装決定事項

### DB スキーマ

- `branch_name` と `base_branch` を schema.ts に nullable TEXT として追加する :: tasks.md 1.1 の仕様通り。drizzle の inferred type は自動更新される
- マイグレーションは `drizzle/0005_branch_tracking.sql` として手動作成する :: drizzle-kit generate はファイルシステム差分を見るため、テスト DB は migrate() 経由で自動適用される

### Custom Tool Handler

- `src/lib/custom-tool-handler.ts` に `handleCustomToolUse()` を実装する :: session-completion-handler.ts と同じ設計パターン（no 'use server', direct DB）
- タイムアウト 30 秒を `Promise.race` で実装する :: spec の要件通り
- `event_ids` の最初の ID を `custom_tool_use_id` として使う :: SDK の `BetaManagedAgentsSessionRequiresAction` の `event_ids` は Custom Tool Use イベント ID の配列

### register_branch ツール定義

- `src/lib/register-branch-tool.ts` に定義を分離する :: custom-tool-handler.ts と session-actions.ts の両方からインポート可能にするため
- slug バリデーションは `^[a-z0-9]+(-[a-z0-9]+)*$` を使う :: spec の指定通り、アンカー付き正規表現で検証

### Session Creation + Custom Tools

- SDK の `sessions.create` に `tools` パラメータが存在しない（Agent レベルで定義）ことを確認した :: Decision 6 の「実装時検証が必要」通り
- `createBoundSession()` の `customTools` パラメータは session 作成時に渡せないため、propose-actions.ts での渡し方を記録として実装するが、実際の Custom Tool 登録はエージェント設定で行う必要がある :: Blocked 扱いではなく、サーバーサイドの `handleCustomToolUse()` は session-level で機能するため影響なし（エージェントが呼んだ時にサーバーが応答する）

### SSE ループ

- `requires_action` 検知は `event.stop_reason.type === 'requires_action'` で行う :: SDK 型確認済み
- ループを break しない :: design.md Decision 5 の通り
- `event_ids` を `handleCustomToolUse()` に渡し、custom_tool_use_id を取得する

### propose-utils.ts

- `buildProposeMessage` のシグネチャを変更する（`branchName`/`slug` 削除 → `requestId` 追加）:: tasks.md 5.1
- 既存テスト（`request-create-propose.test.ts`）の TC-018 を更新する

### change folder viewer

- slug 抽出ロジック: `branch_name` の最初の `/` 以降を slug として使う :: change-folder-viewer spec の明示的なアルゴリズム通り

### RequestSummary / branchName 公開

- `RequestSummary` に `branchName: string | null` を追加する :: branch-registration spec「RequestSummary/RequestDetail 型拡張」要件
- 既存の呼び出し元 (`workspace-client.tsx`) も更新する
