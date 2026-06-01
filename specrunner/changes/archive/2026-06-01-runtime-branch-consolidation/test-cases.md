# Test Cases: config.runtime 分岐を createRuntime / RuntimeStrategy に集約する（B-8）

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 34
- **Manual**: 0
- **Priority**: must: 23, should: 11, could: 0

---

## Category: RuntimeStrategy Interface Contract

### TC-001: captureHeadSha がインターフェースに宣言されている

**Category**: unit  
**Priority**: must  
**Source**: T-01, AC(RuntimeStrategy に 3 メソッドが定義されている)

**GIVEN** `RuntimeStrategy` interface が `src/core/runtime/strategy.ts` に定義されている  
**WHEN** interface の型定義を静的に検査する  
**THEN** `captureHeadSha(cwd: string): Promise<string | null>` が宣言されている

---

### TC-002: prepareStepArtifacts がインターフェースに宣言されている

**Category**: unit  
**Priority**: must  
**Source**: T-01

**GIVEN** `RuntimeStrategy` interface が `src/core/runtime/strategy.ts` に定義されている  
**WHEN** interface の型定義を静的に検査する  
**THEN** `prepareStepArtifacts(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>` が宣言されている

---

### TC-003: finalizeStepArtifacts がインターフェースに宣言されている

**Category**: unit  
**Priority**: must  
**Source**: T-01

**GIVEN** `RuntimeStrategy` interface が `src/core/runtime/strategy.ts` に定義されている  
**WHEN** interface の型定義を静的に検査する  
**THEN** `finalizeStepArtifacts(step: AgentStep, state: JobState, deps: PipelineDeps, headBeforeStep: string | null, commitPushInfra: CommitPushInfra): Promise<void>` が宣言されている

---

### TC-004: T-02 実装後に typecheck が green になる

**Category**: unit  
**Priority**: must  
**Source**: T-01, AC(bun run typecheck が green)

**GIVEN** `RuntimeStrategy` に 3 メソッドが追加され、`LocalRuntime` と `ManagedRuntime` が実装済みである  
**WHEN** `bun run typecheck` を実行する  
**THEN** interface 未実装エラーが 0 件で typecheck が green になる

---

## Category: Unit — LocalRuntime

### TC-005: captureHeadSha が HEAD SHA を返す

**Category**: unit  
**Priority**: must  
**Source**: T-02, AC(LocalRuntime の実装が executor.ts の既存ロジックと同等)

**GIVEN** `LocalRuntime` が `captureHeadSha(cwd)` を実装している  
**WHEN** 有効な git リポジトリの cwd で `captureHeadSha` を呼び出す  
**THEN** `gitExec(spawnFn, cwd, ["rev-parse", "HEAD"])` の戻り値（HEAD SHA 文字列）が返る

---

### TC-006: captureHeadSha が非 git ディレクトリで null を返す

**Category**: unit  
**Priority**: should  
**Source**: T-02

**GIVEN** `LocalRuntime` が `captureHeadSha(cwd)` を実装している  
**WHEN** git リポジトリではないディレクトリで `captureHeadSha` を呼び出す  
**THEN** `null` が返る（`gitExec` の null 戻り値仕様に準拠）

---

### TC-007: prepareStepArtifacts が writeOutputTemplates を呼ぶ

**Category**: unit  
**Priority**: must  
**Source**: T-02, AC(LocalRuntime の実装が executor.ts の既存ロジックと同等)

**GIVEN** `LocalRuntime` が `prepareStepArtifacts(cwd, slug, stepName, state)` を実装している  
**WHEN** `prepareStepArtifacts` を呼び出す  
**THEN** `writeOutputTemplates(cwd, slug, stepName, state)` が呼び出され output テンプレートが配置される

---

### TC-008: finalizeStepArtifacts が cleanup → commitAndPush の順で実行される

**Category**: unit  
**Priority**: must  
**Source**: T-02, AC(LocalRuntime の実装が executor.ts の既存ロジックと同等)

