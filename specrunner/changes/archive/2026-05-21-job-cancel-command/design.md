# Design: `specrunner job cancel <jobId>`

## Overview

`job rm` (state file 物理削除) を `job cancel` (terminal 状態遷移 + cleanup) に置換する。
audit trail を保持しつつ、status 別の停止・cleanup 動作を提供する。

## ADR: cancel vs delete の semantic 分離

### Context
`job rm` は state file を物理削除する。これにより「いつ・なぜ止めたか」の audit trail が失われる。
`canceled` status は schema に既存だが CLI から到達する経路がなかった。

### Decision
- **デフォルト**: state file 保持 + `status: canceled` 遷移 (audit trail 保存)
- **`--purge`**: state file 物理削除 (旧 `job rm` 互換)
- **`--all-terminated`**: bulk cleanup は `failed` / `terminated` / `canceled` を対象 (`archived` は除外)

### Consequences
- cancel 後も `job ls` / `job show` で履歴を確認可能
- `--purge` で disk 回収が必要な場合にも対応
- `archived` は finish 経由の完了状態として保護される

## 設計判断

### D1: `VALID_TRANSITIONS` の拡張

現状 `running` と `awaiting-merge` から `canceled` への遷移が lifecycle.ts に定義されていない。
以下を追加する:

```
running         → [...existing, canceled]
awaiting-merge  → [...existing, canceled]
```

`job cancel` は `transitionJob()` を使わず、直接 state を書き換える。
理由: `running` → `canceled` は pid kill + worktree 削除を伴う副作用付き操作であり、
pure function の `transitionJob` の責務外。cancel runner 内で status validation + state 更新を行う。

ただし `VALID_TRANSITIONS` map 自体は拡張する。`canTransition()` が他のコードから参照されているため
整合性を保つ。

### D2: `running` job の pid kill 戦略

```
1. process.kill(pid, "SIGTERM")
2. 5 秒 polling (100ms 間隔で pid 存在確認)
3. 生存なら process.kill(pid, "SIGKILL")
4. pid not found (ESRCH) は正常完了扱い (process が既に終了)
```

- `state.pid` が null の場合: kill をスキップし warning を出力、status 遷移は続行
- pid kill 失敗 (EPERM 等): stderr に warning、status 遷移は続行 (orphan process の手動 kill が必要)

### D3: remote branch 削除の失敗時挙動

`git push origin --delete <branch>` は best-effort。失敗時は warning を stderr に出力し、
exit code は 0 を維持する。理由:

- push 権限不足は CLI の制御外
- remote にブランチが存在しない場合も失敗するが、それは正常

finish orchestrator (Phase 4) と同じパターンを踏襲。

### D4: cancel runner の DI 設計

```typescript
interface CancelDeps {
  spawn: SpawnFn;
  worktreeManager: WorktreeManager;
  sleep: (ms: number) => Promise<void>;
  kill: (pid: number, signal: string) => boolean;  // process.kill wrapper
}
```

`SessionDeleteClient` は cancel では不要 (managed mode session は cancel で削除しない。
session は Anthropic 側で自動管理され、state file に記録が残れば十分)。

### D5: `--all-terminated` の対象 status

```typescript
const BULK_CLEANUP_STATUSES = new Set(["failed", "terminated", "canceled"]);
```

旧 `rm` の `ALLOWED_STATUSES` (`failed`, `terminated`, `archived`) から:
- `archived` を **除外** (完了済 job は保護)
- `canceled` を **追加** (cancel 済 job の bulk purge 用途)

`--all-terminated` は `--purge` 相当 (state file 物理削除)。audit 不要な cleanup 用途。

### D6: schema 拡張

`JobState` に `canceledAt?: string` を追加。
`src/state/schema.ts` の `validateJobState` は optional field として扱う (既存 state file に absent → OK)。

### D7: error code

`errors.ts` に `USER_CANCELED: "USER_CANCELED"` を追加。
cancel 時に `state.error = { code: "USER_CANCELED", message: "Canceled by user", hint: "" }` を記録。

### D8: worktree 解決

cancel 対象 job の `state.worktreePath` から worktree path を取得。
worktree 削除前に `worktreeManager.prune(repoRoot)` を実行 (orphan reference cleanup)。
`state.worktreePath` が null/undefined の場合は worktree 削除をスキップ。

repoRoot の導出: `state.worktreePath` が `<repoRoot>/.git/specrunner-worktrees/<dir>` の形式なので、
`path.resolve(worktreePath, '..', '..', '..')` で取得するのではなく、
`process.cwd()` から `git rev-parse --show-toplevel` で取得する (cancel は main worktree から実行される前提)。

### D9: ファイル配置

```
src/cli/cancel.ts              — CLI entry point (runCancel)
src/core/cancel/runner.ts      — cancelSingleJob, cancelAllTerminated
src/core/cancel/pid-kill.ts    — gracefulKill (SIGTERM → wait → SIGKILL)
tests/unit/core/cancel/runner.test.ts
tests/unit/core/cancel/pid-kill.test.ts
```

`src/cli/rm.ts` と `src/core/rm/runner.ts` は削除。
`tests/rm.test.ts` は削除 (新 test に移植)。

## コンポーネント図

```
CLI layer:
  src/cli/cancel.ts (runCancel)
    ├── arg validation (jobId | --all-terminated)
    ├── resolveJobId (short prefix → full UUID)
    └── delegates to core

Core layer:
  src/core/cancel/runner.ts
    ├── cancelSingleJob()
    │   ├── load state (JobStateStore)
    │   ├── status dispatch:
    │   │   ├── running    → gracefulKill → transition → cleanup
    │   │   ├── awaiting-resume → transition → cleanup
    │   │   ├── awaiting-merge  → --force gate → cleanup (remote branch → PR auto-close)
    │   │   ├── failed/terminated → transition → cleanup
    │   │   ├── archived → reject
    │   │   └── canceled → idempotent cleanup only
    │   ├── cleanup: worktree remove + branch delete (local + remote)
    │   └── --purge: deleteJobState after transition
    │
    ├── cancelAllTerminated()
    │   ├── list all states
    │   ├── filter by BULK_CLEANUP_STATUSES
    │   ├── prompt (TTY) or require --yes (non-TTY)
    │   └── deleteJobState per target
    │
    └── src/core/cancel/pid-kill.ts
        └── gracefulKill(pid, timeoutMs, deps)

State layer:
  src/state/schema.ts     — canceledAt field
  src/state/lifecycle.ts  — VALID_TRANSITIONS expansion
  src/errors.ts           — USER_CANCELED code
```
