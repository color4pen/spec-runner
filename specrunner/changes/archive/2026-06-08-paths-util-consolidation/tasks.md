# Tasks: CLI のパス直書きを util/paths.ts に統一する

## T-01: `src/cli/init.ts` のパス直書きを paths 関数に置き換える

対象: `src/cli/init.ts`

- [x] import を追加する: `import { changesDirRel, draftsDir } from "../util/paths.js";`（既存 import 群の並びに合わせて 1 行追加）。
- [x] line 71 `path.join(repoRoot, "specrunner", "drafts")` を `path.join(repoRoot, draftsDir())` に置き換える。
- [x] line 72 `path.join(repoRoot, "specrunner", "changes")` を `path.join(repoRoot, changesDirRel())` に置き換える。
- [x] `path` import は他で使われ続けるため除去しない。`fs.mkdir` 呼び出しの `{ recursive: true }` や制御フローは変更しない。

**Acceptance Criteria**:
- `init.ts` 内に `"specrunner"` / `"drafts"` / `"changes"` のディレクトリ構造リテラル直書きが残っていない。
- drafts パスは `path.join(repoRoot, draftsDir())`、changes パスは `path.join(repoRoot, changesDirRel())` で構築される。
- 構築される絶対パスは変更前と同一（`<repoRoot>/specrunner/drafts`、`<repoRoot>/specrunner/changes`）。
- `runInit` のシグネチャ・exit code・git repo 判定スキップ挙動に変更がない。

## T-02: `src/cli/archive.ts` のパス直書きを paths 関数に置き換える

対象: `src/cli/archive.ts`

- [x] 既存 import `import { requestMdPath } from "../util/paths.js";` に `archivedChangesDirRel` と `archivedChangeFolderPath` を追加する（同一 import 行へ集約）。
- [x] line 119 `path.join(opts.cwd, "specrunner", "changes", "archive")` を `path.join(opts.cwd, archivedChangesDirRel())` に置き換える。
- [x] line 123-125 `path.join(opts.cwd, "specrunner", "changes", "archive", archiveEntry, "request.md")` を `path.join(opts.cwd, archivedChangeFolderPath(archiveEntry), "request.md")` に置き換える。
- [x] `archiveEntry` を得る `archivePaths.find(...)` 行や、`parseRequestMd` 呼び出し・try/catch フォールバック構造・`baseBranch` 解決ロジックは変更しない。`path` import は除去しない。

**Acceptance Criteria**:
- `archive.ts` 内に `"specrunner"` / `"changes"` / `"archive"` のディレクトリ構造リテラル直書きが残っていない。
- archive 列挙パスは `path.join(opts.cwd, archivedChangesDirRel())`、archive 内 request.md パスは `path.join(opts.cwd, archivedChangeFolderPath(archiveEntry), "request.md")` で構築される。
- 構築される絶対パスは変更前と同一（`<cwd>/specrunner/changes/archive`、`<cwd>/specrunner/changes/archive/<archiveEntry>/request.md`）。
- `runArchive` の制御フロー・例外処理・exit code・関数シグネチャに変更がない。

## T-03: 検証

- [x] `bun run typecheck` が pass する。
- [x] `bun run test` が pass する（既存テストに regression なし。特に `tests/init.test.ts` の drafts/changes 生成検証が green）。
- [x] `bun run lint` が pass する（`--max-warnings 0`。未使用 import / unused-vars warning を出さない）。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- `bun run lint` が green。
- request.md の受け入れ基準 3 項目（init.ts / archive.ts からリテラル直書きが消え paths 関数を使用 / typecheck+test green / lint green）をすべて満たす。