**GIVEN** `LocalRuntime` が `finalizeStepArtifacts(step, state, deps, headBeforeStep, commitPushInfra)` を実装している  
**WHEN** 正常な step / state で `finalizeStepArtifacts` を呼び出す  
**THEN** `cleanupOutputTemplates(cwd, slug, step.name, state)` が呼ばれた後に `commitAndPush(step, state, deps, headBeforeStep, commitPushInfra)` が呼ばれる

---

### TC-009: finalizeStepArtifacts 内で commitAndPush が失敗したとき例外を rethrow する

**Category**: unit  
**Priority**: must  
**Source**: T-02, design D4

**GIVEN** `LocalRuntime.finalizeStepArtifacts` 内で `commitAndPush` が例外を throw する  
**WHEN** `finalizeStepArtifacts` を呼び出す  
**THEN** 例外がそのまま呼び出し元（executor）に rethrow される

---

### TC-010: finalizeStepArtifacts に headBeforeStep = null を渡してもエラーにならない

**Category**: unit  
**Priority**: should  
**Source**: T-02, design D4

**GIVEN** `LocalRuntime.finalizeStepArtifacts` が呼び出される  
**WHEN** `headBeforeStep` に `null` を渡す  
**THEN** `commitAndPush` に `null` が渡され、型エラー・例外なく完了する

---

## Category: Unit — ManagedRuntime

### TC-011: ManagedRuntime.captureHeadSha が null を返す（no-op）

**Category**: unit  
**Priority**: must  
**Source**: T-02, AC(bun run typecheck が green)

**GIVEN** `ManagedRuntime` が `captureHeadSha` を実装している  
**WHEN** 任意の cwd で `captureHeadSha` を呼び出す  
**THEN** `null` が返る（git 操作は実行されない）

---

### TC-012: ManagedRuntime.prepareStepArtifacts が no-op で完了する

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `ManagedRuntime` が `prepareStepArtifacts` を実装している  
**WHEN** 任意の引数で `prepareStepArtifacts` を呼び出す  
**THEN** 何も実行されずに `Promise<void>` が解決される

---

### TC-013: ManagedRuntime.finalizeStepArtifacts が no-op で完了する

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `ManagedRuntime` が `finalizeStepArtifacts` を実装している  
**WHEN** 任意の引数で `finalizeStepArtifacts` を呼び出す  
**THEN** 何も実行されず `Promise<void>` が解決される（git commit / push は実行されない）

---

## Category: Unit — PipelineDeps Injection

### TC-014: LocalRuntime.buildDeps が runtimeStrategy: this を注入する

**Category**: unit  
**Priority**: must  
**Source**: T-03, AC(buildDeps が runtimeStrategy を注入している)

**GIVEN** `PipelineDeps` に `runtimeStrategy?: RuntimeStrategy` フィールドが追加されている  
**WHEN** `LocalRuntime.buildDeps(config, request, slug, workspace)` を呼び出す  
**THEN** 返された `PipelineDeps.runtimeStrategy` が `LocalRuntime` インスタンス自身（`this`）である

---

### TC-015: ManagedRuntime.buildDeps が runtimeStrategy: this を注入する

**Category**: unit  
**Priority**: must  
**Source**: T-03

**GIVEN** `PipelineDeps` に `runtimeStrategy?: RuntimeStrategy` フィールドが追加されている  
**WHEN** `ManagedRuntime.buildDeps(config, request, slug, workspace)` を呼び出す  
**THEN** 返された `PipelineDeps.runtimeStrategy` が `ManagedRuntime` インスタンス自身（`this`）である

---

### TC-016: runtimeStrategy 未指定で PipelineDeps を構築してもコンパイルエラーにならない

**Category**: unit  
**Priority**: should  
**Source**: T-03, AC(bun run typecheck が green)

**GIVEN** `PipelineDeps.runtimeStrategy` が optional フィールドとして定義されている  
**WHEN** `runtimeStrategy` を指定せずに `PipelineDeps` オブジェクトを構築する  
**THEN** TypeScript コンパイルエラーが発生しない（後方互換が維持される）

---

## Category: Unit — Executor

### TC-017: executor.ts に config.runtime 分岐が残っていない

**Category**: unit  
**Priority**: must  
**Source**: T-04, AC(executor.ts に config.runtime 分岐が 0 件)

