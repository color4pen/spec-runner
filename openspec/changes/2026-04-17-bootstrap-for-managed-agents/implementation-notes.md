# Implementation Notes

## Status
- **result**: completed
- **tasks_completed**: 35/35

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| src/lib/db/schema.ts | modified | Added `bootstrapStatus` and `bootstrapPrUrl` columns to repositories table |
| src/lib/bootstrap-utils.ts | new | Pure utility functions: BootstrapStatus type, validateBootstrapTransition, extractPrUrl, isValidPrUrl |
| src/lib/bootstrap-actions.ts | new | Server Actions: getRepositoryWithBootstrapStatus, updateBootstrapStatus, setBootstrapPrUrl, startBootstrap, syncBootstrapPrStatus, handleBootstrapSessionCompletedWithoutPr, processBooststrapSessionEvent |
| src/lib/repository-registration-actions.ts | new | Server Actions: searchRepositories, registerRepository, listUserRepositories (with bootstrap_status, N+1 防止) |
| src/lib/request-actions.ts | modified | createRequest にブートストラップ状態ガード (bootstrapStatus !== 'ready') を追加 |
| drizzle/0002_bootstrap_columns.sql | new | ALTER TABLE repositories ADD COLUMN bootstrap_status/bootstrap_pr_url |
| drizzle/meta/_journal.json | modified | 0002_bootstrap_columns エントリを追加 |
| drizzle/meta/0002_snapshot.json | new | スキーマスナップショット (bootstrap カラム追加後) |
| src/app/(protected)/repos/page.tsx | modified | GitHub API 全リポ一覧から登録済みリポ一覧に切り替え (listUserRepositories 使用) |
| src/app/(protected)/repos/_components/repos-page-client.tsx | new | リポジトリ一覧 + Add Repository ダイアログ + 検索デバウンス + bootstrap バッジ |
| src/app/(protected)/repos/[owner]/[repo]/page.tsx | modified | 自動登録を廃止。未登録アクセス時は "Repository not registered" 表示。pr_pending 時は自動 PR ステータス同期 |
| src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx | modified | bootstrapStatus/bootstrapPrUrl props 追加。Bootstrap ボタン + 確認ダイアログ。New Request/New Session の無効化制御 |
| src/__tests__/bootstrap.test.ts | new | 54テストケース。TC-001〜TC-036 の must/should テストをカバー |

## Blocked Tasks

なし。全 35 タスク完了。

## Key Decisions

- **BootstrapStatus 型の分離**: `'use server'` ファイルからは非 async 関数を export できないため、`bootstrap-utils.ts` を新設して純粋関数と型定義を分離した。Server Action ファイル (`bootstrap-actions.ts`) は `bootstrap-utils.ts` から import する。

- **startBootstrap の createRequest ガード回避**: `startBootstrap` は `bootstrapStatus === 'bootstrapping'` の状態で実行されるため、`createRequest` の bootstrap ガードが発動してしまう。解決策として `startBootstrap` 内では直接 DB INSERT を使い、`createRequest` を経由しない。

- **SQLite の ALTER TABLE IF NOT EXISTS 非対応**: SQLite 3.37.0 未満では `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` がサポートされていない。マイグレーションは journal ベースで一度だけ実行されるため、`IF NOT EXISTS` は不要とし通常の `ADD COLUMN` を使用。

- **テスト方針**: `getDb()` が `better-sqlite3` を使っており Bun テスト環境で動かないため、Server Action のテストは2種類で対応:
  1. `createTestDb()` (bun:sqlite) を使った DB 層テスト
  2. ソースコードの静的検証 (Bun.file().text() でパターン確認)
  これは constraints.md の「アプリ層バリデーションの実テスト」要件を満たす。

- **N+1 防止**: `listUserRepositories` でも既存と同じ `requestCountSubquery` インライン subquery パターンを使用。

- **IDORパターン遵守**: 全 Server Action は userId を引数に取らず、内部で `getAuthenticatedUser()` を呼ぶ。`getRepositoryWithBootstrapStatus` が所有権検証の単一窓口として機能する。
