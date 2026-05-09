## 1. Phase 1 -- JobState schema に pid フィールド追加

- [x] 1.1 `src/state/schema.ts`: `JobState` interface に `pid?: number | null` フィールドを追加する
  - `worktreePath` や `resumePoint` と同様の optional フィールド
  - 既存 state ファイルとの後方互換性: absent は undefined として扱う
  ```typescript
  // JobState interface 内に追加（resumePoint の後）
  /** PID of the process that set status to "running". Optional for backward compat. */
  pid?: number | null;
  ```

- [x] 1.2 `src/state/store.ts`: `createJobState()` で初期状態に `pid: process.pid` を追加する
  - line 30 の `status: "running"` の直後に追加
  ```typescript
  status: "running",
  pid: process.pid,
  ```

## 2. Phase 2 -- isProcessAlive ユーティリティ

- [x] 2.1 `src/core/resume/safety.ts`: `isProcessAlive(pid: number): boolean` を追加する
  - `process.kill(pid, 0)` を try/catch で囲む
  - 正常終了（例外なし）→ `true`（プロセス存在）
  - `ESRCH` → `false`（プロセス不在 = stale）
  - `EPERM` → `true`（プロセスは存在するが権限がない = stale ではない）
  - その他のエラー → `false`（安全側に倒して stale と判定）
  ```typescript
  export function isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return true;  // process exists but no permission
      }
      return false;  // ESRCH or other error → stale
    }
  }
  ```

- [x] 2.2 `src/core/resume/safety.ts`: `isStaleRunning(state: JobState): boolean` を追加する
  - `state.status !== "running"` → `false`
  - `state.pid` が存在する場合: `!isProcessAlive(state.pid)` → `true`
  - `state.pid` が存在しない場合: `updatedAt` + 15 分（900000 ms）超過 → `true`
  ```typescript
  const STALE_RUNNING_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

  export function isStaleRunning(state: JobState): boolean {
    if (state.status !== "running") return false;
    if (state.pid != null) {
      return !isProcessAlive(state.pid);
    }
    // Fallback: no PID recorded (legacy state file)
    const elapsed = Date.now() - new Date(state.updatedAt).getTime();
    return elapsed > STALE_RUNNING_THRESHOLD_MS;
  }
  ```

## 3. Phase 3 -- resume コマンドの status gate 改修

- [x] 3.1 `src/core/command/resume.ts`: `import { canTransition } from "../../state/lifecycle.js"` を追加する

- [x] 3.2 `src/core/command/resume.ts`: `import { isStaleRunning } from "../resume/safety.js"` を既存 import に追加する
  - 既存: `import { checkConsecutiveEscalations, checkStaleState } from "../resume/safety.js"`
  - 変更後: `import { checkConsecutiveEscalations, checkStaleState, isStaleRunning } from "../resume/safety.js"`

- [x] 3.3 `src/core/command/resume.ts`: `import { transitionJob } from "../../state/lifecycle.js"` を追加する（canTransition と同じ import 文にまとめる）

- [x] 3.4 `src/core/command/resume.ts`: lines 95-110 の status gate を以下に置換する
  ```typescript
  // Status gate: stale detection for "running" state
  if (state.status === "running") {
    if (isStaleRunning(state)) {
      // Orphaned running state — transition to awaiting-resume and continue
      const { state: recovered } = transitionJob(state, "awaiting-resume", {
        trigger: "stale-detection",
        reason: "Process not running",
        patch: { pid: null },
      });
      state = await updateJobState(state.jobId, () => recovered);
      process.stderr.write(
        `Warning: Job '${this.slug}' was running but the process is no longer alive. Recovering.\n`,
      );
    } else {
      process.stderr.write(
        `Error: Job '${this.slug}' is currently running. Cannot resume a running job.\n`,
      );
      throw new PrepareError(1, "Job is running");
    }
  }

  // Status gate: reject if transition to "running" is not allowed
  if (!canTransition(state.status, "running")) {
    process.stderr.write(
      `Error: Job '${this.slug}' has status '${state.status}', cannot transition to 'running'.\n`,
    );
    throw new PrepareError(1, `Cannot resume from status '${state.status}'`);
  }
  ```
  - `state` 変数は `let` で宣言されている必要がある（line 68 の `let state: JobState` を確認）
  - 既存の `status !== "awaiting-resume"` + `--force` ガード（lines 103-110）は削除する
  - `--force` は安全性チェック（consecutive escalations）にのみ使用される

- [x] 3.5 `src/core/command/resume.ts`: lines 163-177 の `running` 遷移を `transitionJob` 使用に変更する
  ```typescript
  // State preparation: transition to "running"
  let updatedState: JobState;
  try {
    const { state: transitioned } = transitionJob(state, "running", {
      trigger: "resume",
      reason: `Resuming from step '${startStep}'`,
      patch: { error: null, resumePoint: null, pid: process.pid },
    });
    updatedState = await updateJobState(state.jobId, () => transitioned);
  } catch (err) {
    process.stderr.write(`Error: Failed to update job state: ${(err as Error).message}\n`);
    throw new PrepareError(1, "Failed to update state");
  }
  ```