**GIVEN** リファクタリング後の `src/core/step/executor.ts` が存在する  
**WHEN** `grep -n "(config|cfg)\.runtime" src/core/step/executor.ts` を実行する  
**THEN** コメント行を除き、一致が 0 件である

---

### TC-018: executor が captureHeadSha を strategy 経由で呼ぶ

**Category**: unit  
**Priority**: must  
**Source**: T-04, design D2

**GIVEN** `deps.runtimeStrategy` に mock strategy が注入された `StepExecutor`  
**WHEN** `runAgentStep` が agent 実行前フェーズに入る  
**THEN** `deps.runtimeStrategy.captureHeadSha(cwd)` が 1 回呼ばれ、戻り値が後続の `finalizeStepArtifacts` 呼び出しに渡される

---

### TC-019: executor が prepareStepArtifacts を strategy 経由で呼ぶ

**Category**: unit  
**Priority**: must  
**Source**: T-04, design D2

**GIVEN** `deps.runtimeStrategy` に mock strategy が注入された `StepExecutor`  
**WHEN** `runAgentStep` が agent 実行前フェーズに入る  
**THEN** `deps.runtimeStrategy.prepareStepArtifacts(cwd, slug, step.name, state)` が 1 回呼ばれる

---

### TC-020: executor が finalizeStepArtifacts を strategy 経由で呼ぶ

**Category**: unit  
**Priority**: must  
**Source**: T-04, design D2

**GIVEN** `deps.runtimeStrategy` に mock strategy が注入された `StepExecutor`  
**WHEN** agent 実行が成功してポスト処理フェーズに入る  
**THEN** `deps.runtimeStrategy.finalizeStepArtifacts(step, state, deps, headBeforeStep, commitPushInfra)` が 1 回呼ばれる

---

### TC-021: executor が finalizeStepArtifacts の例外を state 付きで rethrow する

**Category**: unit  
**Priority**: should  
**Source**: T-04, design D4

**GIVEN** `deps.runtimeStrategy.finalizeStepArtifacts` が例外を throw する  
**WHEN** executor がその例外を受け取る  
**THEN** executor 側の `.catch()` で `state` が更新（error 記録）され、`attachStateAndRethrow` が呼ばれる

---

### TC-022: runtimeStrategy が undefined のとき executor が例外を throw しない

**Category**: unit  
**Priority**: should  
**Source**: T-04

**GIVEN** `deps.runtimeStrategy` が `undefined` の `PipelineDeps`  
**WHEN** `runAgentStep` が呼び出される  
**THEN** optional chaining（`?.`）により template 操作と commit がスキップされ、例外が throw されない

---

### TC-023: executor の既存テスト群がリファクタリング後も green

**Category**: unit  
**Priority**: must  
**Source**: T-04, AC(executor 関連テストが green)

**GIVEN** リファクタリング後の executor と既存テスト群（executor.commit.test.ts 等）  
**WHEN** `bun run test -- tests/unit/step/executor.commit.test.ts` を実行する  
**THEN** 全テストが green（local runtime の HEAD 比較・commit/push ロジックが regression しない）

---

## Category: Unit — Preflight & prereqs.ts

### TC-024: preflight.ts に config.runtime 分岐が残っていない

**Category**: unit  
**Priority**: must  
**Source**: T-05, AC(preflight.ts に config.runtime 分岐が 0 件)

**GIVEN** リファクタリング後の `src/core/preflight.ts` が存在する  
**WHEN** `grep -n "(config|cfg)\.runtime" src/core/preflight.ts` を実行する  
**THEN** コメント行を除き、一致が 0 件である

---

### TC-025: prereqs.ts に checkRuntimePrereqs が存在し managed prereq を検証する

**Category**: unit  
**Priority**: must  
**Source**: T-05, AC(checkRuntimePrereqs が prereqs.ts に存在する)

**GIVEN** `src/core/runtime/prereqs.ts` が新規作成されている  
**WHEN** managed runtime config で `checkRuntimePrereqs(cfg, env)` を呼び出す  
**THEN** API key / agents.design.agentId / environment.id の欠落を検出して `{ field, hint }` を返す

---

### TC-026: prereqs.ts の resolveRuntimeCredentials が managed で API key を返す

