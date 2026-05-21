# Test Cases: `specrunner job cancel <jobId>`

Source: request.md / design.md / tasks.md

---

## Category: Status-Based Cancel — running

### TC-01 [must] running → SIGTERM 即終了で cancel 成功
- **Source**: req §2, design D2
- **GIVEN** status=`running`, state.pid=<valid pid>, SIGTERM でプロセスが即終了する
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })` を実行
- **THEN**
  - exit code 0
  - gracefulKill が SIGTERM を送信する
  - state file に `status: "canceled"`, `error.code: "USER_CANCELED"`, `canceledAt` (ISO 8601) が記録される
  - worktree / local branch / remote branch が削除される

### TC-02 [must] running → SIGTERM タイムアウト後 SIGKILL にフォールバック
- **Source**: req §2, design D2, task 2.1
- **GIVEN** status=`running`, state.pid=<valid pid>, SIGTERM 後 5 秒以内にプロセスが終了しない
- **WHEN** `cancelSingleJob(...)` を実行
- **THEN**
  - exit code 0
  - SIGTERM 送信後 5 秒 polling → SIGKILL が送信される
  - state file に `status: "canceled"` が記録される
  - cleanup (worktree / branch) が実行される

### TC-03 [must] running + state.pid = null → warning + 状態遷移は続行
- **Source**: design D2, task 3.3
- **GIVEN** status=`running`, state.pid=null
- **WHEN** `cancelSingleJob(...)` を実行
- **THEN**
  - exit code 0
  - kill をスキップし warnings に pid-not-found 相当の警告が含まれる
  - state file に `status: "canceled"` が記録される
  - cleanup が実行される

---

## Category: Status-Based Cancel — awaiting-resume / awaiting-merge

### TC-04 [must] awaiting-resume → cancel 成功
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`awaiting-resume`
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })`
- **THEN**
  - exit code 0
  - state file に `status: "canceled"`, `error.code: "USER_CANCELED"`, `canceledAt` が記録される
  - worktree / local branch / remote branch が削除される

### TC-05 [must] awaiting-merge + `--force` なし → reject (exit 1)
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`awaiting-merge`
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })`
- **THEN**
  - exit code 1
  - stderr に「PR が open です。`--force` を付与してください」相当のメッセージ
  - state file は変更されない

### TC-06 [must] awaiting-merge + `--force` あり → cancel 成功 (remote branch 削除で PR auto-close)
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`awaiting-merge`
- **WHEN** `cancelSingleJob({ jobId, force: true, purge: false })`
- **THEN**
  - exit code 0
  - remote branch が削除される
  - state file に `status: "canceled"`, `canceledAt` が記録される
  - worktree が削除される

---

## Category: Status-Based Cancel — failed / terminated / archived / canceled

### TC-07 [must] failed → cancel 成功 (cleanup 用途)
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`failed`
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })`
- **THEN**
  - exit code 0
  - state file に `status: "canceled"`, `error.code: "USER_CANCELED"`, `canceledAt` が記録される
  - worktree / branch が削除される

### TC-08 [must] terminated → cancel 成功 (cleanup 用途)
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`terminated`
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })`
- **THEN**
  - exit code 0
  - state file に `status: "canceled"`, `error.code: "USER_CANCELED"`, `canceledAt` が記録される
  - cleanup が実行される

### TC-09 [must] archived → reject (exit 1)
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`archived`
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })`
- **THEN**
  - exit code 1
  - stderr に「既に archived です。cancel できません」相当のメッセージ
  - state file は変更されない

