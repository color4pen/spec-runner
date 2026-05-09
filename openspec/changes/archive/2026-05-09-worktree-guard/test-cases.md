# Test Cases: worktree-guard

## TC-01: detectWorktree — .git がディレクトリの場合

**Priority**: must

**GIVEN** cwd に `.git` ディレクトリが存在する（main worktree）  
**WHEN** `detectWorktree(cwd)` を呼ぶ  
**THEN** `{ isWorktree: false }` を返す

---

## TC-02: detectWorktree — .git がファイルの場合（isWorktree: true）

**Priority**: must

**GIVEN** cwd に `.git` ファイルが存在し、内容が `gitdir: ../../.git/specrunner-worktrees/foo-12345678` である  
**WHEN** `detectWorktree(cwd)` を呼ぶ  
**THEN** `{ isWorktree: true, mainWorktreePath: <正しいパス> }` を返す

---

## TC-03: detectWorktree — mainWorktreePath の導出

**Priority**: must

**GIVEN** `.git` ファイルの `gitdir:` 値が `../../.git/specrunner-worktrees/foo-12345678` である  
**WHEN** `detectWorktree(cwd)` を呼ぶ  
**THEN** `mainWorktreePath` が `gitdir:` パスから `.git` を除いた親ディレクトリ（main worktree のルート）に解決される

---

## TC-04: detectWorktree — .git が存在しない場合

**Priority**: must

**GIVEN** cwd に `.git` ファイルもディレクトリも存在しない  
**WHEN** `detectWorktree(cwd)` を呼ぶ  
**THEN** `{ isWorktree: false }` を返す（ENOENT を throw しない）

---

## TC-05: detectWorktree — .git ファイルの前後空白トリミング

**Priority**: should

**GIVEN** `.git` ファイルの `gitdir:` 行に前後空白が含まれる（例: `gitdir:  ../../.git/specrunner-worktrees/bar-abcdef01 `）  
**WHEN** `detectWorktree(cwd)` を呼ぶ  
**THEN** パスが正しくトリミングされ `mainWorktreePath` が正常に解決される

---

## TC-06: worktreeGuardError — エラーコードの存在

**Priority**: must

**GIVEN** `src/errors.ts` が import される  
**WHEN** `ERROR_CODES.WORKTREE_GUARD` を参照する  
**THEN** 値 `"WORKTREE_GUARD"` が存在する

---

## TC-07: worktreeGuardError — メッセージとヒントのフォーマット

**Priority**: must

**GIVEN** `command = "run"`, `mainPath = "~/proj"` を引数に `worktreeGuardError` を呼ぶ  
**WHEN** 返された `SpecRunnerError` を確認する  
**THEN**  
- `error.message` が `"This command cannot be run from inside a worktree."` である  
- `error.hint` が `"Run from the main worktree: cd ~/proj"` を含む  
- `error.code` が `"WORKTREE_GUARD"` である

---

## TC-08: ガード — worktree 内から `run` を実行

**Priority**: must

**GIVEN** CWD が worktree 内（`.git` がファイル）  
**WHEN** `specrunner run <slug>` を実行する  
**THEN**  
- プロセスが非ゼロ終了コードで終了する  
- stderr に `"This command cannot be run from inside a worktree."` が含まれる  
- stderr に `"cd <main-worktree-path>"` が含まれる

---

## TC-09: ガード — worktree 内から `finish` を実行

**Priority**: must

**GIVEN** CWD が worktree 内（`.git` がファイル）  
**WHEN** `specrunner finish <slug>` を実行する  
**THEN**  
- プロセスが非ゼロ終了コードで終了する  
- stderr に worktree guard エラーメッセージが含まれる

---

## TC-10: ガード — worktree 内から `resume` を実行

**Priority**: must

**GIVEN** CWD が worktree 内（`.git` がファイル）  
**WHEN** `specrunner resume <slug>` を実行する  
**THEN**  
- プロセスが非ゼロ終了コードで終了する  
- stderr に worktree guard エラーメッセージが含まれる

---

## TC-11: ガード — worktree 内から `ps` を実行

**Priority**: must

**GIVEN** CWD が worktree 内（`.git` がファイル）  
**WHEN** `specrunner ps` を実行する  
**THEN** worktree guard でブロックされず、コマンドが通常通り動作する（エラーなし）

---

## TC-12: ガード — worktree 内から `doctor` を実行

**Priority**: must

**GIVEN** CWD が worktree 内（`.git` がファイル）  
**WHEN** `specrunner doctor` を実行する  
**THEN** worktree guard でブロックされず、コマンドが通常通り動作する

---

## TC-13: ガード — main worktree から `run` を実行

**Priority**: must

**GIVEN** CWD が main worktree（`.git` がディレクトリ）  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** worktree guard エラーは発生しない（通常のコマンドフローに進む）

---

## TC-14: ガード — main worktree から `finish` を実行

**Priority**: must

**GIVEN** CWD が main worktree（`.git` がディレクトリ）  
**WHEN** `specrunner finish <slug>` を実行する  
**THEN** worktree guard エラーは発生しない

---

## TC-15: エラーメッセージに main worktree パスが含まれる

**Priority**: must

**GIVEN** CWD が `/path/to/repo/.git/specrunner-worktrees/foo-12345678` 内の worktree で、`.git` ファイルの `gitdir:` が main worktree を指している  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** stderr のヒントに main worktree の絶対パス（`/path/to/repo`）が表示される

---

## TC-16: ガード — .git が存在しない環境から `run` を実行

**Priority**: should

**GIVEN** CWD に `.git` が存在しない（git リポジトリ外）  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** worktree guard エラーではなく、既存の `NOT_GIT_REPO` エラー（または後段の preflight エラー）が発生する

---

## TC-17: typecheck が green

**Priority**: must

**GIVEN** 実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-18: テストスイートが green

**Priority**: must

**GIVEN** 実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS する
