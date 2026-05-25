# Spec Review Result: archive-path-helper

- **verdict**: approved

## 検証サマリー

純粋な refactor であり、スコープ・設計・タスク定義のいずれも整合している。

## 確認事項

### 対象リテラル 4 箇所の実在確認

| ファイル | 行 | 内容 | 確認 |
|---|---|---|---|
| `src/context/request-patterns.ts:31` | 31 | `path.join(cwd, "specrunner", "changes", "archive")` | ✓ |
| `src/core/doctor/checks/repo/workflow-structure.ts:25` | 25 | `path.join(ctx.cwd, "specrunner", "changes")` | ✓ |
| `src/core/request/store.ts:10` | 10 | `const ARCHIVE_SUBDIR = path.join("specrunner", "changes", "archive")` | ✓ |
| `src/core/finish/archive-change-folder.ts:48` | 48 | `` `${changesDirRel()}/archive/${dateStr}-${slug}` `` | ✓ |

### 設計整合性

- `archivedChangesDirRel()` / `archivedChangeFolderPath(datedSlug)` の命名は既存の `changesDirRel()` / `changeFolderPath(slug)` とペアをなす ✓
- 両関数とも `CHANGES_DIR` 定数のみを参照し、他の `src/` モジュールを import しない（TC-034 遵守） ✓
- `archive-change-folder.ts` の `changesDirRel` import は、置換後も lines 63–70 の `git add` 呼び出しで引き続き使用されるため削除不要。tasks.md の diff も `changesDirRel` を残しており正しい ✓

### 注意点（問題なし）

- `store.ts` の `ARCHIVE_SUBDIR` は現在 `path.join(...)` (OS セパレータ) で生成されているが、置換後は template literal（`/` 固定）になる。Bun は POSIX 環境のみサポートするため実質的な差異なし ✓

### セキュリティ

- 新規のユーザー入力受付・認証フロー・外部呼び出しなし
- パス値はコンパイル時定数。OWASP Top 10 該当なし ✓

### 受け入れ基準の網羅性

- helper export の要件 → tasks.md Task 1 で対応 ✓
- 4 箇所置換の要件 → tasks.md Tasks 2-1〜2-4 で対応 ✓
- unit test 追加の要件 → tasks.md Task 3 で対応 ✓
- typecheck & test green の要件 → tasks.md Task 4 で対応 ✓