**Category**: unit  
**Priority**: must  
**Source**: T-05

**GIVEN** `resolveRuntimeCredentials` が `src/core/runtime/prereqs.ts` に定義されている  
**WHEN** `{ runtime: "managed" }` の config と `{ SPECRUNNER_API_KEY: "key" }` の env で呼び出す  
**THEN** `{ specRunnerApiKey: "key", specRunnerApiKeySource: "env" }` が返る

---

### TC-027: resolveRuntimeCredentials が local runtime で空オブジェクトを返す

**Category**: unit  
**Priority**: must  
**Source**: T-05

**GIVEN** `resolveRuntimeCredentials` が `src/core/runtime/prereqs.ts` に定義されている  
**WHEN** `{ runtime: "local" }` の config で呼び出す  
**THEN** `{}` が返る（specRunnerApiKey / specRunnerApiKeySource は undefined）

---

### TC-028: prereqs.ts が runtime/index.ts のバレルに含まれる

**Category**: unit  
**Priority**: should  
**Source**: T-05

**GIVEN** `src/core/runtime/index.ts` のバレルが存在する  
**WHEN** ファイルの内容を確認する  
**THEN** `checkRuntimePrereqs` と `resolveRuntimeCredentials` が re-export されている

---

### TC-029: 既存の preflight テストがリファクタリング後も green

**Category**: unit  
**Priority**: must  
**Source**: T-05, AC(preflight 関連テストが green)

**GIVEN** 既存の `tests/unit/core/preflight.test.ts` が `checkRuntimePrereqs` をテストしている  
**WHEN** `bun run test -- tests/unit/core/preflight.test.ts` を実行する  
**THEN** 全テストが green（import 先が prereqs.ts に変わっても振る舞いは不変）

---

## Category: Architecture Enforcement — B-8

### TC-030: arch-allowlist.ts から B-8 エントリが全件削除されている

**Category**: unit  
**Priority**: must  
**Source**: T-06, AC(arch-allowlist.ts の B-8 エントリが削除され enforcement suite が green)

**GIVEN** コード修正が完了した `tests/unit/architecture/arch-allowlist.ts` が存在する  
**WHEN** `grep 'invariant.*B-8' tests/unit/architecture/arch-allowlist.ts` を実行する  
**THEN** 一致が 0 件である（4 エントリすべて削除済み）

---

### TC-031: B-8 enforcement テストが allowlist なしで green になる

**Category**: unit  
**Priority**: must  
**Source**: T-06, AC(enforcement suite が green)

**GIVEN** B-8 allowlist エントリが削除され、executor.ts / preflight.ts からも runtime 分岐が除去されている  
**WHEN** `bun run test -- tests/unit/architecture/core-invariants.test.ts` を実行する  
**THEN** "grep finds no config.runtime branches outside core/runtime/ beyond the allowlist" テストが green である

---

### TC-032: T-04 regression guard に B-8 suppression-demo テストが存在しない

**Category**: unit  
**Priority**: must  
**Source**: T-06, request.md 要件 4

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の T-04 regression guard ブロックが存在する  
**WHEN** ファイルの内容を確認する  
**THEN** B-8 suppression-demo テストは存在せず、B-6 demo のみが残っている

---

### TC-033: src/core/ 全域（runtime/ 除く）で config.runtime 参照が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-08, AC(src/core/ に config.runtime 分岐が無い)

**GIVEN** リファクタリング完了後の `src/core/` ディレクトリ  
**WHEN** `grep -rEn "(config|cfg)\.runtime" src/core/` を実行し `src/core/runtime/` を除外する  
**THEN** コメント行を除き、一致が 0 件である

---

## Category: Integration — Build Verification

### TC-034: 標準 verification が全 green

**Category**: integration  
**Priority**: must  
**Source**: T-08, AC(プロジェクト標準 verification が全 green)

**GIVEN** T-01〜T-07 の実装が完了したコードベース  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行する  
**THEN** すべてのステップが 0 エラーで終了する

---

## Result

```yaml
result: completed
total: 34
automated: 34
manual: 0
must: 23
should: 11
could: 0
blocked_reasons: []
```
