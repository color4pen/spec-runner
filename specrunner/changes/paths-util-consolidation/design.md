# Design: CLI のパス直書きを util/paths.ts に統一する

## Context

`src/util/paths.ts` は specrunner のディレクトリ構造（`specrunner/changes`, `specrunner/drafts`,
`specrunner/changes/archive` 等）を相対パスで返す pure function を一元的に提供する。各関数は cwd / repoRoot を
prefix しない相対パスを返し、絶対パスが必要な呼び出し側は `path.join(cwd, fn(...))` で合成する規約になっている
（ファイル冒頭の docstring「D1/D2」）。

CLI 層の 4 箇所がこの規約を使わず、ディレクトリ構造をリテラル文字列で直書きしている。

| # | 箇所 | 現状 | 使うべき関数（既存） | 返す相対パス |
|---|------|------|----------------------|--------------|
| 1 | `src/cli/init.ts:71` | `path.join(repoRoot, "specrunner", "drafts")` | `draftsDir()` | `specrunner/drafts` |
| 2 | `src/cli/init.ts:72` | `path.join(repoRoot, "specrunner", "changes")` | `changesDirRel()` | `specrunner/changes` |
| 3 | `src/cli/archive.ts:119` | `path.join(opts.cwd, "specrunner", "changes", "archive")` | `archivedChangesDirRel()` | `specrunner/changes/archive` |
| 4 | `src/cli/archive.ts:124` | `path.join(opts.cwd, "specrunner", "changes", "archive", archiveEntry, "request.md")` | `archivedChangeFolderPath(archiveEntry)` + `"request.md"` | `specrunner/changes/archive/<archiveEntry>/request.md` |

これらは構造定数（`specrunner/changes` 等）が変わったときに `util/paths.ts` と黙って乖離する。
直近の #551（`archive-dir-bootstrap`）は init が `archive/` を作らないという同種の構造仮定の取りこぼしが原因であり、
本変更はその再発リスクを直書きの除去によって縮小する。

`util/paths.ts` には置換に必要な関数（`draftsDir`, `changesDirRel`, `archivedChangesDirRel`,
`archivedChangeFolderPath`）が**すべて既存**で、新規追加は不要。`archive.ts` は既に
`import { requestMdPath } from "../util/paths.js"` を持つため、同一 import 行への追加で済む。`init.ts` は
`util/paths.js` を未 import なので新規 import 行を 1 行追加する。

### 触れる seam

- `src/cli/init.ts` — line 71 / 72 の 2 箇所 + import 追加。
- `src/cli/archive.ts` — line 119 / 124 の 2 箇所 + 既存 import への追加。
- `src/util/paths.ts` — **読み取りのみ**（変更しない）。

## Goals / Non-Goals

**Goals**:

- 上記 4 箇所のパスリテラル直書きを `util/paths.ts` の既存関数呼び出しに置き換える。
- 置換後に各箇所が合成する絶対パス文字列が現状と**バイト同一**であること（挙動完全保存）。

**Non-Goals**:

- `util/paths.ts` への新規関数追加（既存関数で全箇所カバー可能）。
- テストコード内のパス直書きの是正。
- 4 箇所以外（他の CLI / core モジュール）のパス直書き調査・是正。
- `init` / `archive` の制御フロー・関数シグネチャ・例外処理・exit code の変更。

## Decisions

### D1: 各リテラルを `path.join(cwd, fn(...))` 合成に置き換える（相対関数 + 既存合成規約）

`util/paths.ts` の関数は相対パスを返す設計のため、絶対パスを使う 4 箇所は `path.join(repoRoot|cwd, fn(...))` の形を維持する。
`path.join` はセグメント区切りを正規化するため、`path.join(repoRoot, "specrunner/drafts")` と
`path.join(repoRoot, "specrunner", "drafts")` は同一の正規化結果を返し、出力文字列は変わらない。

具体置換:

- 1: `path.join(repoRoot, draftsDir())`
- 2: `path.join(repoRoot, changesDirRel())`
- 3: `path.join(opts.cwd, archivedChangesDirRel())`
- 4: `path.join(opts.cwd, archivedChangeFolderPath(archiveEntry), "request.md")`

**Rationale**: 相対関数 + 呼び出し側合成は本リポジトリの確立済み規約（`archive-dir-bootstrap` D1 で
`path.join(cwd, archivedChangesDirRel())` を採用済み）。新しい絶対パス関数を足すより既存規約に揃える方が
minimal-deps かつ paths.ts の責務（相対パス生成）を保てる。

**Alternatives considered**:

- *`util/paths.ts` に絶対パス版を新設する*: スコープ外かつ paths.ts の「相対パスのみ」設計（docstring D2）に反する。却下。
- *リテラルを定数化して両者で共有する*: `util/paths.ts` が既にその単一情報源であり、二重化になる。却下。

### D2: 箇所 4 は `archivedChangeFolderPath(archiveEntry)` を使う（`archivedChangesDirRel()` + 手動結合ではなく）

箇所 4 は `archive/<archiveEntry>/request.md` を指す。`archiveEntry` は line 121 で
`archivePaths.find((p) => p.endsWith(`-${opts.slug}`))` により得る archive ディレクトリ名（`<YYYY-MM-DD>-<slug>` 形式）であり、
`archivedChangeFolderPath(datedSlug)` の引数仕様にそのまま合致する。
よって `path.join(opts.cwd, archivedChangeFolderPath(archiveEntry), "request.md")` とする。

**Rationale**: `archivedChangeFolderPath` は「archive 内の 1 change フォルダ」を表す既存の意味単位であり、
`archivedChangesDirRel()` に `archiveEntry` を手で繋ぐより意図が明示的で、`"archive"` セグメントの再露出を避けられる。
`request.md` は paths.ts に「archive 内の request.md」専用関数が無いため、フォルダ関数 + `"request.md"` の合成で表す
（既存 `requestMdPath` は active change 用で archive には使えない）。

**Alternatives considered**:

- *`path.join(opts.cwd, archivedChangesDirRel(), archiveEntry, "request.md")`*: 動作は同一だが `archive` フォルダの単位を
  表す関数があるのに使わず、結合段数が増える。D2 採用で却下。

### D3: import は最小追加・既存行へ集約する

- `init.ts`: `import { changesDirRel, draftsDir } from "../util/paths.js";` を新規追加。
- `archive.ts`: 既存の `import { requestMdPath } from "../util/paths.js";` に
  `archivedChangesDirRel`, `archivedChangeFolderPath` を追加。

`path` import はどちらのファイルでも置換後も `path.join` で使われ続けるため除去しない
（除去すると lint の `no-unused-vars` warning + `--max-warnings 0` で fail する）。

## Risks / Trade-offs

- [Risk] 出力パスがリファクタ前後で 1 文字でもずれると `init` のスキャフォルド先 /
  `archive` の baseBranch 解決先が変わる → [Mitigation] 各関数の返り値（表の「返す相対パス」列）が
  現状リテラルと一致することを spec の Scenario で固定し、`bun run test` の既存 init テスト
  （`tests/init.test.ts` の drafts/changes 生成検証）が green であることで観測的に裏付ける。
- [Risk] `path` import を誤って未使用にして lint fail → [Mitigation] D3 で除去しないことを明示。

## Open Questions

なし。
