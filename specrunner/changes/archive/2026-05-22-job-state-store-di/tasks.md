# Tasks: job-state-store-di

## [x] Task 1: `StoreFactory` 型定義と `PipelineDeps` への追加

**File**: `src/core/types.ts`

1. `import type { JobStateStore } from "../store/job-state-store.js";` を追加
2. `PipelineDeps` interface の前に型を定義:
   ```ts
   /**
    * Factory function that creates a JobStateStore for the given job ID.
    * Injected via PipelineDeps to eliminate inline `new JobStateStore()` calls.
    * Exported so that cancel/finish/resume can adopt the same seam in future requests.
    */
   export type StoreFactory = (jobId: string) => JobStateStore;
   ```
3. `PipelineDeps` interface に field を追加（`spawn: SpawnFn` の直後）:
   ```ts
   /**
    * Factory for creating JobStateStore instances. Injected by RuntimeStrategy.buildDeps().
    * Pipeline and executor use this instead of inline `new JobStateStore()`.
    * Design D1 (job-state-store-di): required to prevent leaky defaults in tests.
    */
   storeFactory: StoreFactory;
   ```

**Verification**: `bun run typecheck` — `buildDeps` の戻り値に `storeFactory` が不足するエラーが出る（Task 4 で解消）。

## [x] Task 2: `StepExecutor` の constructor に `storeFactory` 追加

**File**: `src/core/step/executor.ts`

1. `import { JobStateStore } from "../../store/job-state-store.js";` は残す（型参照で必要）
2. `private readonly storeFactory: StoreFactory;` フィールドを追加（`spawnFn`/`sleepFn` と並列）
3. `import type { StoreFactory } from "../types.js";` を追加（既存の `PipelineDeps` import に `StoreFactory` を追加）
4. constructor シグネチャを変更:
   - Before: `constructor(private readonly events: EventBus, private readonly runner: AgentRunner, spawnFn?: SpawnFn, sleepFn?: ...)`
   - After: `constructor(private readonly events: EventBus, private readonly runner: AgentRunner, storeFactory: StoreFactory, spawnFn?: SpawnFn, sleepFn?: ...)`
5. constructor body に `this.storeFactory = storeFactory;` を追加
6. `getStore(jobId)` メソッド (L366-372) 内の `new JobStateStore(jobId)` → `this.storeFactory(jobId)` に置換:
   ```ts
   private getStore(jobId: string): JobStateStore {
     if (!this.storeCache || this.storeCacheJobId !== jobId) {
       this.storeCache = this.storeFactory(jobId);
       this.storeCacheJobId = jobId;
     }
     return this.storeCache;
   }
   ```

**Verification**: `bun run typecheck` — `new StepExecutor()` の呼び出し箇所（run.ts）でエラーが出る（Task 3 で解消）。

## [x] Task 3: `createStandardPipeline` / `runDesignPipeline` の `StepExecutor` 構築を更新

**File**: `src/core/pipeline/run.ts`

1. `createStandardPipeline` (L57):
   - Before: `const executor = new StepExecutor(bus, runner);`
   - After: `const executor = new StepExecutor(bus, runner, deps.storeFactory);`
2. `runDesignPipeline` (L132):
   - Before: `const executor = new StepExecutor(bus, designRunner);`
   - After: `const executor = new StepExecutor(bus, designRunner, deps.storeFactory);`

## [x] Task 4: `pipeline.ts` の 7 箇所の `new JobStateStore` を `deps.storeFactory` に置換

**File**: `src/core/pipeline/pipeline.ts`

1. `import { JobStateStore } from "../../store/job-state-store.js";` を削除
2. 以下 7 箇所を置換:

   **L93** (`run` catch block):
   - Before: `const store = new JobStateStore(finalState.jobId);`
   - After: `const store = deps.storeFactory(finalState.jobId);`

   **L203** (executor error safety net):
   - Before: `const store = new JobStateStore(state.jobId);`
   - After: `const store = deps.storeFactory(state.jobId);`

   **L213** (post-step persist):
   - Before: `const store = new JobStateStore(state.jobId);`
   - After: `const store = deps.storeFactory(state.jobId);`

   **L278** (end → awaiting-merge):
   - Before: `const endStore = new JobStateStore(state.jobId);`
   - After: `const endStore = deps.storeFactory(state.jobId);`

   **L296** (escalate → awaiting-resume):
   - Before: `const escalateStore = new JobStateStore(state.jobId);`
   - After: `const escalateStore = deps.storeFactory(state.jobId);`

   **L367** (transition history):
   - Before: `const transitionStore = new JobStateStore(state.jobId);`
   - After: `const transitionStore = deps.storeFactory(state.jobId);`

   **L470** (handleExhausted):
   - Before: `const exhaustedStore = new JobStateStore(exhaustedState.jobId);`
   - After: `const exhaustedStore = deps.storeFactory(exhaustedState.jobId);`

3. `handleExhausted` メソッドに `deps` パラメータを追加（現在は `state` と `exhaustedLoopName` のみ）:
   - Before: `private async handleExhausted(state: JobState, exhaustedLoopName?: string, exhaustionPhase?: ...)`
   - After: `private async handleExhausted(state: JobState, deps: PipelineDeps, exhaustedLoopName?: string, exhaustionPhase?: ...)`
4. `handleExhausted` の呼び出し箇所（3 箇所、L319/L345 付近）に `deps` を追加

**Note**: `runInternal` は既に `deps: PipelineDeps` を受け取っている。`run` メソッドの catch block では `deps` が必要だが、`run` も `deps` を引数に取っている（L78）ので参照可能。

## [x] Task 5: composition root に `storeFactory` を注入

### 5a: `src/core/runtime/local.ts`

1. `import { JobStateStore } from "../../store/job-state-store.js";` を追加
2. `buildDeps()` の返却オブジェクトに追加:
   ```ts
   storeFactory: (id: string) => new JobStateStore(id),
   ```

### 5b: `src/core/runtime/managed.ts`

1. `import { JobStateStore } from "../../store/job-state-store.js";` を追加
2. `buildDeps()` の返却オブジェクトに追加:
   ```ts
   storeFactory: (id: string) => new JobStateStore(id),
   ```

**Verification**: `bun run typecheck` — green になるはず（Task 1-5 で型が一貫）。

## [x] Task 6: テストの deps に `storeFactory` を追加

### 6a: `tests/pipeline-integration.test.ts`

1. `import { JobStateStore } from "../src/store/job-state-store.js";` を追加（未 import の場合）
2. deps を構築している全箇所に `storeFactory: (id: string) => new JobStateStore(id)` を追加
3. 共通ヘルパーがある場合はそこに 1 箇所追加

### 6b: `tests/unit/core/command/runner.test.ts`

1. mock deps に `storeFactory` を追加（型エラー解消のため）

### 6c: その他テストファイル

1. `bun run typecheck` で `storeFactory` 不足エラーが出るテストファイルを洗い出し、同様に追加

## [x] Task 7: 検証

1. `bun run typecheck` — green
2. `bun run test` — green
3. grep 確認: `grep -rn "new JobStateStore" src/core/pipeline/ src/core/step/executor.ts` — 0 matches
4. grep 確認: `grep -rn "new JobStateStore" src/core/runtime/local.ts src/core/runtime/managed.ts` — 各 1 match（composition root の factory 内）
