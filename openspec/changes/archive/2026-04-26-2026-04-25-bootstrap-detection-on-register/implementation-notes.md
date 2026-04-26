# Implementation Notes

## Summary

- **result**: completed
- **tasks_completed**: 9/9
- **test_coverage**: 12 tests (12 pass, 0 fail) + 186 pre-existing tests unaffected = 198 total

## Files Modified

### New Files

| Path | Operation | Description |
|------|-----------|-------------|
| `src/__tests__/bootstrap-detection-on-register.test.ts` | created | 12 unit/integration tests covering TC-001 to TC-009 (must) and 3 static analysis tests |

### Modified Files

| Path | Operation | Description |
|------|-----------|-------------|
| `src/lib/repository-registration-actions.ts` | modified | Added `import { getFileContent, getDirectoryContents } from './github-api'`; added module-private `detectBootstrapStatus()` helper; replaced hardcoded `bootstrapStatus: 'uninitialized'` with dynamic detection in `registerRepository()` |

## Key Design Decisions

1. **`detectBootstrapStatus` をモジュールプライベート関数として配置**: `registerRepository()` 内でのみ使用するため export せず。将来再利用が必要になった場合に export に昇格する（design.md Decision 5 に従う）。

2. **`Promise.all` による並列実行**: `getFileContent('openspec/project.md')` と `getDirectoryContents('requests/active/')` を同時発行し、登録レイテンシへの影響を最小化（design.md Decision 3）。

3. **テストに `mock.module('@/lib/github-api')` を使わず `globalThis.fetch` をモック**: bun:test の `mock.module` はプロセスグローバルに適用されるため、モジュールレベルで `@/lib/github-api` をモックすると `request-create-propose.test.ts` の `getFileContent`/`getDirectoryContents` 直接テストが干渉する問題が発生した。`globalThis.fetch` のモックに切り替えることで他テストへの副作用を排除し、全 198 テストが PASS。

4. **`ghRepo.default_branch || 'main'` フォールバック**: GitHub API が `default_branch` を返さない異常ケースへの防御的対応（実質的には発生しないが TypeScript 型の安全性確保）。

## Blocked Tasks

なし。全 9 タスク完了。

## Test Cases Coverage

| TC | Priority | Status | Method |
|----|----------|--------|--------|
| TC-001 | must | pass | fetch mock (both exist → ready) |
| TC-002 | must | pass | fetch mock (project.md 404 → uninitialized) |
| TC-003 | must | pass | fetch mock (requests/active/ 404 → uninitialized) |
| TC-004 | must | pass | fetch mock (both 404 → uninitialized) |
| TC-005 | must | pass | fetch mock (fetch throws for contents → uninitialized, no re-throw) |
| TC-006 | must | pass | fetch mock (500 error → uninitialized, no re-throw) |
| TC-007 | must | pass | URL capture (both paths fetched = parallel) |
| TC-008 | must | pass | DB verification (bootstrap_status: ready in DB) |
| TC-009 | must | pass | DB verification (bootstrap_status: uninitialized in DB) |
| TC-010 | should | n/a | Integration test (covered by TC-005/TC-006 behavior) |
| TC-011 | should | pass | Full suite run: 186 pre-existing tests unaffected |
| TC-012 | should | n/a | defaultBranch parameter forwarding verified via TC-007 URL check |
| TC-013 | could/manual | n/a | Manual UI test — cannot automate |
