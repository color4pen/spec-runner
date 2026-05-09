# Tasks: worktree-guard

## 1. worktree 検出ユーティリティの作成

- [x] 1.1 `src/core/worktree/detection.ts` を新規作成
  - `detectWorktree(cwd: string): Promise<{ isWorktree: boolean; mainWorktreePath?: string }>` を export
  - `path.join(cwd, ".git")` を `fs.stat()` で確認
  - `isFile()` の場合: `.git` ファイルを読み、`gitdir: <path>` 行をパースして main worktree パスを導出
  - `isDirectory()` の場合: `{ isWorktree: false }` を返す
  - ENOENT（`.git` が存在しない）の場合: `{ isWorktree: false }` を返す（後段の preflight で NOT_GIT_REPO として拾われる）
  - main worktree パスの導出: `gitdir:` の値（例: `../../.git/specrunner-worktrees/slug-abc12345`）から `.git` の親ディレクトリを取得

## 2. エラーコードの追加

- [x] 2.1 `src/errors.ts` の `ERROR_CODES` に `WORKTREE_GUARD: "WORKTREE_GUARD"` を追加
- [x] 2.2 ファクトリ関数 `worktreeGuardError(command: string, mainPath: string): SpecRunnerError` を追加
  - message: `"This command cannot be run from inside a worktree."`
  - hint: `` `Run from the main worktree: cd ${mainPath}` ``
  - code: `ERROR_CODES.WORKTREE_GUARD`

## 3. エントリポイントにガードを挿入

- [x] 3.1 `bin/specrunner.ts` にガード対象コマンドの `Set` を定義
  - `const WORKTREE_GUARDED_COMMANDS = new Set(["run", "finish", "resume"]);`
- [x] 3.2 コマンドハンドラ呼び出し前（通常コマンドディスパッチの `try` ブロック内、`parseFlags` の後、`entry.handler` の前）に worktree チェックを挿入
  - `WORKTREE_GUARDED_COMMANDS.has(command)` の場合のみ `detectWorktree(process.cwd())` を呼ぶ
  - `isWorktree === true` なら `worktreeGuardError(command, mainWorktreePath)` を throw
  - 既存の `SpecRunnerError` catch で hint 付きエラーメッセージが表示される（FlagParseError の catch の後に SpecRunnerError の catch を追加）

## 4. テスト

- [x] 4.1 `tests/core/worktree/detection.test.ts` を新規作成
  - `.git` がディレクトリの場合: `isWorktree: false` を返す
  - `.git` がファイル（`gitdir: ../../.git/specrunner-worktrees/foo-12345678`）の場合: `isWorktree: true` と正しい `mainWorktreePath` を返す
  - `.git` が存在しない場合: `isWorktree: false` を返す
  - テストは tmp ディレクトリにファイルシステムを作って検証する（DI 不要、実ファイルで十分単純）
- [x] 4.2 `bin/specrunner.ts` のガードの統合テスト（既存の `tests/cli.test.ts` パターンに倣う）
  - worktree 内から `run` を実行 → stderr に worktree guard エラーが出力される
  - worktree 内から `ps` を実行 → ガードされずに正常動作する

## 5. 検証

- [x] 5.1 `bun run typecheck` が green
- [x] 5.2 `bun run test` が green
