# 永続化パスを JobStateStore に一元化する

## Meta

- **type**: refactoring
- **slug**: persistence-unification
- **base-branch**: main

## 背景

job state の永続化に 2 つの独立したパスが存在する:

- `src/state/store.ts` — 自由関数（`createJobState`, `loadJobState`, `updateJobState`, `deleteJobState`, `listJobStates`, `resolveJobId`）
- `src/store/job-state-store.ts` — `JobStateStore` class（`persist`, `update`, `fail`, `appendHistory`）

Pipeline 層は class を使い、finish / resume / rm / ps 層は自由関数を使う。同じ JSON ファイルに書くがバリデーション経路が異なり、レガシー正規化ロジックも重複している（`schema.ts` の `normalizeSteps` と `job-state-store.ts` の `normalizeStepsToStepRuns`）。

#75 Phase 3 として永続化を `JobStateStore` に一元化する。

## 要件

1. `state/store.ts` の `updateJobState` を `JobStateStore` への委譲に変更し deprecated マークを付ける
2. `state/store.ts` の `loadJobState` を `JobStateStore` への委譲に変更し deprecated マークを付ける
3. `finish/orchestrator.ts`, `finish/job-state-update.ts`, `resume.ts` の呼び出しを `JobStateStore` に移行する
4. レガシー正規化ロジックの重複を解消する
   - `schema.ts` の `normalizeSteps` を canonical にする
   - `job-state-store.ts` の `normalizeStepsToStepRuns` を削除し `schema.ts` 側を呼ぶ
5. `listJobStates` と `resolveJobId` は `JobStateStore` の static メソッドに移動する
   - `state/store.ts` からの re-export は維持（import 互換性）
6. `deleteJobState` は `JobStateStore` の static メソッドに移動する
7. `createJobState` は `JobStateStore` の static メソッドに移動する

## スコープ外

- `state/store.ts` ファイル自体の削除（re-export を残すため当面維持）
- `transitionJob` の永続化統合（`transitionAndPersist` convenience 関数）— 別途検討
- `JobStateStore` のコンストラクタ API 変更

## 受け入れ基準

- [ ] `updateJobState` / `loadJobState` が `JobStateStore` に委譲している
- [ ] 呼び出し元が直接 `JobStateStore` を使うように移行されている（少なくとも finish / resume）
- [ ] レガシー正規化ロジックの重複が解消されている
- [ ] 既存テストが全て通る
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `state/store.ts` は re-export ファイルとして残す。import パスの一括変更は破壊が大きい
- `listJobStates` / `resolveJobId` は jobId なしで呼ぶため static メソッドが適切
- 正規化は `schema.ts` の `validateJobState` → `normalizeSteps` のパスを canonical とする
