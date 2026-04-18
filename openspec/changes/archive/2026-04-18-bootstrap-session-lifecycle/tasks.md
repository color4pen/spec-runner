## 1. DB スキーマ変更

- [x] 1.1 `src/lib/db/schema.ts` の `users` テーブルに `vaultId` カラム追加（TEXT, nullable）
- [x] 1.2 `src/lib/db/schema.ts` の `requests` テーブルの type enum に `'bootstrap'` を追加
- [x] 1.3 `src/lib/db/schema.ts` の `sessions` テーブルの role enum に `'bootstrap'` を追加
- [x] 1.4 `bun run db:push` でスキーマ変更を DB に反映

## 2. GitHub API lib

- [x] 2.1 `src/lib/github-api.ts` を新規作成（`'use server'` なし）。`createPullRequest(token, owner, repo, params)` を実装。`POST /repos/{owner}/{repo}/pulls` を呼ぶ
- [x] 2.2 `getPullRequestStatus(token, owner, repo, prNumber)` を実装。state/merged/html_url を返す
- [x] 2.3 `closePullRequest(token, owner, repo, prNumber)` を実装。冪等（既に closed なら no-op）
- [x] 2.4 `getBranchExists(token, owner, repo, branch)` を実装。404 は false を返す（throw しない）
- [x] 2.5 `deleteBranch(token, owner, repo, branch)` を実装。冪等（404/422 は無視）
- [x] 2.6 `findOpenPrByHead(token, owner, repo, headBranch)` を実装。冪等 PR 作成の前提チェック

## 3. Vault 管理

- [x] 3.1 `src/lib/vault-actions.ts` を新規作成。`ensureVaultWithCredentials(userId, accessToken)` を実装。Vault 未作成なら `client.beta.vaults.create()` で作成し vault_id を users テーブルに保存
- [x] 3.2 MCP 認証情報の登録ロジックを実装。`client.beta.vaults.credentials.create(vaultId, { auth: { type: 'static_bearer', token: accessToken, mcp_server_url: 'https://api.githubcopilot.com/mcp' } })`
- [x] 3.3 409 Conflict ハンドリングを実装。`credentials.list()` で既存取得 → 削除 → 再登録

## 4. session-actions 拡張

- [x] 4.1 `createBoundSession` の role 型に `'bootstrap'` を追加
- [x] 4.2 `createBoundSession` で Vault リソース対応を追加。user の vault_id が非 null なら `vault_ids: [vaultId]` をセッション作成パラメータに追加

## 5. request-actions 拡張

- [x] 5.1 `VALID_TYPES` に `'bootstrap'` を追加
- [x] 5.2 `ALLOWED_TRANSITIONS` の `reviewing` に `'cancelled'` を追加（`reviewing: ['completed', 'in-progress', 'cancelled']`）

## 6. セッション完了ハンドラ

- [x] 6.1 `src/lib/session-completion-handler.ts` を新規作成（`'use server'` なし）。`handleSessionCompleted(sessionDbId, accessToken)` を実装。セッション+リクエスト+リポジトリを JOIN で取得し、role で分岐する dispatch
- [x] 6.2 `handleBootstrapCompleted` を実装。ブランチ存在確認 → PR 作成（または既存 PR 取得）→ bootstrap_pr_url 保存 → bootstrap_status を `pr_pending` → request status を `reviewing`
- [x] 6.3 ブランチ不存在時のロールバックを実装。bootstrap_status を `uninitialized`、request を `cancelled`
- [x] 6.4 PR 作成後 DB 更新失敗時の PR クローズ（ベストエフォート）を実装

## 7. bootstrap-actions 再設計

- [x] 7.1 `startBootstrap` を再設計。Vault セットアップ呼び出しを追加。request type を `'bootstrap'` に変更。session role を `'bootstrap'` に変更。既存の bootstrap ブランチ存在確認 + 削除を Vault セットアップ後に追加
- [x] 7.2 `buildBootstrapMessage` を更新。ブランチ名 `openspec-bootstrap/{owner}/{repo}` を指示に追加。PR 作成指示を除去。commit + push のみ
- [x] 7.3 `cancelBootstrap(repositoryId)` を新設。bootstrapping: session archive → status rollback → request cancel。pr_pending: PR close + branch delete → pr_url clear → status rollback → request cancel
- [x] 7.4 `processBootstrapSessionEvent` と `handleBootstrapSessionCompletedWithoutPr` を削除

## 8. SSE route 更新

- [x] 8.1 SSE route にセッション完了検知ロジックを追加。`session.status_idle` + `end_turn` の組み合わせを検知
- [x] 8.2 完了検知時に `handleSessionCompleted(sessionDbId)` を呼び出す。bootstrap 固有ロジックは含めない

## 9. ステータス API

- [x] 9.1 `src/app/api/repos/[owner]/[name]/status/route.ts` を新規作成。GET ハンドラで `{ bootstrapStatus, bootstrapPrUrl, requestStatus }` を返す。認証 + 所有権検証付き

## 10. クライアント側

- [x] 10.1 セッション完了後のステータスポーリングロジックを実装。3 秒間隔、最大 30 回。状態変化で停止
- [x] 10.2 PR URL 表示コンポーネントを実装。`pr_pending` 検知時にチャットに PR リンクを表示 + `router.refresh()`
- [x] 10.3 キャンセルボタンを実装。`bootstrapping` / `pr_pending` 状態で表示。`cancelBootstrap` Server Action を呼ぶ

## 11. 既存テスト更新

- [x] 11.1 bootstrap 関連テストの type/role 値を `'bootstrap'` に更新
- [x] 11.2 github-api.ts のユニットテストを追加
- [x] 11.3 vault-actions.ts のユニットテストを追加
- [x] 11.4 session-completion-handler.ts のユニットテストを追加
- [x] 11.5 cancelBootstrap のユニットテストを追加

## 12. デッドコード削除

- [x] 12.1 `processBootstrapSessionEvent` を bootstrap-actions.ts から削除（定義 + import + 呼び出し元）
- [x] 12.2 `handleBootstrapSessionCompletedWithoutPr` を bootstrap-actions.ts から削除（同上）
- [x] 12.3 `syncBootstrapPrStatus` の GitHub API 直書き部分を `github-api.ts` の `getPullRequestStatus` に委譲するよう書き換え