### TC-10 [must] canceled (idempotent) → cleanup のみ、state file は変更しない
- **Source**: req §2, acceptance criteria
- **GIVEN** status=`canceled`
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: false })`
- **THEN**
  - exit code 0
  - state file の `status` / `canceledAt` / `error` は更新されない (touch しない)
  - worktree / branch の残存分があれば cleanup が実行される

---

## Category: State File Assertions

### TC-11 [must] cancel 後の state file に必須フィールドが記録される
- **Source**: req §2 共通ルール, acceptance criteria
- **GIVEN** status=`awaiting-resume` の job
- **WHEN** cancel 成功後
- **THEN**
  - `status === "canceled"`
  - `error.code === "USER_CANCELED"`
  - `error.message` が空でない
  - `canceledAt` が ISO 8601 形式の文字列
  - `worktreePath === null`

### TC-12 [must] state file は削除されない (audit trail 保持)
- **Source**: req §2 共通ルール, design ADR
- **GIVEN** `--purge` を指定せずに cancel
- **WHEN** cancel 成功後
- **THEN** state file がファイルシステムに存在する

### TC-13 [must] canceled (idempotent) case は state file を書き換えない
- **Source**: req §2
- **GIVEN** status=`canceled`, canceledAt="2025-01-01T00:00:00.000Z" の state file
- **WHEN** `cancelSingleJob(...)` を実行
- **THEN** state file の `canceledAt` は変更前の値のまま

---

## Category: Cleanup Behavior

### TC-14 [must] cancel 後に worktree が削除される
- **Source**: req §2, acceptance criteria
- **GIVEN** `.git/specrunner-worktrees/<slug>-<jobId>` が存在する job
- **WHEN** cancel 成功後
- **THEN** worktree ディレクトリが存在しない

### TC-15 [must] cancel 後に local branch が削除される
- **Source**: req §2, acceptance criteria
- **GIVEN** `change/<slug>-<jobId>` ブランチが存在する
- **WHEN** cancel 成功後
- **THEN** local branch が存在しない

### TC-16 [must] cancel 後に remote branch が削除される (存在する場合)
- **Source**: req §2, acceptance criteria
- **GIVEN** `origin/change/<slug>-<jobId>` が存在する
- **WHEN** cancel 成功後
- **THEN** remote branch が削除される

### TC-17 [must] worktree 削除前に `git worktree prune` が実行される
- **Source**: req §2 共通ルール, task 3.1
- **GIVEN** orphan reference が存在する状態
- **WHEN** cancel を実行
- **THEN** `worktreeManager.prune(repoRoot)` が worktree remove より先に呼ばれる

### TC-18 [should] worktreePath が null → worktree 削除をスキップ
- **Source**: design D8
- **GIVEN** state.worktreePath が null の job
- **WHEN** cancel を実行
- **THEN**
  - exit code 0
  - worktree 削除はスキップ (エラーにならない)

### TC-19 [should] remote branch 削除失敗 (push 権限不足) → warning、exit 0 を維持
- **Source**: design D3
- **GIVEN** `git push origin --delete <branch>` が non-zero で失敗
- **WHEN** cancel を実行
- **THEN**
  - exit code 0
  - warnings に remote branch 削除失敗の旨が含まれる

### TC-20 [should] local branch 削除失敗 → warning、exit 0 を維持 (best-effort)
- **Source**: task 3.1 cleanup
- **GIVEN** `git branch -D <branch>` が失敗
- **WHEN** cancel を実行
- **THEN**
  - exit code 0
  - warnings が含まれる

---

## Category: --purge flag

### TC-21 [must] `--purge` で cancel + state file 物理削除
- **Source**: req §3, acceptance criteria
- **GIVEN** status=`awaiting-resume` の job
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: true })`
- **THEN**
  - exit code 0
  - state file がファイルシステムに存在しない
  - cleanup (worktree / branch) が実行される

### TC-22 [must] `--purge` + canceled (idempotent) → cleanup 後 state file 削除
- **Source**: task 3.1
- **GIVEN** status=`canceled` の job
- **WHEN** `cancelSingleJob({ jobId, force: false, purge: true })`
- **THEN**
  - exit code 0
  - state file がファイルシステムに存在しない

---

## Category: --all-terminated bulk cleanup

### TC-23 [must] `--all-terminated` で failed/terminated/canceled が一括削除される
- **Source**: req §4, acceptance criteria
- **GIVEN** failed × 1, terminated × 1, canceled × 1, archived × 1 の state file が存在する
- **WHEN** `cancelAllTerminated({ yes: true })`
- **THEN**
  - exit code 0
  - failed / terminated / canceled の state file が削除される

### TC-24 [must] `--all-terminated` 後も archived の state file は残存する
- **Source**: req §4, acceptance criteria
- **GIVEN** archived の state file が存在する
- **WHEN** `cancelAllTerminated({ yes: true })`
- **THEN** archived の state file がファイルシステムに残っている

### TC-25 [must] `--all-terminated --yes` で確認なし実行
- **Source**: req §4
- **GIVEN** failed/terminated 各 1 件
- **WHEN** `cancelAllTerminated({ yes: true })`
- **THEN**
  - prompt を出さずに削除される
  - exit code 0

### TC-26 [must] `--all-terminated` + non-TTY + `--yes` なし → reject (exit 1)
- **Source**: req §4
- **GIVEN** 非 TTY 環境, `--yes` 未指定
- **WHEN** `cancelAllTerminated({ yes: false, stdin: non-tty stream })`
- **THEN**
  - exit code 1
  - stderr にエラーメッセージ (--yes 必須の旨)

### TC-27 [must] `--all-terminated` + TTY → 削除対象一覧表示 + y/N 確認
- **Source**: req §4
- **GIVEN** TTY 環境, `--yes` 未指定, failed 1 件
- **WHEN** `cancelAllTerminated({ yes: false, stdin: tty })` で y 入力
- **THEN**
  - 削除対象一覧が表示される
  - 確認後に削除される
  - exit code 0

### TC-28 [should] `--all-terminated` で対象 0 件 → early return
- **Source**: task 3.2
- **GIVEN** failed / terminated / canceled のいずれも存在しない
- **WHEN** `cancelAllTerminated({ yes: true })`
- **THEN**
  - exit code 0
  - "No terminated jobs to remove." 相当のメッセージが出力される

---

## Category: CLI Arg Validation

### TC-29 [must] `--all-terminated` と `<jobId>` は排他 → error (exit 2)
- **Source**: task 4.1
- **GIVEN** `--all-terminated` と `<jobId>` を同時指定
- **WHEN** `runCancel(...)` を実行
- **THEN** exit code 2

