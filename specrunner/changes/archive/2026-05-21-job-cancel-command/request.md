# `specrunner job cancel <jobId>` コマンドを新設し `job rm` を統合する

## Meta

- **type**: spec-change
- **slug**: job-cancel-command
- **base-branch**: main
- **adr**: true

<!-- adr=true: 新コマンド導入 + 既存 `job rm` を統合する構造変更、audit trail 保存 vs bulk cleanup の設計トレードオフあり -->

## 背景

現状の job 中断・削除フローには 2 つの gap がある (= 関連 issue #61 / #73):

| # | gap | 影響 |
|---|---|---|
| 1 | **cancel と delete の semantic 区別が CLI に存在しない** | `job rm` は state file 物理削除 → audit trail (= いつ・なぜ止めたか) が失われる。cancel 相当の terminal 状態保存ができない |
| 2 | **`assertJobFinishable` の hint が廃止予定の `specrunner job rm` を案内** (= `src/core/finish/job-state-update.ts:13-18` の `STATUS_HINTS`) | 本 request で `job rm` を `job cancel` に統合した後、hint が古い廃止済 command を案内する状態になる |
| 3 | **`running` 中の job を強制停止する CLI 経路がない** | `running` 状態の job は process を kill して state を整える操作が必要だが、現状は手動の kill + state file 編集が要る |

schema には既に `JobStatus = "running" \| "awaiting-resume" \| "awaiting-merge" \| "failed" \| "terminated" \| "archived" \| "canceled"` が定義済 (= `src/state/schema.ts:5`)。`canceled` 状態は schema 上 valid だが、CLI から到達する経路がない。

## 要件

### 1. `specrunner job cancel <jobId>` の新設 + `job rm` 統合

`specrunner job cancel <jobId>` を新コマンドとして追加する MUST。同時に既存 `specrunner job rm <jobId>` と `specrunner rm` 系コマンド (= `src/cli/rm.ts`, `src/core/rm/runner.ts`) は廃止し、cancel に semantics を統合する MUST。

### 2. status 別の cancel 動作

`job cancel <jobId>` は対象 job の現 status に応じて以下の動作を MUST 実行する:

| status | 動作 |
|---|---|
| `running` | state.pid に SIGTERM 送信 → 5 秒待機 → 反応無ければ SIGKILL → status を `canceled` に更新 + worktree 削除 + local/remote branch 削除 |
| `awaiting-resume` | status を `canceled` に更新 + worktree 削除 + local/remote branch 削除 |
| `awaiting-merge` | `--force` 必須。指定なければ「PR が open です。`--force` を付与してください」と stderr + exit 1。`--force` 指定時は remote branch 削除 (= GitHub の挙動で関連 PR は自動 close) + status=canceled + worktree 削除 |
| `failed` / `terminated` | status を `canceled` に更新 + worktree/branch 削除 (= cleanup 用途、idempotent) |
| `archived` | reject: 「既に archived です。cancel できません」と stderr + exit 1 (= terminal 完了状態は触らない) |
| `canceled` | idempotent: worktree/branch の cleanup のみ実行 (state file は touch しない) |

cancel 動作の共通ルール:
- state file は **保存** (= 削除しない、audit trail 保持)
- `error.code = "USER_CANCELED"` を state file に記録 MUST
- `canceledAt` timestamp (ISO 8601) を state file に記録 MUST
- `src/state/schema.ts` の `JobState` interface に `canceledAt?: string` field を追加する MUST (= schema 拡張)
- worktree 削除前に `git worktree prune` 相当の cleanup 実行 MUST

### 3. `--purge` flag による state file 削除

`specrunner job cancel <jobId> --purge` で **cancel + state file 物理削除** を行う MUST。audit 不要時の旧 `job rm` 互換用途。

### 4. `--all-terminated` flag による bulk cleanup

`specrunner job cancel --all-terminated [--yes]` で terminal status (= `failed` / `terminated` / `canceled`) の state file を一括削除する MUST。`archived` は対象外 MUST (= 完了済 job は別管理、旧 `removeAllTerminated` の `ALLOWED_STATUSES = {failed, terminated, archived}` から **`archived` を除外し `canceled` を追加** する変更を伴う、移植時の漏れに注意)。

- 非 TTY 環境では `--yes` 必須 MUST
- TTY 環境では削除対象一覧を表示 → y/N 確認 (= 既存 `rm --all-terminated` の UX を引き継ぐ)

### 5. `assertJobFinishable` の hint 修正

`src/core/finish/job-state-update.ts:36` の hint で案内している `specrunner cancel` を **`specrunner job cancel <jobId>`** に修正する MUST (= #73 解消)。

### 6. `cli-commands` spec の delta 更新

- `job rm <jobId>` Requirement を REMOVED
- `job rm --all-terminated` Requirement を REMOVED (= 該当があれば)
- `job cancel <jobId>` の新 Requirement を ADDED
- `--help` USAGE 表示の更新 (= `job rm` 行を `job cancel` に置換)

### 7. CLI dispatch の整理

- `src/cli/command-registry.ts` から `job rm` 登録を削除し `job cancel` 登録を追加する MUST
- top-level `rm` alias (= 存在する場合) も削除する MUST

### 8. test の追加・移植

- `src/core/rm/runner.ts` の単体 test (= `tests/rm.test.ts`, `tests/unit/cli/rm-*.test.ts` 等) を `tests/unit/core/cancel/runner.test.ts` 等に移植 + 新動作 (status 別) を網羅する MUST
- `--all-terminated` の bulk cleanup test を移植 MUST

## スコープ外

- **`canceled` 状態の自動 TTL cleanup** (= 日数経過で自動削除する mechanism、別 issue で検討)
- **PR close 時の comment 追加** (= `--force` cancel で PR close する際に「abandoned」comment を残すか、別 issue)
- **`job cancel` の interactive 確認モード** (= `running` 中 job の cancel に確認 prompt を出す UX、別 issue)
- **archived 状態の再 cancel** (= terminal の更に上の状態として扱う設計、本 request では reject 一択)
- **managed mode の cancel 時 session 明示終了** (= `running` job cancel 時に Anthropic 側 session を API で終了する操作、現状は session 自動 expire に委ねる)

## 受け入れ基準

- [ ] `specrunner job cancel <jobId>` で各 status (running / awaiting-resume / awaiting-merge / failed / terminated / canceled) の cancel が正しく動作する
- [ ] `archived` 状態の job に `job cancel` を実行すると stderr + exit 1 で reject される
- [ ] `awaiting-merge` 状態の job は `--force` なしで reject される
- [ ] `--purge` flag で state file が物理削除される
- [ ] `--all-terminated [--yes]` で `failed` / `terminated` / `canceled` の state file が一括削除される
- [ ] `--all-terminated [--yes]` 実行後も `archived` 状態の job の state file は残存する (= 対象外であることの確認)
- [ ] `job cancel` 後の state file に `status: canceled`, `error.code: USER_CANCELED`, `canceledAt: <ISO>` が記録される
- [ ] worktree (= `.git/specrunner-worktrees/<slug>-<jobId>`) が削除される
- [ ] local branch (= `change/<slug>-<jobId>`) が削除される
- [ ] remote branch (= `origin/change/<slug>-<jobId>`) が削除される (= remote にあれば)
- [ ] `assertJobFinishable` の hint が `specrunner job cancel <jobId>` を案内する
- [ ] `specrunner job rm` / `specrunner rm` は unknown subcommand エラーで exit する
- [ ] `git ls-files src/cli/rm.ts src/core/rm/runner.ts` が空である (= 旧 rm 実装削除確認)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD (= design step で決定):
- `running` 中の pid kill 方法の詳細 (= SIGTERM → 5 秒待機 → SIGKILL のタイムアウト、エラーハンドリング)
- remote branch 削除の権限・失敗時挙動 (= push 権限がない場合の警告 vs reject)
- `--all-terminated` の対象に `canceled` を含めるか (= 自己 idempotent 性、削除順序の検討)
