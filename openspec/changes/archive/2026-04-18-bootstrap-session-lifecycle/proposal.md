## Why

PR #4 の応急処置により、SSE route handler に bootstrap 固有ロジック（完了検知、archive、PR 作成、title 文字列判定）が直接埋め込まれている。根本原因は bootstrap を request type / session role として既存ライフサイクルに統合していないこと。さらに、マネージドエージェント環境に gh CLI がないため、PR 作成をアプリ側で GitHub REST API 経由に移す必要がある。Vault を使った MCP 認証情報管理も未整備。

## What Changes

- `requests.type` に `bootstrap` を追加。bootstrap 用 request 作成は `startBootstrap` 内で `type: 'bootstrap'` を使用（現在は `new-feature` で代用）
- `sessions.role` に `bootstrap` を追加。bootstrap セッションは `role: 'bootstrap'` で作成
- セッション完了ハンドラ (`session-completion-handler.ts`) を新設。SSE route から分離し、role ベースで完了処理を分岐する汎用設計
- GitHub REST API 操作を `github-api.ts` に集約（PR 作成・クローズ・ブランチ削除・ブランチ存在確認）。bootstrap-actions からの直書き GitHub API 呼び出しを解消
- Vault ライフサイクル管理を `vault-actions.ts` に新設。ユーザーごとの Vault 作成、GitHub OAuth トークンの認証情報登録、users テーブルへの vault_id 保存
- bootstrap 指示メッセージを変更: commit + push まで実行させ、PR 作成は指示しない（アプリ側で GitHub API 経由で作成）
- クライアント側: セッション完了後のステータスポーリング、PR URL 表示、キャンセルボタン（bootstrapping / pr_pending）

## Capabilities

### New Capabilities
- `github-api-lib`: GitHub REST API 操作の集約モジュール（PR 作成・クローズ・ブランチ削除・ブランチ存在確認）
- `vault-management`: Vault ライフサイクル管理（作成・認証情報登録・削除・再登録）
- `session-completion-handling`: セッション完了時の role ベース分岐ハンドラ（SSE route から分離）
- `bootstrap-cancel`: bootstrapping / pr_pending 状態からのキャンセル機能（セッション archive + PR close + ブランチ削除 + status ロールバック）

### Modified Capabilities
- `bootstrap-execution`: request type を `bootstrap` に変更、session role を `bootstrap` に変更、指示メッセージから PR 作成指示を除外、PR 作成をアプリ側 GitHub API に移行、Vault 認証情報の自動セットアップ
- `session-management`: role に `bootstrap` を追加、セッション完了時の role ベース分岐を追加
- `request-management`: type に `bootstrap` を追加
- `database`: users テーブルに `vault_id` カラム追加、requests.type CHECK 制約に `bootstrap` 追加、sessions.role CHECK 制約に `bootstrap` 追加
- `message-streaming`: SSE route はイベントストリーミングのみに責務限定、セッション完了検知後は session-completion-handler に委譲

## Impact

- **DB スキーマ**: users テーブルに `vault_id` (TEXT, nullable) 追加。requests.type enum に `bootstrap` 追加。sessions.role enum に `bootstrap` 追加。マイグレーション必要
- **Server Actions**: `bootstrap-actions.ts` の `startBootstrap` を再設計（Vault セットアップ追加、type/role 変更、指示メッセージ変更）。`cancelBootstrap` を新設
- **新モジュール**: `github-api.ts`, `vault-actions.ts`, `session-completion-handler.ts`
- **SSE route**: bootstrap 固有ロジックを除去（現在は含まれていないが、PR #4 マージ時に追加される想定だったものを構造的に防止）
- **クライアント**: ステータスポーリング API、キャンセル UI、PR URL 表示
- **外部依存**: Anthropic Vault API（beta）、GitHub REST API（PR 操作）
- **既存テスト**: bootstrap 関連テストの更新（type/role の値変更）
