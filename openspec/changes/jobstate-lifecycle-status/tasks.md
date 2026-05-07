## 1. Phase 1 -- Schema changes

- [x] 1.1 `src/state/schema.ts`: `JobStatus` type に `"awaiting-resume"` と `"canceled"` を追加する
  ```typescript
  type JobStatus = "running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled";
  ```
- [x] 1.2 `src/state/schema.ts`: `ResumePoint` interface を定義する
  ```typescript
  interface ResumePoint {
    step: StepName;
    reason: string;
    iterationsExhausted: number;
  }
  ```
- [x] 1.3 `src/state/schema.ts`: `JobState` interface に `resumePoint?: ResumePoint | null` を追加する
- [x] 1.4 `src/state/schema.ts`: `validateJobState` に `VALID_STATUSES` set を追加し、unknown status を reject する
  ```typescript
  const VALID_STATUSES: Set<string> = new Set([
    "running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived", "canceled",
  ]);
  ```
  `obj["status"]` が `VALID_STATUSES` に含まれない場合 `throw new Error("Invalid status: ...")` する。既存の `status === "success"` on-read remap の後に配置する
- [x] 1.5 `src/state/schema.ts`: `validateJobState` で `resumePoint` の型検証を追加する。`status === "awaiting-resume"` のとき `resumePoint` が object であることを検証（既存 state に `resumePoint` がなくても error にしない — backward compat）
- [x] 1.6 `bun run typecheck` を実行し、`awaiting-resume` / `canceled` の未対応箇所をコンパイルエラーとして洗い出す

## 2. Phase 2 -- Pipeline status transitions

- [x] 2.1 `src/core/pipeline/pipeline.ts`: `FATAL_ERROR_CODES` set を定義する（`SESSION_CREATE_FAILED`, `CONFIG_MISSING`, `CONFIG_INCOMPLETE`, `CONFIG_INVALID`）
- [x] 2.2 `src/core/pipeline/pipeline.ts`: `runInternal` の `nextStep === "escalate"` ブロック内で、`state.status === "running"` の場合に `status: "awaiting-resume"` + `resumePoint` を書き込む。`state.status === "failed"` かつ `FATAL_ERROR_CODES` に含まれる場合は `failed` を維持。それ以外の `failed` は `awaiting-resume` に遷移する
  ```typescript
  if (nextStep === "escalate") {
    // ... existing stdout output ...
    if (state.status !== "failed" || !FATAL_ERROR_CODES.has(state.error?.code ?? "")) {
      state = {
        ...state,
        status: "awaiting-resume",
        resumePoint: {
          step: currentStep as StepName,
          reason: state.error?.message ?? `${currentStep} escalated`,
          iterationsExhausted: loopIters.get(currentStep) ?? 0,
        },
        updatedAt: new Date().toISOString(),
      };
      const escalateStore = new JobStateStore(state.jobId);
      await escalateStore.persist(state);
    }
    break;
  }
  ```
- [x] 2.3 `src/core/pipeline/pipeline.ts`: `handleExhausted` の `status: "failed"` を `status: "awaiting-resume"` に変更し、`resumePoint` を追加する
  ```typescript
  const updated: JobState = {
    ...state,
    steps: updatedSteps,
    status: "awaiting-resume",
    resumePoint: {
      step: exhaustedLoopName as StepName,
      reason: errorShape.message(this.maxIterations),
      iterationsExhausted: this.maxIterations,
    },
    error: { ... },  // error は情報として残す
    updatedAt: new Date().toISOString(),
  };
  ```
- [x] 2.4 `src/cli/run.ts` の `handlePostPipelineState` を更新: `awaiting-merge` 以外で `awaiting-resume` のケースを追加する。`awaiting-resume` は exit code 1 だが、ユーザーに resume 可能であることを伝えるメッセージを出力する
  ```typescript
  if (finalState.status === "awaiting-resume") {
    const rp = (finalState as any).resumePoint;
    logError(`Pipeline halted at step '${rp?.step ?? "unknown"}': ${rp?.reason ?? "escalation"}`);
    logInfo("Run 'specrunner resume' to continue from the halted step.");
    return 1;
  }
  ```

## 3. Phase 3 -- SIGINT handling

- [x] 3.1 `src/cli/run.ts`: SIGINT handler（`signalCleanup`）を変更。worktree 削除の代わりに `status: "awaiting-resume"` + `resumePoint` を persist する
  ```typescript
  const signalCleanup = async (): Promise<void> => {
    try {
      await updateJobState(jobState.jobId, (s) => ({
        ...s,
        status: "awaiting-resume" as const,
        resumePoint: {
          step: s.step as StepName,
          reason: "Interrupted by signal",
          iterationsExhausted: 0,
        },
        updatedAt: new Date().toISOString(),
      }));
    } catch {
      // Best-effort persist; state file (layer 2) handles residuals
    }
    process.exit(130);
  };
  ```
