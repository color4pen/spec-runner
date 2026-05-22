# Test Cases: job-state-store-di

## Legend

- **Priority**: must / should / could
- **Source**: tasks.md タスク番号 or 受け入れ基準の番号

---

## Category: DI Contract — PipelineDeps.storeFactory 型定義

### TC-01 StoreFactory 型が export されている

- **Priority**: must
- **Source**: Task 1 / 受け入れ基準 4
- **GIVEN** `src/core/types.ts` が実装済みである
- **WHEN** `import type { StoreFactory } from "src/core/types.js"` を任意のファイルで行う
- **THEN** 型解決が成功し、`StoreFactory` が `(jobId: string) => JobStateStore` のシグネチャを持つことを TypeScript が認識する

---

### TC-02 PipelineDeps に storeFactory フィールドが存在する

- **Priority**: must
- **Source**: Task 1 / 受け入れ基準 2
- **GIVEN** `src/core/types.ts` の `PipelineDeps` interface が更新済みである
- **WHEN** `PipelineDeps` 型に準拠するオブジェクトを構築する
- **THEN** `storeFactory` フィールドが required として要求され、省略するとコンパイルエラーになる

---

### TC-03 storeFactory はオプショナルではなく必須フィールドである

- **Priority**: must
- **Source**: 要件 1（leaky default を作らない）
- **GIVEN** `PipelineDeps` の型定義がある
- **WHEN** `storeFactory` を省略した `PipelineDeps` オブジェクトを定義する
- **THEN** TypeScript が型エラーを報告し、`bun run typecheck` が失敗する

---

## Category: Pipeline — inline new の排除

### TC-04 pipeline.ts に `new JobStateStore` が存在しない

- **Priority**: must
- **Source**: Task 4 / 受け入れ基準 1
- **GIVEN** `src/core/pipeline/pipeline.ts` が更新済みである
- **WHEN** `grep -n "new JobStateStore" src/core/pipeline/pipeline.ts` を実行する
- **THEN** マッチが 0 件である

---

### TC-05 pipeline の catch block が storeFactory 経由で store を取得する

- **Priority**: must
- **Source**: Task 4（L93 の置換）
- **GIVEN** pipeline run 中に catch block が実行される状況がある
- **WHEN** `pipeline.run()` が例外をキャッチする
- **THEN** `deps.storeFactory(finalState.jobId)` が呼ばれ、`new JobStateStore` は呼ばれない

---

### TC-06 escalation 時に storeFactory 経由で store を取得する

- **Priority**: must
- **Source**: Task 4（L296 の置換）
- **GIVEN** pipeline が escalate → awaiting-resume に遷移する状況がある
- **WHEN** escalation 分岐が実行される
- **THEN** `deps.storeFactory(state.jobId)` が呼ばれ、store への persist が行われる

---

### TC-07 loop exhaustion 時に storeFactory 経由で store を取得する

- **Priority**: must
- **Source**: Task 4（L470 handleExhausted）/ 受け入れ基準 3
- **GIVEN** ループが上限回数に達した pipeline run がある
- **WHEN** `handleExhausted` が呼ばれる
- **THEN** `deps.storeFactory(exhaustedState.jobId)` が呼ばれ、状態が永続化される

---

### TC-08 end → awaiting-merge 遷移時に storeFactory 経由で store を取得する

- **Priority**: must
- **Source**: Task 4（L278 の置換）
- **GIVEN** pipeline が end → awaiting-merge に遷移する
- **WHEN** 該当遷移分岐が実行される
- **THEN** `deps.storeFactory(state.jobId)` が呼ばれる

---

### TC-09 post-step persist が storeFactory 経由で store を取得する

- **Priority**: must
- **Source**: Task 4（L213 の置換）
- **GIVEN** pipeline がステップ実行後に状態を永続化する
- **WHEN** post-step persist 処理が実行される
- **THEN** `deps.storeFactory(state.jobId)` が呼ばれ、`new JobStateStore` は呼ばれない

---

### TC-10 transition history 記録が storeFactory 経由で store を取得する

- **Priority**: should
- **Source**: Task 4（L367 の置換）
- **GIVEN** pipeline が遷移履歴を記録する
- **WHEN** transition history 処理が実行される
- **THEN** `deps.storeFactory(state.jobId)` が呼ばれる

---

## Category: StepExecutor — storeFactory への移行

### TC-11 executor.ts に `new JobStateStore` が存在しない

