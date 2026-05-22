# Design: job-state-store-di

## Problem

`new JobStateStore(jobId)` が pipeline run 経路で 7+1 箇所 inline 生成されている。`pipeline.ts` は 7 回（L93/203/213/278/296/367/470）、`executor.ts` は `getStore()` 内で 1 回。一方 `spawn`/`sleepFn`/`runner` は `PipelineDeps` 経由で注入済み。同一レイヤー内で DI と素 new が混在し、テストで永続化分岐を差し替えられない。

## Decision

### D1: `storeFactory` を `PipelineDeps` に追加（factory 注入）

`PipelineDeps` に `storeFactory: (jobId: string) => JobStateStore` を required field で追加する。

**Rationale**: `buildDeps(config, request, slug, workspace)` は jobId を引数に取らない。jobId は `prepare()` で確定する。単一インスタンス注入は composition root のシグネチャ変更を強制する。factory なら deps は jobId 非依存で構築でき、`spawn: SpawnFn` と同型の注入パターンになる。

**却下案**: `JobStateStore` instance を直接注入 → composition root で jobId を知る必要があり結合が増える。optional + default fallback → `spawn` で排除した「leaky default」パターンの再導入になる。

### D2: `StoreFactory` 型を export

`src/core/types.ts` に `StoreFactory` 型を定義・export する:

```ts
export type StoreFactory = (jobId: string) => JobStateStore;
```

`PipelineDeps.storeFactory` はこの型で宣言する。型を export することで、スコープ外の cancel/finish/resume が将来同じ seam に乗れる。

### D3: composition root は `RuntimeStrategy.buildDeps()`

`local.ts` と `managed.ts` の `buildDeps()` に `storeFactory: (id) => new JobStateStore(id)` を追加する。`spawn: spawnCommand` を注入しているのと同じ場所。

**却下案**: `CommandRunner` に root を置く → runtime strategy 分離が崩れる。

### D4: `Pipeline` は `deps.storeFactory` 経由で store を取得

`pipeline.ts` の 7 箇所の `new JobStateStore(state.jobId)` を全て `deps.storeFactory(state.jobId)` に置換する。Pipeline は constructor で `storeFactory` を受け取らず、`run`/`runInternal` の引数 `deps: PipelineDeps` から取得する（既存パターンと一致）。

### D5: `StepExecutor.getStore()` は `storeFactory` を使用しキャッシュを維持

`StepExecutor` の `getStore(jobId)` 内の `new JobStateStore(jobId)` を `this.storeFactory(jobId)` に置換する。キャッシュ機構（同一 jobId なら同一インスタンスを返す）はそのまま残す。`storeFactory` は `StepExecutor` の constructor に追加する。

`createStandardPipeline` と `runDesignPipeline` で `new StepExecutor(bus, runner)` → `new StepExecutor(bus, runner, deps.storeFactory)` に変更。既存の optional `spawnFn`/`sleepFn` の前に required パラメータとして追加すると既存呼び出しが壊れるため、`spawnFn` の後、`sleepFn` の前に挿入する（named object パラメータではなく positional のため位置が重要）。

実際の `StepExecutor` constructor は `(events, runner, spawnFn?, sleepFn?)` なので `storeFactory` は `spawnFn` の後に挿入: `(events, runner, spawnFn?, storeFactory?, sleepFn?)`。あるいは全 optional の前に required として `(events, runner, storeFactory, spawnFn?, sleepFn?)` とする方が型安全。後者を採用。

### D6: テストヘルパーに default `storeFactory` を 1 箇所置く

pipeline-integration test 等のテストヘルパーに `(id: string) => new JobStateStore(id)` の default factory を 1 箇所定義する。fake store が必要なテストは `storeFactory` を差し替える。

### D7: port 化しない

`JobStateStore` の interface 抽出はしない。具象 class の factory 注入で testability は達成される。テストでは `JobStateStore` と同じメソッドを持つ in-memory fake を `satisfies` で型チェックし差し替え可能にする。

## Files Changed

| File | Change |
|------|--------|
| `src/core/types.ts` | `StoreFactory` 型を定義・export。`PipelineDeps` に `storeFactory: StoreFactory` を追加 |
| `src/core/pipeline/pipeline.ts` | 7 箇所の `new JobStateStore(...)` → `deps.storeFactory(...)` に置換。import 不要化 |
| `src/core/step/executor.ts` | constructor に `storeFactory` パラメータ追加。`getStore()` 内の `new` → `this.storeFactory()` |
| `src/core/pipeline/run.ts` | `new StepExecutor()` に `deps.storeFactory` を渡す |
| `src/core/runtime/local.ts` | `buildDeps()` に `storeFactory: (id) => new JobStateStore(id)` 追加 |
| `src/core/runtime/managed.ts` | `buildDeps()` に `storeFactory: (id) => new JobStateStore(id)` 追加 |
| `tests/pipeline-integration.test.ts` | deps に `storeFactory` 追加 |
| `tests/unit/core/command/runner.test.ts` | deps mock に `storeFactory` 追加（型エラー解消） |

## Not Changed

| File | Reason |
|------|--------|
| `src/store/job-state-store.ts` | store の責務・実装は変更しない |
| `src/state/store.ts` | deprecated 関数群は pipeline run 経路外 |
| `src/core/cancel/runner.ts` | スコープ外（PipelineDeps チェーン外） |
| `src/core/finish/*` | スコープ外 |
| `src/core/command/runner.ts` | スコープ外（L91/136/155 の new は CommandRunner 層の短命経路） |
| `src/core/command/resume.ts` | スコープ外 |
| `src/core/runtime/strategy.ts` | `buildDeps` の戻り値型は `PipelineDeps` で既に定義済み。interface 変更不要 |
