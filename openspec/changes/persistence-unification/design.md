## Context

job state の永続化が `state/store.ts`（自由関数）と `store/job-state-store.ts`（`JobStateStore` class）の 2 層に分かれている。Pipeline 層（step executor, pipeline.ts）は class を、CLI 層（finish, resume, rm, ps）と runtime 層（local.ts, managed.ts）は自由関数を使う。

レガシー正規化ロジックが 2 箇所で重複:
- `schema.ts` の `normalizeSteps` — `validateJobState` 内で呼ばれる
- `job-state-store.ts` の `normalizeStepsToStepRuns` — `load()` 内で呼ばれる

両者は同じ目的（pre-PR24 / post-PR24 の StepResult → StepRun 変換）だが実装が異なる。

## Goals / Non-Goals

**Goals:**

- 永続化パスを `JobStateStore` に一元化
- レガシー正規化ロジックの重複を `schema.ts` に統一
- `state/store.ts` を re-export ファイルとして維持（import 互換性）
- finish / resume の呼び出し元を `JobStateStore` に移行

**Non-Goals:**

- `state/store.ts` ファイルの削除（re-export を残すため当面維持）
- `transitionJob` の永続化統合（`transitionAndPersist` convenience 関数）
- `JobStateStore` のコンストラクタ API 変更
- runtime 層（local.ts, managed.ts）の移行（スコープ外。自由関数 re-export 経由で既に動作する）

## Decisions

### D1: 正規化ロジックの統一

`schema.ts` の `normalizeSteps` を canonical にし、`job-state-store.ts` の `normalizeStepsToStepRuns` と関連ヘルパー群を削除する。

`JobStateStore.load()` は `validateJobState()` を呼ぶよう変更する。`validateJobState` 内部で `normalizeSteps` が呼ばれるため、`load()` 側での二重正規化が解消される。

**理由**: `validateJobState` は既にバリデーション + 正規化 + backward compat 修正（status remap, error code remap, slug default）を一括で行う。`load()` が自前で JSON parse → 部分バリデーション → 独自正規化をしていたのは責務の重複。

**変更後の `load()` フロー**:
```
readFile → JSON.parse → validateJobState(parsed) → NormalizedJobState にキャスト
```

`normalizeSteps` は `validateJobState` 内部で `obj["steps"]` を上書きするため、返り値の `steps` は既に `Record<string, StepRun[]>` 形式。`NormalizedJobState` へのキャストは型安全。

### D2: `loadJobState` の委譲

`state/store.ts` の `loadJobState` の実装を `JobStateStore` インスタンスの `load()` 呼び出しに委譲する。ただし `load()` は `NormalizedJobState` を返すのに対し、`loadJobState` は `JobState` を返す。

**選択肢**:
- A) `loadJobState` の戻り値を `NormalizedJobState` に変更 → 呼び出し元の型が壊れる
- B) `loadJobState` は `JobState` を返し続ける。`validateJobState` を直接呼ぶ現状の実装を維持しつつ deprecated マークのみ → 委譲にならない
- C) `loadJobState` は内部で `JobStateStore` の static `load` を呼び、`JobState` にキャストして返す

**選択: C**。`JobStateStore` に static `load(jobId)` を追加し、`validateJobState` 経由でバリデーション + 正規化を実行する。`loadJobState` はこれを呼び `JobState` として返す（`steps` は既に正規化済みだが型上は `JobState` のまま）。呼び出し元の型互換性を維持しつつ、実行パスを一本化する。

### D3: `updateJobState` の委譲

`state/store.ts` の `updateJobState` は read-modify-write パターン:
```typescript
const current = await loadJobState(jobId);
const updated = mutator(current);
await atomicWriteJson(filePath, updated);
```

`JobStateStore` への委譲:
```typescript
const store = new JobStateStore(jobId);
const current = await store.load();
const updated = mutator(current as JobState);
await store.persist(updated);
```

mutator が `JobState` を受け取り `JobState` を返す既存シグネチャを維持する。

### D4: `createJobState` → static メソッド

`JobStateStore.create(params)` として実装。内部ロジックは `state/store.ts` の `createJobState` と同一（UUID 生成、初期状態構築、atomicWriteJson）。

`state/store.ts` の `createJobState` は `JobStateStore.create` への委譲 + deprecated マーク。

### D5: `deleteJobState` → static メソッド

`JobStateStore.delete(jobId)` として実装。idempotent な ENOENT 処理を含む。

### D6: `listJobStates` / `resolveJobId` → static メソッド

`JobStateStore.list()` / `JobStateStore.resolveId(prefix)` として実装。`list()` は directory scan + `validateJobState` で各ファイルを検証。

`resolveId` は full UUID (36 chars) のショートカットと prefix マッチを維持。

### D7: `normalizeSteps` の export

`schema.ts` の `normalizeSteps` は現在 `validateJobState` 内部で使用されており、非 export。`JobStateStore.load()` が `validateJobState` を呼ぶ設計（D1）により、`normalizeSteps` を直接 export する必要はない。

### D8: finish/resume の移行方針

- `finish/job-state-update.ts`: `markJobArchived` が `updateJobState` → `JobStateStore` の static `load` + instance `persist` に変更
- `finish/orchestrator.ts`: `loadJobState` → `JobStateStore.load`、`updateJobState` → `new JobStateStore(id).update()`
- `resume.ts`: `updateJobState` / `loadJobState` / `resolveJobId` → `JobStateStore` の対応メソッド

## Risks

- `normalizeSteps`（schema.ts）と `normalizeStepsToStepRuns`（job-state-store.ts）の出力が微妙に異なる可能性。既存テスト（TC-001〜TC-008）の round-trip テストで検証する
- `loadJobState` の戻り値は `JobState` だが、`steps` は実際には正規化済み `Record<string, StepRun[]>` → 型の嘘。既存コードも同じ状態（`validateJobState` が `normalizeSteps` を適用済み）なので実質変更なし