- **Priority**: must
- **Source**: Task 2 / 受け入れ基準 1
- **GIVEN** `src/core/step/executor.ts` が更新済みである
- **WHEN** `grep -n "new JobStateStore" src/core/step/executor.ts` を実行する
- **THEN** マッチが 0 件である

---

### TC-12 StepExecutor の constructor が storeFactory を受け取る

- **Priority**: must
- **Source**: Task 2
- **GIVEN** `StepExecutor` クラスが更新済みである
- **WHEN** `new StepExecutor(bus, runner, storeFactory)` でインスタンスを生成する
- **THEN** コンパイルエラーなく生成でき、`storeFactory` が third positional argument として機能する

---

### TC-13 getStore() キャッシュが同一 jobId で storeFactory を 1 回のみ呼ぶ

- **Priority**: must
- **Source**: Task 2（キャッシュ機構の維持）
- **GIVEN** `StepExecutor` が fake storeFactory（呼び出し回数をカウントする）で生成されている
- **WHEN** `getStore(jobId)` を同じ jobId で 3 回呼ぶ
- **THEN** storeFactory の呼び出し回数が 1 回であり、同一インスタンスが返される

---

### TC-14 getStore() が異なる jobId で新しいインスタンスを生成する

- **Priority**: should
- **Source**: Task 2（キャッシュ機構の維持）
- **GIVEN** `StepExecutor` が fake storeFactory で生成されている
- **WHEN** `getStore("job-1")` の後に `getStore("job-2")` を呼ぶ
- **THEN** storeFactory が 2 回呼ばれ、異なるインスタンスが返される

---

### TC-15 pipeline と executor が同一の storeFactory を共有する

- **Priority**: must
- **Source**: 受け入れ基準 2
- **GIVEN** pipeline run が fake storeFactory で起動されている
- **WHEN** pipeline 内でステップが実行され、executor と pipeline 両方が store を参照する
- **THEN** 共有された同一 fake storeFactory の呼び出しとして観測できる（`new JobStateStore` が別々に呼ばれない）

---

## Category: Composition Root — buildDeps への注入

### TC-16 local.ts の buildDeps が storeFactory を返す

- **Priority**: must
- **Source**: Task 5a / 受け入れ基準 2
- **GIVEN** `src/core/runtime/local.ts` が更新済みである
- **WHEN** `LocalRuntimeStrategy.buildDeps(...)` を呼ぶ
- **THEN** 返却された deps オブジェクトに `storeFactory` が含まれ、`storeFactory("any-id")` が `JobStateStore` のインスタンスを返す

---

### TC-17 managed.ts の buildDeps が storeFactory を返す

- **Priority**: must
- **Source**: Task 5b / 受け入れ基準 2
- **GIVEN** `src/core/runtime/managed.ts` が更新済みである
- **WHEN** `ManagedRuntimeStrategy.buildDeps(...)` を呼ぶ
- **THEN** 返却された deps オブジェクトに `storeFactory` が含まれ、`storeFactory("any-id")` が `JobStateStore` のインスタンスを返す

---

### TC-18 composition root の storeFactory が呼ばれるたびに新しいインスタンスを生成する

- **Priority**: should
- **Source**: Task 5（factory semantics の確認）
- **GIVEN** `buildDeps()` から取得した `storeFactory` がある
- **WHEN** `storeFactory("job-A")` と `storeFactory("job-B")` をそれぞれ呼ぶ
- **THEN** 異なる `JobStateStore` インスタンスが返され、それぞれが対応する jobId でパスを解決している

---

## Category: Testability — fake store による永続化分岐の観測

### TC-19 fake storeFactory で pipeline の escalation 永続化を観測できる

- **Priority**: must
- **Source**: 受け入れ基準 3 / Task 4（L296）
- **GIVEN** in-memory fake store（`satisfies` で JobStateStore 構造に合わせたオブジェクト）を返す storeFactory がある
- **WHEN** escalation を引き起こす pipeline run を fake storeFactory で実行する
- **THEN** fake store の `persist`（または相当メソッド）が呼ばれたことをテストから観測できる

---

### TC-20 fake storeFactory で pipeline の loop exhaustion 永続化を観測できる

- **Priority**: must
- **Source**: 受け入れ基準 3 / Task 4（L470）
- **GIVEN** in-memory fake store を返す storeFactory がある
- **WHEN** loop exhaustion を引き起こす pipeline run を fake storeFactory で実行する
- **THEN** fake store の persist が呼ばれ、exhausted 状態が記録されたことを検証できる

---

### TC-21 fake storeFactory でファイル I/O を抑制できる

