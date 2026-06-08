# CLI のパス直書きを util/paths.ts に統一する

## Meta

- **type**: refactoring
- **slug**: paths-util-consolidation
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`util/paths.ts` にパス生成関数（`draftsDir()`, `changesDirRel()`, `archivedChangesDirRel()` 等）が整備されているが、CLI 層の一部がこれを使わず `path.join(...)` でパスを直書きしている。

- `src/cli/init.ts:71` — `path.join(repoRoot, "specrunner", "drafts")`（`draftsDir()` を使うべき）
- `src/cli/init.ts:72` — `path.join(repoRoot, "specrunner", "changes")`（`changesDirRel()` を使うべき）
- `src/cli/archive.ts:119` — `path.join(opts.cwd, "specrunner", "changes", "archive")`（`archivedChangesDirRel()` を使うべき）
- `src/cli/archive.ts:124` — `path.join(opts.cwd, "specrunner", "changes", "archive", archiveEntry, "request.md")`

パス定数が変わった場合にこれらが黙って乖離する。#551（archive-dir-bootstrap）と同種のリスク。

## 要件

1. 上記 4 箇所を `util/paths.ts` の既存関数を使った形に置き換える。
2. 新規の関数追加は不要（既存関数でカバーできる）。

## スコープ外

- `util/paths.ts` への新規関数追加。
- テスト内のパス直書き。

## 受け入れ基準

- [ ] `src/cli/init.ts` と `src/cli/archive.ts` からパス文字列のリテラル直書きが消え、`util/paths.ts` の関数を使っている
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- 4 箇所の置換のみ。挙動は一切変わらない（関数が返す値は同じ文字列）。
