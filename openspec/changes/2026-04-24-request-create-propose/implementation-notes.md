# Implementation Notes

## Summary

- **result**: completed
- **tasks_completed**: 35/35
- **test_coverage**: 42 tests (42 pass, 0 fail)

## Files Modified

### New Files

| Path | Operation | Description |
|------|-----------|-------------|
| `src/lib/propose-actions.ts` | created | `startPropose()`, `getChangeFolderFiles()`, `getChangeFolderFileContent()` Server Actions |
| `src/lib/propose-utils.ts` | created | Pure utility functions: `generateSlug()`, `generateBranchName()`, `buildProposeMessage()`, `parseEnabledJson()`, `VALID_ENABLED_OPTIONS` |
| `drizzle/0004_request_create_propose.sql` | created | Migration: `ALTER TABLE requests ADD COLUMN enabled text` |
| `src/__tests__/request-create-propose.test.ts` | created | 42 unit/integration tests covering must TCs |

### Modified Files

| Path | Operation | Description |
|------|-----------|-------------|
| `src/lib/db/schema.ts` | modified | Added `enabled` column to `requests`, added `'propose'` to `sessions.role` enum |
| `drizzle/meta/_journal.json` | modified | Registered migration 0004 |
| `src/lib/request-actions.ts` | modified | `createRequest()` refactored to object params with `enabled` field; `RequestSummary` extended; all return mappings updated; `VALID_ENABLED_OPTIONS` import from propose-utils |
| `src/lib/session-actions.ts` | modified | `createBoundSession()` role union type extended with `'propose'` |
| `src/lib/session-completion-handler.ts` | modified | Added `case 'propose'` switch branch, `handleProposeCompleted()` function, `requestTitle`/`requestType`/`requestCreatedAt` fields to `SessionContext` |
| `src/lib/github-api.ts` | modified | Added `DirectoryEntry` interface, `getDirectoryContents()`, `getFileContent()` functions |
| `src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx` | modified | Added `ENABLED_OPTIONS` constant, enabled checkbox group, `propose` role badge, Start Propose dialog, Change Folder viewer, `handleStartPropose()`/`handleLoadChangeFolderFiles()`/`handleLoadChangeFolderFileContent()` handlers |

## Key Design Decisions

1. **純粋関数を `propose-utils.ts` に分離**: `'use server'` ファイルは async 関数のみ export 可能なため、`generateSlug()`, `generateBranchName()`, `buildProposeMessage()`, `parseEnabledJson()`, `VALID_ENABLED_OPTIONS` を別ファイルに移動。

2. **slug はリクエスト作成日時 + タイトルから deterministically 導出**: DB に保存せず、`createdAt.slice(0, 10)` + `generateSlug()` で毎回計算。

3. **propose 完了時の request status 変更なし**: design.md Decision 4 に従い、request は `in-progress` のまま維持。PR も作成しない。

4. **SSE idle イベントで sessions リロード**: propose 完了後に `View Change Folder` ボタンを表示するため、idle イベント時に `getRequestDetail()` を再取得する方式を採用。

## Blocked Tasks

なし。全 35 タスク完了。

## Test Cases Coverage

| TC | Priority | Status | Method |
|----|----------|--------|--------|
| TC-001 | must | pass | DB direct (bun:sqlite) |
| TC-002 | must | pass | DB direct |
| TC-003 | must | pass | DB direct |
| TC-005 | must | pass | DB direct |
| TC-006 | must | pass | DB direct |
| TC-007 | must | pass | Static analysis |
| TC-013 | should | pass | Pure function |
| TC-014 | must | pass | Static analysis |
| TC-015 | must | pass | Static analysis |
| TC-017 | must | pass | Pure function |
| TC-018 | must | pass | Pure function |
| TC-019 | should | pass | Static analysis |
| TC-021 | must | pass | Static analysis |
| TC-022 | must | pass | Static analysis |
| TC-023 | must | pass | Static analysis |
| TC-025 | must | pass | Static analysis |
| TC-026 | must | pass | fetch mock |
| TC-027 | must | pass | fetch mock |
| TC-028 | must | pass | fetch mock |
| TC-029 | must | pass | fetch mock |
| TC-030 | must | pass | Static analysis |
| TC-038 | should | pass | Pure function |
| TC-039 | should | pass | Pure function |

TC-010 (manual), TC-011 (integration/manual), TC-016 (static), TC-020 (static) 等を追加でカバー。
合計 42 テスト。

## Fix History (code-fixer iteration 1)

| Finding | Severity | File | 修正内容 |
|---------|----------|------|---------|
| #1 | HIGH | src/lib/github-api.ts:264, 315 | `getDirectoryContents()` と `getFileContent()` の URL 生成で `encodeURIComponent(path)` を除去。`ref` の encodeURIComponent は維持 |
| #2 | HIGH | src/lib/propose-actions.ts | `getChangeFolderFileContent()` に path traversal ガード追加。`filePath.includes('..')` または changeFolderPath プレフィックス不一致でエラー |
| #3/#4 | MEDIUM | src/lib/propose-actions.ts:63 | `startPropose()` の slug 日付ソースを `new Date()` から `request.createdAt` に統一 |
| #5 | MEDIUM | src/lib/propose-utils.ts | `buildProposeMessage()` で requestContent を `<user-request>` タグで囲み境界を明示 |
| #7 | MEDIUM | src/lib/propose-actions.ts | 3 関数の重複 JOIN クエリを `verifyRequestWithRepository()` ヘルパーに抽出 |
| #8 | MEDIUM | src/lib/propose-actions.ts | rollback 時にセッションも `'archived'` に更新。`sessions` テーブルを import 追加 |
| #9 | LOW | src/lib/propose-utils.ts | no-op `enabled.map((opt) => opt)` を `enabled.join()` に変更 |
| #10 | LOW | src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx | DirectoryEntry import コメントを精緻化 |

## Skipped Manual Test Cases

- TC-010: request 作成フォームの UI 表示 — manual のため自動化不可
- TC-031: "View Change Folder" ボタン表示条件 — manual のため自動化不可
