# Spec: CLI のパス構築を util/paths.ts に統一する

## Requirements

### Requirement: init / archive のパス構築は util/paths.ts の関数経由で行う

`src/cli/init.ts` と `src/cli/archive.ts` は specrunner ディレクトリ構造
（`specrunner/drafts`, `specrunner/changes`, `specrunner/changes/archive`, archive 内 change フォルダ）の
パスを構築する際、`path.join` のリテラルセグメント列ではなく `src/util/paths.ts` の既存関数
（`draftsDir`, `changesDirRel`, `archivedChangesDirRel`, `archivedChangeFolderPath`）を MUST 使う。
構築される最終的なパス文字列は本変更の前後で SHALL 同一でなければならない（挙動完全保存）。

#### Scenario: init の drafts ディレクトリ構築

**Given** `runInit` が git リポジトリ内で実行され `repoRoot` が解決済み
**When** drafts スキャフォルドディレクトリのパスを構築する
**Then** `path.join(repoRoot, draftsDir())` を用い、結果は `<repoRoot>/specrunner/drafts` に一致する

#### Scenario: init の changes ディレクトリ構築

**Given** `runInit` が git リポジトリ内で実行され `repoRoot` が解決済み
**When** changes スキャフォルドディレクトリのパスを構築する
**Then** `path.join(repoRoot, changesDirRel())` を用い、結果は `<repoRoot>/specrunner/changes` に一致する

#### Scenario: archive ディレクトリの列挙パス構築

**Given** `runArchive` が active change の request.md 解決に失敗し archive フォールバックに入る
**When** archive ディレクトリを `readdir` する対象パスを構築する
**Then** `path.join(opts.cwd, archivedChangesDirRel())` を用い、結果は `<cwd>/specrunner/changes/archive` に一致する

#### Scenario: archive 内 request.md のパス構築

**Given** archive ディレクトリ内に `<YYYY-MM-DD>-<slug>` 形式の `archiveEntry` が見つかった
**When** その change フォルダの request.md パスを構築する
**Then** `path.join(opts.cwd, archivedChangeFolderPath(archiveEntry), "request.md")` を用い、
結果は `<cwd>/specrunner/changes/archive/<archiveEntry>/request.md` に一致する

#### Scenario: パスリテラル直書きが残らない

**Given** 本変更が適用された後の `src/cli/init.ts` と `src/cli/archive.ts`
**When** 対象 4 箇所のパス構築を確認する
**Then** `"specrunner"` / `"drafts"` / `"changes"` / `"archive"` といったディレクトリ構造リテラルの直書きが存在せず、
すべて `util/paths.ts` の関数呼び出しに置き換わっている
