# Tasks: `specrunner job cancel <jobId>`

## Task 1: Schema & lifecycle 拡張 [x]

### 1.1 `src/state/schema.ts` — `canceledAt` field 追加 [x]

`JobState` interface に `canceledAt?: string` を追加。
`validateJobState` は変更不要 (optional field、absent = OK)。

### 1.2 `src/state/lifecycle.ts` — `VALID_TRANSITIONS` 拡張 [x]

```typescript
["running",         new Set(["awaiting-resume", "awaiting-merge", "failed", "terminated", "canceled"])],
["awaiting-merge",  new Set(["archived", "canceled"])],
```

既存の `awaiting-resume`, `failed`, `terminated` → `canceled` は変更不要 (既に定義済)。

### 1.3 `src/errors.ts` — `USER_CANCELED` error code 追加 [x]

`ERROR_CODES` object に `USER_CANCELED: "USER_CANCELED"` を追加。

## Task 2: pid kill utility [x]

### 2.1 `src/core/cancel/pid-kill.ts` — `gracefulKill` 関数 [x]

```typescript
export interface KillDeps {
  kill: (pid: number, signal: string) => void;  // process.kill wrapper
  sleep: (ms: number) => Promise<void>;
  isAlive: (pid: number) => boolean;             // process.kill(pid, 0) wrapper
}

export interface KillResult {
  killed: boolean;
  warning?: string;
}

export async function gracefulKill(
  pid: number,
  timeoutMs: number,
  deps: KillDeps,
): Promise<KillResult>;
```

動作:
1. `deps.kill(pid, "SIGTERM")` — ESRCH は `{ killed: true }` (既に終了)
2. 100ms 間隔で `deps.isAlive(pid)` を polling、`timeoutMs` まで
3. timeout 後も生存なら `deps.kill(pid, "SIGKILL")`
4. EPERM 等の kill 失敗 → `{ killed: false, warning: "..." }`

### 2.2 `tests/unit/core/cancel/pid-kill.test.ts` [x]

- SIGTERM で即終了するケース
- SIGTERM 後 polling で終了を検出するケース
- timeout → SIGKILL にフォールバックするケース
- pid が存在しない (ESRCH) ケース
- EPERM で kill 失敗するケース

## Task 3: cancel core runner [x]

### 3.1 `src/core/cancel/runner.ts` — `cancelSingleJob` [x]

```typescript
export interface CancelResult {
  exitCode: 0 | 1;
  message?: string;
  warnings?: string[];
  info?: string[];
}

export interface CancelDeps {
  spawn: SpawnFn;
  worktreeManager: WorktreeManager;
  sleep: (ms: number) => Promise<void>;
  kill: (pid: number, signal: string) => void;
  isAlive: (pid: number) => boolean;
  repoRoot: string;
}

export async function cancelSingleJob(opts: {
  jobId: string;
  force: boolean;
  purge: boolean;
  deps: CancelDeps;
}): Promise<CancelResult>;
```

Status dispatch:

| status | 動作 |
|---|---|
| `running` | gracefulKill(state.pid) → update state (canceled, error, canceledAt) → cleanup |
| `awaiting-resume` | update state → cleanup |
| `awaiting-merge` | `--force` 必須、なければ reject exit 1。force 時: cleanup (remote branch 削除 → PR auto-close) → update state |
| `failed` / `terminated` | update state → cleanup |
| `archived` | reject: stderr + exit 1 |
| `canceled` | idempotent: cleanup のみ (state file は touch しない) |

共通 state 更新 (canceled 以外):
- `status: "canceled"`
- `error: { code: "USER_CANCELED", message: "Canceled by user", hint: "" }`
- `canceledAt: new Date().toISOString()`
- `worktreePath: null` (cleanup 後)
- history entry append

共通 cleanup:
1. `worktreeManager.prune(repoRoot)` (orphan cleanup)
2. `worktreeManager.remove(worktreePath, repoRoot)` (worktreePath が存在する場合)
3. `spawn("git", ["branch", "-D", branch])` — local branch 削除 (best-effort)
4. `spawn("git", ["push", "origin", "--delete", branch])` — remote branch 削除 (best-effort)

`--purge` 指定時: cleanup + state 更新の後に `JobStateStore.delete(jobId)` で物理削除。
`canceled` (idempotent) case でも `--purge` 指定時は cleanup 後に state file を削除する。

### 3.2 `src/core/cancel/runner.ts` — `cancelAllTerminated` [x]

```typescript
const BULK_CLEANUP_STATUSES = new Set(["failed", "terminated", "canceled"]);

export async function cancelAllTerminated(opts: {
  yes: boolean;
  stdin?: NodeJS.ReadableStream;
}): Promise<CancelResult>;
```

動作:
1. `JobStateStore.list()` で全 state 取得
2. `BULK_CLEANUP_STATUSES` でフィルタ
3. 0 件 → early return "No terminated jobs to remove."
4. `--yes` なし + TTY → prompt `Remove all? [y/N]`
5. `--yes` なし + non-TTY → reject
6. 対象を iterate して `JobStateStore.delete(jobId)` (state file 物理削除)