### TC-30 [must] `--all-terminated` なし + `<jobId>` なし → error (exit 2)
- **Source**: task 4.1
- **GIVEN** どちらも未指定
- **WHEN** `runCancel(...)` を実行
- **THEN** exit code 2

### TC-31 [must] `--purge` と `--all-terminated` は排他 → error
- **Source**: task 4.1
- **GIVEN** `--purge --all-terminated` を同時指定
- **WHEN** `runCancel(...)` を実行
- **THEN** exit code 2 (または exit 1) でエラーメッセージ

---

## Category: CLI Dispatch / Migration

### TC-32 [must] `specrunner job rm <jobId>` → unknown subcommand エラーで exit
- **Source**: req §7, acceptance criteria
- **GIVEN** `job rm` が command-registry から削除されている
- **WHEN** `specrunner job rm <jobId>` を実行
- **THEN** non-zero exit, unknown subcommand エラーメッセージ

### TC-33 [must] `specrunner rm <jobId>` → unknown subcommand エラーで exit
- **Source**: req §7, acceptance criteria
- **GIVEN** top-level `rm` alias が削除されている
- **WHEN** `specrunner rm <jobId>` を実行
- **THEN** non-zero exit, unknown subcommand エラーメッセージ

### TC-34 [must] 旧 rm 実装ファイルが git 管理下に存在しない
- **Source**: req acceptance criteria
- **GIVEN** 実装完了後
- **WHEN** `git ls-files src/cli/rm.ts src/core/rm/runner.ts`
- **THEN** 出力が空である

---

## Category: assertJobFinishable hint

### TC-35 [must] failed 状態の hint が `specrunner job cancel <jobId>` を案内する
- **Source**: req §5, acceptance criteria, task 6.1
- **GIVEN** STATUS_HINTS に `failed` のエントリが存在する
- **WHEN** hint 文字列を参照
- **THEN** 文字列に `specrunner job cancel <jobId>` が含まれる (旧 `job rm` を含まない)

### TC-36 [must] terminated 状態の hint が `specrunner job cancel <jobId>` を案内する
- **Source**: req §5, task 6.1
- **GIVEN** STATUS_HINTS に `terminated` のエントリが存在する
- **WHEN** hint 文字列を参照
- **THEN** 文字列に `specrunner job cancel <jobId>` が含まれる

---

## Category: gracefulKill unit

### TC-37 [must] SIGTERM 送信後 即終了 → killed=true
- **Source**: task 2.2, design D2
- **GIVEN** SIGTERM 送信直後に isAlive=false になる mock
- **WHEN** `gracefulKill(pid, 5000, deps)`
- **THEN** `{ killed: true }` が返る

### TC-38 [must] SIGTERM timeout → SIGKILL にフォールバック
- **Source**: task 2.2, design D2
- **GIVEN** SIGTERM 後 isAlive が timeout まで true を返し続ける mock
- **WHEN** `gracefulKill(pid, 5000, deps)`
- **THEN**
  - SIGKILL が呼ばれる
  - `{ killed: true }` が返る

### TC-39 [must] pid 不在 (ESRCH) → killed=true (正常扱い)
- **Source**: task 2.2, design D2
- **GIVEN** kill(pid, "SIGTERM") が ESRCH をスロー
- **WHEN** `gracefulKill(pid, 5000, deps)`
- **THEN** `{ killed: true }` が返る

### TC-40 [must] EPERM で kill 失敗 → killed=false + warning
- **Source**: task 2.2, design D2
- **GIVEN** kill(pid, "SIGTERM") が EPERM をスロー
- **WHEN** `gracefulKill(pid, 5000, deps)`
- **THEN** `{ killed: false, warning: <message> }` が返る

---

## Category: Schema / Lifecycle

### TC-41 [must] canceledAt が absent の既存 state file がバリデーションを通過する
- **Source**: task 1.1, design D6
- **GIVEN** `canceledAt` フィールドを持たない既存の state file JSON
- **WHEN** `validateJobState(...)` を実行
- **THEN** バリデーションエラーにならない

### TC-42 [should] VALID_TRANSITIONS に running→canceled / awaiting-merge→canceled が含まれる
- **Source**: task 1.2, design D1
- **GIVEN** `VALID_TRANSITIONS` を参照
- **WHEN** `canTransition("running", "canceled")` / `canTransition("awaiting-merge", "canceled")` を確認
- **THEN** どちらも `true` を返す

### TC-43 [should] ERROR_CODES に USER_CANCELED が定義されている
- **Source**: task 1.3, design D7
- **GIVEN** `src/errors.ts` の `ERROR_CODES`
- **WHEN** `ERROR_CODES.USER_CANCELED` を参照
- **THEN** 値が `"USER_CANCELED"` である

---

## Category: Build / Regression

### TC-44 [must] `bun run typecheck` が green
- **Source**: req acceptance criteria
- **GIVEN** 全実装完了後
- **WHEN** `bun run typecheck`
- **THEN** exit code 0

### TC-45 [must] `bun run test` が green
- **Source**: req acceptance criteria
- **GIVEN** 全実装完了後
- **WHEN** `bun run test`
- **THEN** exit code 0 (旧 rm テストを含む全テストが通過)
