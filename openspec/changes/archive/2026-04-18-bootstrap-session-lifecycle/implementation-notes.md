# Implementation Notes

## Summary

- **result**: completed
- **tasks_completed**: 35/35
- **blocked**: none
- **test_cases_skipped**: [TC-051, TC-052, TC-053 — manual E2E tests. TC-045, TC-046, TC-047 — E2E browser tests]

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/lib/db/schema.ts` | modified | users に vault_id 追加、requests.type に bootstrap、sessions.role に bootstrap 追加 |
| `drizzle/0003_bootstrap_session_lifecycle.sql` | created | vault_id カラム追加 migration |
| `drizzle/meta/0003_snapshot.json` | created | migration snapshot |
| `drizzle/meta/_journal.json` | modified | migration journal に 0003 エントリ追加 |
| `src/lib/github-api.ts` | created | GitHub REST API 操作の集約ライブラリ（use server なし） |
| `src/lib/vault-actions.ts` | created | Vault CRUD + 409 ハンドリング（use server なし） |
| `src/lib/session-completion-handler.ts` | created | role ベースの dispatch ハンドラ（use server なし） |
| `src/lib/bootstrap-actions.ts` | modified | type=bootstrap/role=bootstrap、cancelBootstrap 追加、デッドコード削除 |
| `src/lib/session-actions.ts` | modified | role に bootstrap 追加、vault_ids 対応 |
| `src/lib/request-actions.ts` | modified | VALID_TYPES に bootstrap、reviewing→cancelled 遷移追加 |
| `src/app/api/sessions/[id]/stream/route.ts` | modified | session.status_idle + end_turn 完了検知 + handleSessionCompleted 呼び出し |
| `src/app/api/repos/[owner]/[name]/status/route.ts` | created | ステータス取得 API（IDOR 防止付き） |
| `src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx` | modified | ポーリング追加、キャンセルボタン追加、旧 bootstrap ロジック削除 |
| `src/__tests__/bootstrap-session-lifecycle.test.ts` | created | 33 テストケース（must テストケース全実装） |
| `src/__tests__/bootstrap.test.ts` | modified | syncBootstrapPrStatus/handleBootstrapSessionCompletedWithoutPr の参照更新 |

## Architecture Notes

### レイヤー分離

```
github-api.ts          → GitHub REST API の純粋ラッパー
vault-actions.ts       → Anthropic Vault API 管理
session-completion-handler.ts → SSE route から呼ばれる role ベース dispatch
bootstrap-actions.ts   → bootstrap 固有ロジック（上記 lib を使用）
SSE route              → イベント転送 + 完了検知のみ
```

### SDK API の調査結果

- Vault 認証情報は `resources` ではなく `vault_ids: [vaultId]` で SessionCreateParams のトップレベルに渡す
- Credential 作成は `{ auth: { type: 'static_bearer', token, mcp_server_url } }` の形式
- Credential 削除は `delete(credentialID, { vault_id: vaultId })` の形式
- `session.status_idle` イベントに `stop_reason.type === 'end_turn'` が含まれるため、前回イベントの追跡は不要

## Blocked Tasks

なし（全タスク完了）

## Fix History

### review-feedback-001 対応

| Finding | Severity | File | 修正内容 |
|---------|----------|------|---------|
| #1 | HIGH | `src/lib/bootstrap-actions.ts:435-451` | `cancelBootstrapRequestsForRepository` に `inArray(requests.status, ['draft', 'in-progress', 'reviewing'])` フィルタを追加。terminal 状態 (`completed`, `cancelled`) は更新対象から除外し状態マシン違反を解消 |
| #2 | MEDIUM | `src/lib/bootstrap-actions.ts:17-22` | `getBranchExists` を static import に移動し `startBootstrap` 内の dynamic import を削除 |
| #3 | MEDIUM | `src/lib/bootstrap-actions.ts:17-22` | `getPullRequestStatus` を static import に移動し `syncBootstrapPrStatus` 内の dynamic import を削除 |
| #4 | MEDIUM | `src/lib/bootstrap-actions.ts:238-256` | Vault setup と branch cleanup を `bootstrapping` 遷移後の try ブロック内に移動。失敗時はロールバックが確実に実行される |
| #6 | MEDIUM | `src/lib/bootstrap-utils.ts`, `src/__tests__/bootstrap.test.ts` | `extractPrUrl` を `bootstrap-utils.ts` から削除（dead code）。対応する TC-028 テストを `bootstrap.test.ts` から削除 |

## Test Cases Skipped

| TC | 理由 |
|----|------|
| TC-051 | manual — 実際の GitHub リポジトリと OAuth トークンが必要 |
| TC-052 | manual — UI フロー (bootstrapping) |
| TC-053 | manual — UI フロー (pr_pending) |
| TC-045 | e2e — ブラウザ環境が必要 |
| TC-046 | e2e — ブラウザ環境が必要 |
| TC-047 | e2e — ブラウザ環境が必要 |
| TC-054 | manual — db:push の実際の実行 |
| TC-049 | manual — GitHub PR マージ操作 |
| TC-050 | manual — Anthropic beta API ヘッダ確認 |