- [x] 3.2 `src/cli/run.ts`: `cleanupWorktreeOnFailure` を更新。`awaiting-resume` status の場合は worktree を削除しない（resume 用に保持）
  ```typescript
  const cleanupWorktreeOnFailure = async (): Promise<void> => {
    // Check if job is awaiting-resume — if so, keep worktree for resume
    try {
      const currentState = await loadJobState(jobState.jobId);
      if (currentState?.status === "awaiting-resume") return;
    } catch { /* proceed with cleanup */ }
    // ... existing cleanup logic ...
  };
  ```
- [x] 3.3 SIGTERM handler も同様に更新（SIGINT と同じロジック）

## 4. Phase 4 -- ps and finish updates

- [x] 4.1 `src/cli/ps.ts`: `ACTIVE_STATUSES` に `"awaiting-resume"` を追加する
  ```typescript
  const ACTIVE_STATUSES: Set<JobStatus> = new Set(["running", "awaiting-resume"]);
  ```
- [x] 4.2 `src/cli/ps.ts`: stale job detection を追加。`status === "running"` かつ `updatedAt` が 1 時間以上前の job の STATUS 列に `(stale?)` suffix を表示する
  ```typescript
  const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
  // formatJobRow 内で:
  const isStale = job.status === "running" && (nowMs - new Date(job.updatedAt).getTime()) > STALE_THRESHOLD_MS;
  const displayStatus = isStale ? "running (stale?)" : job.status;
  ```
- [x] 4.3 `src/core/finish/job-state-update.ts`: `assertJobFinishable` を exhaustive switch に書き換え
  ```typescript
  export function assertJobFinishable(state: JobState): void {
    switch (state.status) {
      case "archived":
        return; // idempotent
      case "awaiting-merge":
        return; // happy path
      case "running":
        throw new SpecRunnerError(
          ERROR_CODES.JOB_NOT_FINISHABLE,
          "Wait for the running job to complete before finishing.",
          `Cannot finish job ${state.jobId}: status is 'running'.`,
        );
      case "awaiting-resume":
        throw new SpecRunnerError(
          ERROR_CODES.JOB_NOT_FINISHABLE,
          "Run 'specrunner resume' to continue the halted job before finishing.",
          `Cannot finish job ${state.jobId}: status is 'awaiting-resume'.`,
        );
      case "canceled":
        throw new SpecRunnerError(
          ERROR_CODES.JOB_NOT_FINISHABLE,
          "Job is already canceled. No action needed.",
          `Cannot finish job ${state.jobId}: status is 'canceled'.`,
        );
      case "failed":
      case "terminated":
        throw new SpecRunnerError(
          ERROR_CODES.JOB_NOT_FINISHABLE,
          "Use 'specrunner cancel' to clean up failed or terminated jobs.",
          `Cannot finish job ${state.jobId}: status is '${state.status}'.`,
        );
      default: {
        const _exhaustive: never = state.status;
        throw new Error(`Unknown status: ${_exhaustive}`);
      }
    }
  }
  ```

## 5. Phase 5 -- Tests

- [x] 5.1 `validateJobState` のテスト: unknown status を reject することを検証する
- [x] 5.2 `validateJobState` のテスト: `awaiting-resume` / `canceled` が valid として通ることを検証する
- [x] 5.3 `validateJobState` のテスト: `resumePoint` の型検証を検証する
- [x] 5.4 `assertJobFinishable` のテスト: `awaiting-resume` → resume 案内エラーを検証する
- [x] 5.5 `assertJobFinishable` のテスト: `canceled` → 操作不要エラーを検証する
- [x] 5.6 `handleExhausted` のテスト: status が `awaiting-resume` になり `resumePoint` が設定されることを検証する
- [x] 5.7 Pipeline escalate terminal のテスト: escalation verdict で `awaiting-resume` に遷移することを検証する
- [x] 5.8 Pipeline escalate terminal のテスト: fatal error code で `failed` が維持されることを検証する
- [x] 5.9 ps の `ACTIVE_STATUSES` テスト: `awaiting-resume` が active として表示されることを検証する
- [x] 5.10 ps の stale detection テスト: 古い `running` job に `(stale?)` が付くことを検証する
- [x] 5.11 `bun run typecheck && bun run test` が green であることを確認する

## 6. Phase 6 -- Delta specs

- [x] 6.1 `openspec/changes/jobstate-lifecycle-status/specs/job-state-store.delta.md` を作成: `awaiting-resume` / `canceled` / `ResumePoint` / `validateJobState` status validation の MODIFIED/NEW Requirements
- [x] 6.2 `openspec/changes/jobstate-lifecycle-status/specs/step-execution-architecture.delta.md` を作成: Pipeline の escalation 遷移の MODIFIED Requirement
