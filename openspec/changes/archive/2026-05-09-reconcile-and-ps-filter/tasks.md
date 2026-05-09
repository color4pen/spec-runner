## 1. Phase 1 -- reconcile モジュール

- [x] 1.1 `src/state/reconcile.ts` を新設し、以下を export する
  ```typescript
  import { transitionJob } from "./lifecycle.js";
  import type { JobState } from "./schema.js";
  import type { TransitionResult } from "./lifecycle.js";
  ```

- [x] 1.2 `reconcileStaleRunning(state: JobState): TransitionResult | null` を実装する
  - stale 判定ロジックを inline する（PID probe + 15min threshold）
  - `state.status !== "running"` → `null`
  - PID あり: `isProcessAlive(pid)` が false → stale
  - PID なし: `updatedAt` が 15 分以上前 → stale
  - stale → `transitionJob(state, "awaiting-resume", { trigger: "reconcile", reason: "stale running detected" })`
  - stale でない → `null`
  ```typescript
  export function reconcileStaleRunning(state: JobState): TransitionResult | null {
    if (state.status !== "running") return null;
    const isStale = state.pid != null
      ? !isProcessAlive(state.pid)
      : (Date.now() - new Date(state.updatedAt).getTime()) > STALE_THRESHOLD_MS;
    if (!isStale) return null;
    return transitionJob(state, "awaiting-resume", {
      trigger: "reconcile",
      reason: "stale running detected",
    });
  }
  ```

- [x] 1.3 `isProcessAlive(pid: number): boolean` を `reconcile.ts` 内に private helper として実装する
  - `process.kill(pid, 0)` probe パターン（safety.ts と同一ロジック）
  ```typescript
  function isProcessAlive(pid: number): boolean {
    if (pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
      return false;
    }
  }
  ```

- [x] 1.4 `reconcilePrState(state: JobState, prStatus: "MERGED" | "CLOSED" | "OPEN"): TransitionResult | null` を実装する
  - `state.status !== "awaiting-merge"` → `null`
  - `prStatus !== "MERGED"` → `null`
  - `transitionJob(state, "archived", { trigger: "reconcile", reason: "PR merged externally" })`
  ```typescript
  export function reconcilePrState(
    state: JobState,
    prStatus: "MERGED" | "CLOSED" | "OPEN",
  ): TransitionResult | null {
    if (state.status !== "awaiting-merge") return null;
    if (prStatus !== "MERGED") return null;
    return transitionJob(state, "archived", {
      trigger: "reconcile",
      reason: "PR merged externally",
    });
  }
  ```

## 2. Phase 2 -- ps コマンドに `--status` フラグ追加

- [x] 2.1 `src/cli/command-registry.ts`: `ps` の flags に `status` を追加する
  ```typescript
  ps: {
    flags: {
      active: { type: "boolean" },
      all: { type: "boolean" },
      status: { type: "string", values: ["running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived", "canceled"] as const },
    },
    handler: async (parsed) => {
      await runPs({
        active: !!parsed.flags["active"],
        all: !!parsed.flags["all"],
        status: parsed.flags["status"] as string | undefined,
      });
    },
  },
  ```

- [x] 2.2 `src/cli/ps.ts`: `runPs` の opts に `status?: string` を追加し、フィルタロジックを拡張する
  - `--status` 指定時: `--active` / `--all` を無視し、指定 status でフィルタ
  - 既存の `--active` / `--all` ロジックはそのまま維持
  ```typescript
  export async function runPs(opts: { active?: boolean; all?: boolean; status?: string } = {}): Promise<void> {
    const allJobs = await listJobStates();
    let jobs: typeof allJobs;
    if (opts.status) {
      jobs = allJobs.filter((j) => j.status === opts.status);
    } else if (opts.active) {
      jobs = allJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
    } else if (opts.all) {
      jobs = allJobs;
    } else {
      jobs = allJobs.filter((j) => j.status !== "archived");
    }
    // ... rest unchanged
  }
  ```

- [x] 2.3 `src/cli/command-registry.ts`: USAGE 文字列の `Ps Options` セクションを更新する
  ```
  Ps Options:
    --active           Show only active (running) jobs
    --all              Include archived jobs
    --status=<status>  Filter by status (running|awaiting-resume|awaiting-merge|failed|terminated|archived|canceled)
  ```

## 3. Phase 3 -- ps PR 状態確認 hint

- [x] 3.1 `src/cli/ps.ts`: `checkPrMerged(job: JobState): Promise<boolean | null>` helper を追加する
  - `job.pullRequest` がない → `null`（判定不能）
  - `spawnCommand` (node:child_process ラッパー) で `gh pr view` を実行
  - stdout が `"MERGED"` → `true`
  - `gh` not found / 実行失敗 → `null`（静かにスキップ）

- [x] 3.2 `src/cli/ps.ts`: `awaiting-merge` ジョブの表示前に PR 状態を確認し、MERGED なら status 列に `(PR merged, run finish)` を append する
  - `formatJobRow` の呼び出し前に `awaiting-merge` ジョブだけ PR check を実行
  - 結果を Map<jobId, boolean> に格納し、`formatJobRow` に渡す

- [x] 3.3 `src/cli/ps.ts`: `formatJobRow` に `prMerged?: boolean` パラメータを追加する
  - `prMerged === true` の場合、status 列を `"awaiting-merge (PR merged, run finish)"` にする

- [x] 3.4 STATUS 列の padEnd を拡張する（hint 付き status が長いため）
  - TTY 時の STATUS 列幅を 12 → 40 に変更する（header + row 両方）

## 4. Phase 4 -- テスト

- [x] 4.1 `tests/unit/state/reconcile.test.ts` を新設する

- [x] 4.2 `reconcileStaleRunning` テスト:
  - `status !== "running"` → `null`
  - `status === "running"` + PID alive → `null`
  - `status === "running"` + PID dead → `TransitionResult` (status: `awaiting-resume`)
  - `status === "running"` + no PID + updatedAt < 15min → `null`
  - `status === "running"` + no PID + updatedAt > 15min → `TransitionResult`

- [x] 4.3 `reconcilePrState` テスト:
  - `status !== "awaiting-merge"` → `null`
  - `status === "awaiting-merge"` + `prStatus === "OPEN"` → `null`
  - `status === "awaiting-merge"` + `prStatus === "CLOSED"` → `null`
  - `status === "awaiting-merge"` + `prStatus === "MERGED"` → `TransitionResult` (status: `archived`)

- [x] 4.4 `tests/unit/cli/ps-filter.test.ts` を新設する:
  - `--status awaiting-merge` で awaiting-merge のジョブのみ表示される
  - `--status archived` で archived のジョブのみ表示される
  - `--status` が `--active` / `--all` より優先される
  - 不正な `--status foo` は flag-parser がエラーを返す

- [x] 4.5 `tests/unit/cli/ps-pr-hint.test.ts` を新設する:
  - `formatJobRow` に `prMerged: true` を渡すと `(PR merged, run finish)` が含まれる
  - `prMerged: false` / `undefined` では通常表示

## 5. Phase 5 -- 検証

- [x] 5.1 `bun run typecheck` が green であることを確認する
- [x] 5.2 `bun run test` が green であることを確認する