- **Priority**: must
- **Source**: 要件 4（テストで永続化差し替え）
- **GIVEN** in-memory fake storeFactory を使ったテストがある
- **WHEN** pipeline run を実行する
- **THEN** XDG パスへのファイル書き込みが発生しない（fake store が I/O を代替している）

---

### TC-22 テストヘルパーに default storeFactory が 1 箇所だけ定義されている

- **Priority**: should
- **Source**: 要件 4 / Task 6
- **GIVEN** pipeline-integration テストのヘルパーがある
- **WHEN** ヘルパーを grep で検索する
- **THEN** `(id: string) => new JobStateStore(id)` のパターンが 1 箇所のみ存在する

---

### TC-23 既存の結合テストが実 store のままで動作する

- **Priority**: must
- **Source**: 要件 4（既存の結合テストは実 store のままでよい）
- **GIVEN** `tests/pipeline-integration.test.ts` が storeFactory 追加後に更新されている
- **WHEN** `bun run test` を実行する
- **THEN** 既存の結合テストが全てパスする（振る舞いに変更なし）

---

## Category: Type Safety — typecheck green

### TC-24 全変更後に typecheck が green になる

- **Priority**: must
- **Source**: 受け入れ基準 5
- **GIVEN** Task 1–6 が全て完了している
- **WHEN** `bun run typecheck` を実行する
- **THEN** 型エラーが 0 件である

---

### TC-25 runner.test.ts の deps mock に storeFactory が含まれている

- **Priority**: must
- **Source**: Task 6b
- **GIVEN** `tests/unit/core/command/runner.test.ts` が更新済みである
- **WHEN** `bun run typecheck` を実行する
- **THEN** runner.test.ts 起因の型エラーが出ない

---

### TC-26 全テストが green になる

- **Priority**: must
- **Source**: 受け入れ基準 5
- **GIVEN** Task 1–6 が全て完了している
- **WHEN** `bun run test` を実行する
- **THEN** テストが全件パスする

---

## Category: Scope Boundary — スコープ外ファイルの不変性

### TC-27 cancel/finish/resume/command-runner に inline new が残っている（スコープ外）

- **Priority**: should
- **Source**: スコープ外の明示
- **GIVEN** `src/core/cancel/runner.ts`、`src/core/finish/`、`src/core/command/runner.ts`、`src/core/command/resume.ts` がある
- **WHEN** これらのファイルを grep で確認する
- **THEN** `new JobStateStore` がこれらのファイルに残っており、本変更で変更されていない

---

### TC-28 job-state-store capability spec が変更されていない

- **Priority**: should
- **Source**: 要件 5（`job-state-store` capability は触らない）
- **GIVEN** `specrunner/specs/job-state-store/` ディレクトリがある
- **WHEN** git diff で変更ファイルを確認する
- **THEN** `specrunner/specs/job-state-store/` 配下のファイルに変更がない

---

### TC-29 JobStateStore の public メソッド契約が変更されていない

- **Priority**: must
- **Source**: スコープ外（store の責務・実装は変更しない）
- **GIVEN** `src/store/job-state-store.ts` がある
- **WHEN** git diff を確認する
- **THEN** `src/store/job-state-store.ts` に変更がない

---

### TC-30 deprecated 関数群（store.ts）が変更されていない

- **Priority**: should
- **Source**: 要件 7
- **GIVEN** `src/state/store.ts` がある
- **WHEN** git diff を確認する
- **THEN** `src/state/store.ts` に変更がない

---

## Category: Delta Spec — 注入 seam の仕様記述

### TC-31 step-execution-architecture spec に storeFactory 注入契約が記述されている

- **Priority**: must
- **Source**: 要件 5 / 受け入れ基準 4
- **GIVEN** `specrunner/changes/job-state-store-di/specs/step-execution-architecture/spec.md` がある
- **WHEN** spec の内容を確認する
- **THEN** 「JobStateStore は storeFactory 経由で注入され inline new しない」という契約が明記されている

---

### TC-32 pipeline-orchestrator spec に storeFactory の deps 追加が記述されている

- **Priority**: must
- **Source**: 要件 5 / 受け入れ基準 4
- **GIVEN** `specrunner/changes/job-state-store-di/specs/pipeline-orchestrator/spec.md` がある
- **WHEN** spec の内容を確認する
- **THEN** `PipelineDeps` に `storeFactory` が追加されたこと、composition root での注入が記述されている

---

## Summary

| Priority | Count |
|----------|-------|
| must     | 22    |
| should   | 8     |
| could    | 0     |
| **Total** | **32** |
