# ADR: `job cancel` を audit-trail 保持の semantic として確立し `job rm` を廃止する

**Date**: 2026-05-21
**Status**: Accepted

## Context

`specrunner job rm <jobId>` は state file を物理削除していた。これにより:

- 「いつ・なぜ stop したか」の audit trail が失われる
- schema に既存の `canceled` status へ CLI から到達する経路がない
- `running` 中の job を強制停止する公式 CLI 経路がない（手動の kill + state file 編集が必要）
- `assertJobFinishable` の hint が廃止前の `job rm` を案内し続ける（issue #73）

`JobStatus` 型には `"canceled"` が定義済みだが、遷移手段が存在しないという schema と CLI の乖離があった（issue #61）。

## Decision

### 1. cancel vs delete の semantic 分離

`job cancel` はデフォルトで state file を**保持**し、`status: canceled` + `canceledAt` + `error.code: USER_CANCELED` を記録する。

| コマンド | state file | 用途 |
|---|---|---|
| `job cancel <jobId>` | 保持（audit trail） | 通常の stop・終了 |
| `job cancel <jobId> --purge` | 物理削除 | disk 回収、旧 `job rm` 互換 |
| `job cancel --all-terminated` | 対象 job を物理削除 | bulk cleanup |

**`job rm` は廃止**。`src/cli/rm.ts` / `src/core/rm/runner.ts` を削除し、`command-registry.ts` から登録を除去する。`job rm` を呼ぶと "Unknown subcommand" エラーで exit する。

### 2. status 別 cancel 動作の確立

cancel は対象 job の現 status に応じて動作を分岐する:

| status | 動作 |
|---|---|
| `running` | SIGTERM → 5 秒待機 → SIGKILL → `canceled` 遷移 + cleanup |
| `awaiting-resume` | `canceled` 遷移 + cleanup |
| `awaiting-merge` | `--force` 必須。なければ stderr + exit 1。`--force` 時は remote branch 削除（PR は GitHub が自動 close）+ `canceled` 遷移 + worktree 削除 |
| `failed` / `terminated` | `canceled` 遷移 + cleanup（idempotent cleanup 用途） |
| `archived` | reject（stderr + exit 1）。完了済 job は触らない |
| `canceled` | idempotent: worktree/branch cleanup のみ。state file は touch しない |

共通: worktree 削除 + local branch 削除 + remote branch 削除（best-effort）。

### 3. `--all-terminated` の対象 status 再定義

旧 `removeAllTerminated` の `ALLOWED_STATUSES` は `{failed, terminated, archived}` だった。本 ADR で:

```typescript
const BULK_CLEANUP_STATUSES = new Set(["failed", "terminated", "canceled"]);
```

- `archived` を**除外**: finish 経由で完了した job は別管理。誤削除のリスクを避ける
- `canceled` を**追加**: cancel 済 job の bulk purge が主要ユースケース

### 4. `VALID_TRANSITIONS` バイパスの設計

`cancelSingleJob()` は `transitionJob()` を使わず、直接 state を書き換える。

**理由**: `running` → `canceled` は pid kill + worktree 削除という副作用付き操作を伴う。`transitionJob()` は pure function の責務範囲外であり、cancel runner 内で status validation + state 更新 + 副作用を一元管理する設計が明確。

ただし `VALID_TRANSITIONS` map 自体は拡張する（`running → canceled`、`awaiting-merge → canceled` を追加）。`canTransition()` の整合性を保つため。

### 5. `running` job の kill 戦略

```
1. process.kill(pid, "SIGTERM")
2. 5 秒 polling（100ms 間隔で pid 存在確認）
3. 生存なら process.kill(pid, "SIGKILL")
4. ESRCH（pid 不存在）は正常完了扱い
```

- `state.pid` が null → kill スキップ + warning、status 遷移は続行
- EPERM 等 → stderr warning、exit code 0 を維持（orphan process の手動 kill を案内）

### 6. remote branch 削除の best-effort 方針

`git push origin --delete <branch>` は best-effort。失敗時は stderr に warning を出力し exit code は 0 を維持する。finish orchestrator（Phase 4）と同じパターン。

**理由**: push 権限不足は CLI の制御外。remote にブランチが存在しない場合も失敗するが、それは正常。

## Consequences

### Positive

- cancel 後も `job ls` / `job show` で履歴を確認できる（audit trail 保持）
- `canceled` status へ CLI から到達する経路が確立され、schema と CLI の乖離が解消
- `running` 中の job を安全に強制停止できる公式 CLI 経路が生まれる
- `assertJobFinishable` の hint が現行コマンド（`job cancel <jobId>`）を案内する

### Negative / Neutral

- `specrunner job rm` / `specrunner rm` → "Unknown subcommand" エラー（廃止）
- cancel 後の state file が disk に残る（`--purge` で明示的に削除が必要）
- `--all-terminated` で `archived` job は削除されない（意図的。archive は `job archive` 経由で管理）

## Files Changed

| File | Change |
|------|--------|
| `src/cli/cancel.ts` | NEW: `job cancel` CLI entry point |
| `src/core/cancel/runner.ts` | NEW: `cancelSingleJob`, `cancelAllTerminated` |
| `src/core/cancel/pid-kill.ts` | NEW: `gracefulKill`（SIGTERM → wait → SIGKILL） |
| `src/cli/rm.ts` | DELETED |
| `src/core/rm/runner.ts` | DELETED |
| `src/state/schema.ts` | `JobState` に `canceledAt?: string` 追加 |
| `src/state/lifecycle.ts` | `VALID_TRANSITIONS` に `running → canceled`、`awaiting-merge → canceled` 追加 |
| `src/errors.ts` | `USER_CANCELED` error code 追加 |
| `src/cli/command-registry.ts` | `job rm` 削除、`job cancel` 追加 |
| `src/core/finish/job-state-update.ts` | hint を `specrunner job cancel <jobId>` に修正 |
| `tests/rm.test.ts` | DELETED（新 cancel test に移植） |
| `tests/unit/core/cancel/runner.test.ts` | NEW |
| `tests/unit/core/cancel/pid-kill.test.ts` | NEW |
