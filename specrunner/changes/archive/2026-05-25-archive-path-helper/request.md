# archive 周辺の path リテラル直書きを `util/paths.ts` に集約する

## Meta

- **type**: bug-fix
- **slug**: archive-path-helper
- **base-branch**: main
- **adr**: false

## 背景

`util/paths.ts` には `CHANGES_DIR` 定数および `changeFolderPath()` / `specReviewResultPath()` / `reviewFeedbackPath()` / `verificationResultPath()` 等のヘルパーが集約されているが、**archive subdir 周辺は未集約**で 3 箇所にリテラル直書きが残存している。

該当箇所:

- `src/context/request-patterns.ts:31` — `path.join(cwd, "specrunner", "changes", "archive")`
- `src/core/doctor/checks/repo/workflow-structure.ts:25` — `path.join(ctx.cwd, "specrunner", "changes")`
- `src/core/request/store.ts:10` — `const ARCHIVE_SUBDIR = path.join("specrunner", "changes", "archive");`

将来 `specrunner/changes/` の配置を変える場面（例: change folder を別ディレクトリに移す）で、これら 3 箇所を grep で探して全部書き換える必要があり、漏れリスクがある。1 箇所に集約しておけば変更箇所が `util/paths.ts` だけで済む。

## 要件

1. **`util/paths.ts` に archive 系 helper を追加する**
   - `archivedChangesDirRel()` — `specrunner/changes/archive` を返す
   - `archivedChangeFolderPath(datedSlug: string)` — `specrunner/changes/archive/<datedSlug>` を返す。引数は `<YYYY-MM-DD>-<slug>` 形式の id を受け取る前提
     - 例: `archivedChangeFolderPath("2026-05-20-my-change")` → `"specrunner/changes/archive/2026-05-20-my-change"`
   - **既存の `changesDirRel()` (`paths.ts:71`) は流用する**（新規 `changesDir()` は追加しない）

2. **4 箇所のリテラル直書き / inline 構築を helper 経由に置換する**
   - `src/context/request-patterns.ts:31` — `path.join(cwd, "specrunner", "changes", "archive")` → `path.join(cwd, archivedChangesDirRel())`
   - `src/core/doctor/checks/repo/workflow-structure.ts:25` — `path.join(ctx.cwd, "specrunner", "changes")` → `path.join(ctx.cwd, changesDirRel())`
   - `src/core/request/store.ts:10` — `path.join("specrunner", "changes", "archive")` → `archivedChangesDirRel()` 相当
   - `src/core/finish/archive-change-folder.ts:48` — `${changesDirRel()}/archive/${dateStr}-${slug}` → `archivedChangeFolderPath(\`${dateStr}-${slug}\`)`

3. **behavior change なし**
   - 純粋な refactor。実行時に同じ path が返ることを test で担保する

## スコープ外

- `CHANGES_DIR` 定数自体の値変更（`specrunner/changes` のまま）
- archive subdir の構造変更（`archive/<YYYY-MM-DD>-<slug>/` 形式は維持）
- `util/paths.ts` の他の helper の見直し（spec-review-result / review-feedback / verification-result 等は対象外）
- 他のリテラル直書き箇所（grep ヒットしないが err message / comment 内に文字列として "specrunner/changes" を持つ箇所）— 動作に影響しない文字列のみの言及は触らない

## 受け入れ基準

- [ ] `util/paths.ts` に `archivedChangeFolderPath(datedSlug)` / `archivedChangesDirRel()` helper が export されている
- [ ] 4 箇所のリテラル直書き / inline 構築が helper 経由に置換されている (context/request-patterns / doctor/workflow-structure / request/store / finish/archive-change-folder)
- [ ] `bun run typecheck && bun run test` が green
- [ ] 既存の archive 動作 (`finish` 時の rename, `doctor` の存在チェック, `request store` の lookup) が変わらない
- [ ] 新規 helper の unit test を追加

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- **既存 helper の命名 convention に揃える**: `changeFolderPath(slug)` がある → `archivedChangeFolderPath(slug)` の命名でペアを成す
- **`changesDir()` も追加するか**: 直書き 3 箇所のうち 2 つは `specrunner/changes/archive`、1 つは `specrunner/changes` を指す。後者用にも helper を用意してリテラル排除を完全化する
