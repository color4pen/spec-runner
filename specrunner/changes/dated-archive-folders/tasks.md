# Tasks: dated-archive-folders

## [x] Task 1: `parseArchiveDirName` ヘルパー追加

**file**: `src/util/paths.ts`

`parseArchiveDirName(dirName: string): { date: string | null; slug: string }` を export する。

```typescript
const ARCHIVE_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

export function parseArchiveDirName(dirName: string): { date: string | null; slug: string } {
  const m = ARCHIVE_DATE_PREFIX_RE.exec(dirName);
  if (m) return { date: m[1], slug: m[2] };
  return { date: null, slug: dirName };
}
```

TC-034 制約（他 src/ module を import しない）を維持すること。

## [x] Task 2: `parseArchiveDirName` テスト追加

**file**: `tests/util/paths.test.ts`

以下のケースを追加:

- `"2026-05-20-foo-bar"` → `{ date: "2026-05-20", slug: "foo-bar" }`
- `"foo-bar"` → `{ date: null, slug: "foo-bar" }`
- `"2026-04-16-phase2-auth-and-app-foundation"` → `{ date: "2026-04-16", slug: "phase2-auth-and-app-foundation" }`
- `"abolish-success-status"` → `{ date: null, slug: "abolish-success-status" }`

## [x] Task 3: `archive-change-folder.ts` の archivePath 生成を日付 prefix 付きに変更

**file**: `src/core/finish/archive-change-folder.ts`

1. `archiveChangeFolder` の params に `now?: () => Date` を追加
2. archivePath 生成を変更:

```typescript
const dateStr = (params.now ?? (() => new Date()))().toISOString().slice(0, 10);
const archivePath = `${changesDirRel()}/archive/${dateStr}-${slug}`;
```

既存の関数シグネチャ（`ArchiveChangeFolderResult` 型）は変更しない。

## [x] Task 4: `archive-change-folder.test.ts` の更新

**file**: `tests/unit/core/finish/archive-change-folder.test.ts`

既存テストが存在する場合は archivePath の期待値を `<YYYY-MM-DD>-<slug>` 形式に更新。存在しない場合は新規作成。

テストケース:
- `now` を固定日付で inject し、archive 先 path が `specrunner/changes/archive/2026-01-15-my-slug` 形式であることを assert
- `now` 未指定時もエラーにならないこと（デフォルト Date 使用）
- git mv の引数に日付 prefix 付き path が渡されることを verify

## [x] Task 5: `checkSlugCollision` を prefix-aware に変更

**file**: `src/core/request/store.ts`

1. `parseArchiveDirName` を `../../util/paths.js` から import
2. Check 2 の照合ロジックを変更:

```typescript
// Before:
if (entries.includes(slug)) {

// After:
const match = entries.find(e => parseArchiveDirName(e).slug === slug);
if (match) {
  const stat = await fs.stat(path.join(archiveDir, match));
```

`match` を使って stat する（entry 名は日付付きの可能性があるため）。

## [x] Task 6: `store.test.ts` に prefix 付き archive collision テスト追加

**file**: `tests/unit/core/request/store.test.ts`

TC-ST-009 describe 内に以下を追加:

- `"2026-05-20-archived-feature"` dir が存在する時、slug `"archived-feature"` で `SLUG_COLLISION` が throw されること
- 既存の日付なし dir テストも維持（後方互換確認）

## [x] Task 7: delta spec 作成

**file**: `specrunner/changes/dated-archive-folders/specs/cli-finish-command/delta.md`

`cli-finish-command` capability に archive path format の Requirement を追加する delta spec を作成（本タスクファイルと同時に生成済）。

## [x] Task 8: SKILL.md の archive path 言及更新

**file**: `.claude/skills/acceptance-and-issue-audit/SKILL.md`

Line 45 を変更:

```
# Before:
- merged: `specrunner/changes/archive/<slug>/request.md`

# After:
- merged: `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/request.md`
```

## [x] Task 9: typecheck + test green 確認

`bun run typecheck && bun run test` を実行し green を確認する。
