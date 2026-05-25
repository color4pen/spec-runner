# Design: archive-path-helper

## 概要

`util/paths.ts` に archive 系 helper 2 関数を追加し、4 箇所のリテラル直書きを置換する純粋 refactor。

## 追加する関数

```ts
// src/util/paths.ts

/** archive サブディレクトリの相対パス */
export function archivedChangesDirRel(): string {
  return `${CHANGES_DIR}/archive`;
}

/**
 * archive 内の個別 change folder の相対パス
 * @param datedSlug "YYYY-MM-DD-<slug>" 形式
 */
export function archivedChangeFolderPath(datedSlug: string): string {
  return `${CHANGES_DIR}/archive/${datedSlug}`;
}
```

## 置換マッピング

| ファイル | before | after |
|----------|--------|-------|
| `src/context/request-patterns.ts:31` | `path.join(cwd, "specrunner", "changes", "archive")` | `path.join(cwd, archivedChangesDirRel())` |
| `src/core/doctor/checks/repo/workflow-structure.ts:25` | `path.join(ctx.cwd, "specrunner", "changes")` | `path.join(ctx.cwd, changesDirRel())` |
| `src/core/request/store.ts:10` | `const ARCHIVE_SUBDIR = path.join("specrunner", "changes", "archive")` | `import { archivedChangesDirRel }` → 定数削除、参照を `archivedChangesDirRel()` に |
| `src/core/finish/archive-change-folder.ts:48` | `` `${changesDirRel()}/archive/${dateStr}-${slug}` `` | `` archivedChangeFolderPath(`${dateStr}-${slug}`) `` |

## 設計判断

- **TC-034 遵守**: `util/paths.ts` は他の `src/` モジュールを import しない（pure function のみ）
- **既存 `changesDirRel()` を再利用**: 新たに `changesDir()` は追加しない
- **命名**: `changeFolderPath(slug)` と対になる `archivedChangeFolderPath(datedSlug)` 
- **behavior change なし**: 返す文字列が同一であることを unit test で担保