## 4. Phase 4 -- ManagedRuntime シグナルハンドラ

- [x] 4.1 `src/core/runtime/managed.ts`: import に `transitionJob` と `loadJobState` を追加する
  ```typescript
  import { transitionJob } from "../../state/lifecycle.js";
  import { loadJobState } from "../../state/store.js";
  import type { StepName } from "../../state/schema.js";
  ```
  - `updateJobState` は既存の import にある

- [x] 4.2 `src/core/runtime/managed.ts`: `registerCleanup` を signal handler 付きに実装する
  ```typescript
  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const signalCleanup = async (): Promise<void> => {
      try {
        const current = await loadJobState(jobId);
        const { state: updated } = transitionJob(current, "awaiting-resume", {
          trigger: "signal-handler",
          reason: "Interrupted by signal",
          patch: {
            pid: null,
            resumePoint: {
              step: startStep as StepName,
              reason: "Interrupted by signal",
              iterationsExhausted: 0,
            },
          },
        });
        await updateJobState(jobId, () => updated);
      } catch {
        // Best-effort persist
      }
      process.exit(130);
    };

    process.on("SIGINT", signalCleanup);
    process.on("SIGTERM", signalCleanup);

    return { __signalCleanup: signalCleanup } as unknown as CleanupHandle;
  }
  ```

- [x] 4.3 `src/core/runtime/managed.ts`: `teardown` をシグナルハンドラ解除に変更する
  ```typescript
  async teardown(handle: CleanupHandle, _finalStatus: string): Promise<void> {
    const internals = handle as unknown as { __signalCleanup?: () => void };
    if (internals.__signalCleanup) {
      process.off("SIGINT", internals.__signalCleanup);
      process.off("SIGTERM", internals.__signalCleanup);
    }
  }
  ```

- [x] 4.4 `src/core/runtime/managed.ts`: `MANAGED_NOOP_HANDLE` 定数を削除する（不要になるため）

## 5. Phase 5 -- pid フィールドの書き込み箇所

- [x] 5.1 `src/core/pipeline/pipeline.ts`: line 85-103 の safety net で `pid: null` を含めて永続化する
  - 現行: `status: "awaiting-resume"` を直接代入
  - 変更: `pid: null` を追加
  ```typescript
  if (finalState.status === "running") {
    const store = new JobStateStore(finalState.jobId);
    finalState = {
      ...finalState,
      status: "awaiting-resume",
      pid: null,
      resumePoint: { ... },
      ...
    };
  ```

- [x] 5.2 `src/core/runtime/local.ts`: line 293-304 の signalCleanup で `pid: null` を追加する
  - 現行: `status: "awaiting-resume"` に遷移
  - 変更: `pid: null` を追加
  ```typescript
  await updateJobState(jobId, (s) => ({
    ...s,
    status: "awaiting-resume" as const,
    pid: null,
    resumePoint: { ... },
  }));
  ```

## 6. Phase 6 -- テスト

- [x] 6.1 `tests/unit/core/resume/safety.test.ts`: `isProcessAlive` のテストを追加する
  - PID が現在のプロセス（`process.pid`）→ `true`
  - PID が存在しない値（`999999`）→ `false`
  - PID が 0 以下の無効値 → `false`

- [x] 6.2 `tests/unit/core/resume/safety.test.ts`: `isStaleRunning` のテストを追加する
  - `status !== "running"` → `false`
  - `status === "running"`, `pid` が生存プロセス → `false`
  - `status === "running"`, `pid` が死亡プロセス → `true`
  - `status === "running"`, `pid` なし, `updatedAt` が 16 分前 → `true`
  - `status === "running"`, `pid` なし, `updatedAt` が 5 分前 → `false`
  - `status === "running"`, `pid` なし, `updatedAt` がちょうど 15 分 → `false`（境界値）

- [x] 6.3 `tests/unit/core/runtime/managed.test.ts`: シグナルハンドラのテストを追加する
  - `registerCleanup` 後に `process.listenerCount("SIGINT")` が増加する
  - `teardown` 後に `process.listenerCount("SIGINT")` が元に戻る

- [x] 6.4 `tests/unit/state/lifecycle.test.ts`: `transitionJob` の `pid` patch が正しく適用されるテストを追加する（既存テストファイルに追記）

- [x] 6.5 全テスト通過: `bun run typecheck && bun run test` が green

## 受け入れ基準との対応

| 受け入れ基準 | タスク |
|---|---|
| `JobState` schema に `pid` フィールドが追加されている | 1.1 |
| `running` への遷移時に `pid` が記録される | 1.2, 3.5 |
| orphaned `running` state から `resume` で回復できる | 2.1, 2.2, 3.4 |
| ManagedRuntime で SIGINT を受けると `awaiting-resume` に遷移して終了する | 4.1-4.4 |
| `resume` が `failed` / `terminated` の job も再開できる | 3.4 |
| stale detection のユニットテストが存在する | 6.1, 6.2 |
| `bun run typecheck && bun run test` が green | 6.5 |
