## 1. 正規化ロジックの統一

- [x] 1.1 `src/store/job-state-store.ts` の `normalizeStepsToStepRuns` と関連ヘルパー群（`isLegacySingleResult`, `isStepResultShape`, `isStepRunShape`, `normalizeSingleResultToStepRun`, `normalizeStepResultToStepRun`）を削除する
- [x] 1.2 `JobStateStore.load()` を `validateJobState()` 経由に変更する。現在の手動 JSON parse + 部分バリデーション + `normalizeStepsToStepRuns` を、`readFile → JSON.parse → validateJobState(parsed)` に置き換える
- [x] 1.3 既存テスト（TC-001〜TC-008 in `tests/store/job-state-store.test.ts`）が green であることを確認

## 2. static メソッドの追加

- [x] 2.1 `JobStateStore.create(params: { request: RequestInfo; repository: RepositoryInfo }): Promise<JobState>` を実装。`state/store.ts` の `createJobState` のロジックを移動
- [x] 2.2 `JobStateStore.delete(jobId: string): Promise<void>` を実装。`state/store.ts` の `deleteJobState` のロジックを移動（ENOENT idempotent）
- [x] 2.3 `JobStateStore.list(): Promise<JobState[]>` を実装。`state/store.ts` の `listJobStates` のロジックを移動（malformed skip + stderr log）
- [x] 2.4 `JobStateStore.resolveId(prefix: string): Promise<string>` を実装。`state/store.ts` の `resolveJobId` のロジックを移動（full UUID shortcut + prefix match）

## 3. `state/store.ts` の委譲化

- [x] 3.1 `createJobState` → `JobStateStore.create` への委譲 + `@deprecated` JSDoc
- [x] 3.2 `loadJobState` → `new JobStateStore(jobId).load()` への委譲 + `@deprecated` JSDoc。戻り値は `JobState` にキャスト（型互換性維持）
- [x] 3.3 `updateJobState` → `new JobStateStore(jobId)` で load + mutator + persist への委譲 + `@deprecated` JSDoc
- [x] 3.4 `deleteJobState` → `JobStateStore.delete` への委譲 + `@deprecated` JSDoc
- [x] 3.5 `listJobStates` → `JobStateStore.list` への委譲 + `@deprecated` JSDoc
- [x] 3.6 `resolveJobId` → `JobStateStore.resolveId` への委譲 + `@deprecated` JSDoc
- [x] 3.7 `state/store.ts` の不要な import（`fs`, `randomUUID`, `atomicWriteJson`, `validateJobState`, `Dirent`, `stderrWrite`, `ambiguousJobIdError`）を削除。`JobStateStore` と型の re-export のみ残す

## 4. finish 層の移行

- [x] 4.1 `src/core/finish/job-state-update.ts`: `markJobArchived` の `updateJobState` 呼び出しを `JobStateStore` のインスタンスメソッド経由に変更。`import { updateJobState }` を `import { JobStateStore }` に変更
- [x] 4.2 `src/core/finish/orchestrator.ts`: `loadJobState` 呼び出しを `JobStateStore` 経由に変更
- [x] 4.3 `src/core/finish/orchestrator.ts`: Phase 4 の `updateJobState(target.jobId, (s) => ({ ...s, worktreePath: null }))` を `JobStateStore` 経由に変更

## 5. resume 層の移行

- [x] 5.1 `src/core/command/resume.ts`: `loadJobState` / `resolveJobId` を `JobStateStore` 経由に変更
- [x] 5.2 `src/core/command/resume.ts`: stale detection の `updateJobState` 呼び出しを `JobStateStore` 経由に変更
- [x] 5.3 `src/core/command/resume.ts`: "running" transition の `updateJobState` 呼び出しを `JobStateStore` 経由に変更
- [x] 5.4 `import { updateJobState, loadJobState, resolveJobId }` を `import { JobStateStore }` に変更

## 6. Delta Spec

- [x] 6.1 `openspec/changes/persistence-unification/specs/job-state-store/spec.md` に delta spec を記述

## 7. 検証

- [x] 7.1 `bun run typecheck` が green
- [x] 7.2 `bun run test` が green
