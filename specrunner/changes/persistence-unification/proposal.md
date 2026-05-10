## Why

job state の永続化に 2 つの独立パスが存在する:

- `state/store.ts` — 自由関数（`createJobState`, `loadJobState`, `updateJobState`, `deleteJobState`, `listJobStates`, `resolveJobId`）
- `store/job-state-store.ts` — `JobStateStore` class（`persist`, `update`, `fail`, `appendHistory`, `appendStepRun`）

Pipeline 層は class を使い、finish / resume / rm / ps / runtime 層は自由関数を使う。同じ JSON ファイルに書くがバリデーション経路が異なる。レガシー正規化ロジックも `schema.ts` の `normalizeSteps` と `job-state-store.ts` の `normalizeStepsToStepRuns` で重複している。

#75 Phase 3 として永続化を `JobStateStore` に一元化する。

## What Changes

- `state/store.ts` の `updateJobState` / `loadJobState` を `JobStateStore` への委譲に変更し deprecated マーク
- `createJobState` / `deleteJobState` / `listJobStates` / `resolveJobId` を `JobStateStore` の static メソッドに移動
- `state/store.ts` は re-export ファイルとして維持（import 互換性）
- `finish/orchestrator.ts`, `finish/job-state-update.ts`, `resume.ts` の呼び出しを `JobStateStore` に移行
- `job-state-store.ts` の `normalizeStepsToStepRuns` を削除し `schema.ts` の `normalizeSteps` を使用

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `job-state-store`: `JobStateStore` に `create`, `delete`, `list`, `resolveJobId` の static メソッドを追加。`load()` メソッドが `schema.ts` の `normalizeSteps` を使用するよう変更

## Impact

- `src/store/job-state-store.ts`: static メソッド追加、`normalizeStepsToStepRuns` 削除、`load()` が `schema.ts` 経由で正規化
- `src/state/store.ts`: 全関数を `JobStateStore` への委譲 + deprecated マーク + re-export に変更
- `src/core/finish/job-state-update.ts`: `updateJobState` → `JobStateStore` 直接使用
- `src/core/finish/orchestrator.ts`: `loadJobState` / `updateJobState` → `JobStateStore` 直接使用
- `src/core/command/resume.ts`: `updateJobState` / `loadJobState` / `resolveJobId` → `JobStateStore` 直接使用
- 既存テスト: import パス変更なし（`state/store.ts` が re-export を維持するため）
