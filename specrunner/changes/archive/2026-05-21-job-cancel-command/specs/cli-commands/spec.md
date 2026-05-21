## Requirements

### Requirement: `specrunner job cancel <jobId>` は job を cancel して cleanup する

`specrunner job cancel <jobId>` は MUST 対象 job の status に応じて以下の動作を実行する。

| status | 動作 |
|---|---|
| `running` | `state.pid` に SIGTERM 送信 → 5 秒待機 → 反応なければ SIGKILL → status を `canceled` に更新 + worktree 削除 + local/remote branch 削除 |
| `awaiting-resume` | status を `canceled` に更新 + worktree 削除 + local/remote branch 削除 |
| `awaiting-merge` | `--force` 必須。指定なければ stderr に `PR が open です。--force を付与してください` + exit 1。`--force` 指定時は remote branch 削除 (関連 PR は自動 close) + status=canceled + worktree 削除 |
| `failed` / `terminated` | status を `canceled` に更新 + worktree/branch 削除 (cleanup 用途、idempotent) |
| `archived` | reject: `既に archived です。cancel できません` を stderr + exit 1 |
| `canceled` | idempotent: worktree/branch の cleanup のみ実行 (state file は touch しない、`--purge` 指定時は例外: state file を削除する) |

cancel 動作の共通ルール:
- state file は保存 (削除しない、audit trail 保持)
- `error.code = "USER_CANCELED"` を state file に MUST 記録する
- `canceledAt` timestamp (ISO 8601) を state file に MUST 記録する
- worktree 削除前に `git worktree prune` 相当の cleanup を MUST 実行する
- local branch は `git branch -D <branch>` で削除 (best-effort)
- remote branch は `git push origin --delete <branch>` で削除 (best-effort)

#### Scenario: running job を cancel する

- **WHEN** status=running の job に `specrunner job cancel <jobId>` を実行する
- **THEN** SIGTERM → 5 秒待機 → (必要なら SIGKILL) → status=canceled に遷移、worktree/branch が削除される

#### Scenario: awaiting-merge job を --force なしで cancel する

- **WHEN** status=awaiting-merge の job に `specrunner job cancel <jobId>` を実行する (--force なし)
- **THEN** stderr にメッセージを出力し exit code 1 で終了する

#### Scenario: awaiting-merge job を --force 付きで cancel する

- **WHEN** status=awaiting-merge の job に `specrunner job cancel <jobId> --force` を実行する
- **THEN** remote branch 削除 → status=canceled に遷移、exit code 0

#### Scenario: archived job を cancel する

- **WHEN** status=archived の job に `specrunner job cancel <jobId>` を実行する
- **THEN** reject メッセージを stderr に出力し exit code 1 で終了する

#### Scenario: 既に canceled の job に cancel する

- **WHEN** status=canceled の job に `specrunner job cancel <jobId>` を実行する
- **THEN** worktree/branch の cleanup のみ実行し、state file は変更せず exit code 0

### Requirement: `specrunner job cancel --purge` は state file を物理削除する

`specrunner job cancel <jobId> --purge` は MUST cancel 動作の後に state file を物理削除する。

#### Scenario: --purge で cancel する

- **WHEN** `specrunner job cancel <jobId> --purge` を実行する
- **THEN** cancel 動作後に state file が物理削除される

### Requirement: `specrunner job cancel --all-terminated` は terminal state の job を一括削除する

`specrunner job cancel --all-terminated [--yes]` は MUST `failed` / `terminated` / `canceled` status の job の state file を一括削除する。`archived` は MUST 対象外とする。

- 非 TTY 環境では `--yes` MUST 必須
- TTY 環境では削除対象一覧を表示 → y/N 確認

#### Scenario: --all-terminated で bulk cleanup

- **WHEN** failed/terminated/canceled の job が 3 件、archived が 1 件ある状態で `specrunner job cancel --all-terminated --yes` を実行する
- **THEN** 3 件の state file が削除され、archived の 1 件は残存する

#### Scenario: 非 TTY で --yes なし

- **WHEN** 非 TTY 環境で `specrunner job cancel --all-terminated` を実行する (--yes なし)
- **THEN** reject メッセージを出力し exit code 1

### Requirement: `specrunner job` サブコマンド群が動作する

`specrunner job` は SHALL 以下のサブコマンドを提供する (`rm` を `cancel` に置換):

| サブコマンド | 機能 |
|---|---|
| `start <request-slug\|file>` | pipeline 開始、jobId 発行 |
| `ls` | 全 job 一覧 |
| `show <jobId\|slug>` | job state 詳細 |
| `cancel <jobId>` | job cancel + cleanup |
| `resume <slug>` | halted job を再開 |
| `finish <slug>` | PR merge + archive |

#### Scenario: `specrunner job rm` を実行した場合

- **WHEN** ユーザーが `specrunner job rm <jobId>` を実行する
- **THEN** `Unknown job subcommand: rm` を stderr に出し exit code 2 で終了する

#### Scenario: `specrunner rm` を実行した場合

- **WHEN** ユーザーが `specrunner rm <jobId>` を実行する
- **THEN** `Unknown command: rm` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner --help` は `job cancel` 行を含む

job commands セクションに `job rm <jobId>` 行の代わりに以下の行を含む:

```
  job cancel <jobId>             job を cancel して cleanup
```

### Requirement: `job cancel` は worktree guard の対象外である

`job cancel` は worktree guard の対象外とする (linked worktree 内からも実行可能)。

#### Scenario: worktree 内から job cancel を実行する

- **WHEN** linked worktree 内から `specrunner job cancel <jobId>` を実行する
- **THEN** worktree guard による reject は発生せず、cancel が実行される

### Requirement: `assertJobFinishable` の STATUS_HINTS は `job cancel` を案内する

`STATUS_HINTS` の `failed` / `terminated` エントリを以下に更新する:

- `failed`: `"Run 'specrunner job cancel <jobId>' to cancel the failed job."`
- `terminated`: `"Run 'specrunner job cancel <jobId>' to cancel the terminated job."`

#### Scenario: failed job の hint が正しい

- **WHEN** `assertJobFinishable` が failed 状態の job で呼ばれる
- **THEN** hint に `specrunner job cancel <jobId>` を含むメッセージが表示される