`promptConfirm` utility は `src/core/rm/runner.ts` から移植。
共通 utility として `src/util/prompt.ts` に切り出すか、cancel runner 内に private 関数として配置。
→ cancel runner 内に配置 (利用箇所が 1 つのため)。

### 3.3 `tests/unit/core/cancel/runner.test.ts` [x]

cancelSingleJob:
- 各 status (running / awaiting-resume / awaiting-merge / failed / terminated / canceled / archived) の動作
- `awaiting-merge` + `--force` なし → reject
- `awaiting-merge` + `--force` あり → 成功
- `archived` → reject
- `canceled` → idempotent (state 未変更)
- `--purge` で state file 物理削除
- `running` + pid kill 成功 / 失敗
- `running` + `state.pid` が null → warning + 続行
- worktree cleanup の best-effort (失敗時 warning)
- branch 削除の best-effort (失敗時 warning)
- cancel 後の state file に `status: canceled`, `error.code: USER_CANCELED`, `canceledAt` が記録

cancelAllTerminated:
- `failed` / `terminated` / `canceled` のみ対象
- `archived` は対象外
- `--yes` スキップ
- non-TTY + `--yes` なし → reject
- 0 件 → early return

## Task 4: CLI entry point [x]

### 4.1 `src/cli/cancel.ts` — `runCancel` [x]

```typescript
export interface RunCancelOptions {
  jobId?: string;
  force: boolean;
  purge: boolean;
  allTerminated: boolean;
  yes: boolean;
}

export async function runCancel(opts: RunCancelOptions): Promise<number>;
```

arg validation:
- `--all-terminated` と `<jobId>` の排他
- `--all-terminated` なし + `<jobId>` なし → error exit 2
- `--purge` と `--all-terminated` の排他 (bulk は常に purge 相当のため flag 不要)

repoRoot 解決: `git rev-parse --show-toplevel` (worktree/branch 削除に必要)。
CancelDeps 組み立て: `createWorktreeManager()`, `spawnCommand`, `process.kill` wrapper。

### 4.2 writeResult helper [x]

`src/cli/rm.ts` の `writeResult` と同等のパターンを `src/cli/cancel.ts` 内に配置。

## Task 5: command-registry 更新 [x]

### 5.1 `src/cli/command-registry.ts` — `job cancel` 登録 [x]

`job` subcommands に `cancel` を追加:

```typescript
cancel: {
  flags: {
    force: { type: "boolean" },
    purge: { type: "boolean" },
    "all-terminated": { type: "boolean" },
    yes: { type: "boolean" },
  },
  positional: { name: "jobId", required: false },
  handler: async (parsed) => { /* runCancel 呼び出し */ },
},
```

### 5.2 `job rm` 登録削除 [x]

`subcommands` から `rm` エントリを削除。
`import { runRm } from "./rm.js"` を削除。

### 5.3 USAGE 文字列更新 [x]

```
job commands:
  ...
  job cancel <jobId>             job を cancel して cleanup
  ...
```

`job rm <jobId>` 行を `job cancel <jobId>` に置換。

### 5.4 worktree guard [x]

`guardedSubcommands` に `cancel` は **追加しない**。
`cancel` は linked worktree 内からも実行できるべき (`rm` と同様)。

## Task 6: `assertJobFinishable` hint 修正 [x]

### 6.1 `src/core/finish/job-state-update.ts` — STATUS_HINTS 更新 [x]

```typescript
export const STATUS_HINTS: Record<string, string> = {
  running: "Wait for the running job to complete before finishing.",
  "awaiting-resume": "Run 'specrunner job resume' to continue the halted job before finishing.",
  canceled: "Job is already canceled. No action needed.",
  failed: "Run 'specrunner job cancel <jobId>' to cancel the failed job.",
  terminated: "Run 'specrunner job cancel <jobId>' to cancel the terminated job.",
};
```

`specrunner job rm <jobId>` → `specrunner job cancel <jobId>`, `remove` → `cancel`。

## Task 7: 旧 rm 実装の削除 [x]

### 7.1 ファイル削除 [x]

- `src/cli/rm.ts` — 削除
- `src/core/rm/runner.ts` — 削除
- `src/core/rm/` — ディレクトリ削除 (空になるため)
- `tests/rm.test.ts` — 削除

### 7.2 import 掃除 [x]

`src/cli/command-registry.ts` の `import { runRm }` を削除 (Task 5.2 と同時)。
他ファイルからの `rm/runner` import がないことを grep で確認。

## Task 8: delta spec 作成 [x]

### 8.1 `specrunner/changes/job-cancel-command/delta/cli-commands.md` [x]

- `job rm <jobId>` Requirement を REMOVED
- `job cancel <jobId>` の新 Requirement を ADDED
- USAGE 表示の `job rm` → `job cancel` 更新
- worktree guard 対象に `cancel` が含まれないことの明示

### 8.2 `specrunner/changes/job-cancel-command/delta/job-state-store.md` [x]

- `canceledAt?: string` field の追加 Requirement

## Task 9: typecheck & test [x]

### 9.1 `bun run typecheck` green 確認 [x]
### 9.2 `bun run test` green 確認 [x]

既存 test で `job rm` を直接参照しているものがあれば修正。
`tests/rm.test.ts` の coverage は新 test file で代替。
