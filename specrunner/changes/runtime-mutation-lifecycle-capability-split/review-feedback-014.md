# Code Review Feedback — iteration 014

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. 対象 4 signature の unknown 除去

- `buildDeps`: `RuntimeStrategy` port から完全に除去。`PipelineDepsBuilder` として `src/core/types.ts`（domain 層）に移動。`CommandRunner.execute()` が `this.runtime.buildDeps(...)` を `as PipelineDeps` なしで代入可能であることを確認（runner.ts:222）。
- `finalizeStepArtifacts`: `StepArtifactLifecycleCapability.finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra)` として型付け。port からは削除済み。
- `commitFinalState`: `TerminalStateCapability.commitFinalState(cwd: string, slug: string, state: JobState)` として型付け。port からは削除済み。
- `commitRoundArtifacts`: `RoundGitEffectsCapability.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams)` として型付け。`RoundEgressParams` は domain-neutral DTO。

ファイル確認: `src/core/step/step-capability.ts`（StepArtifactLifecycleCapability, StepIoValidationCapability）、`src/core/pipeline/pipeline-capability.ts`（TerminalStateCapability, RoundGitEffectsCapability, RoundEgressParams）、`src/core/types.ts`（PipelineDepsBuilder）。

### 2. PipelineDeps の runtimeStrategy 除去

`src/core/types.ts` の `PipelineDeps` から `runtimeStrategy?: RuntimeStrategy` が除去されていることを確認。代替フィールド: `stepArtifact: StepArtifactLifecycleCapability`、`stepIo: StepIoValidationCapability`、`terminalState: TerminalStateCapability`、`roundGitEffects: RoundGitEffectsCapability`（全 required non-nullable）。

### 3. deps.runtimeStrategy の production 参照ゼロ確認

`src/` ツリー全体で `deps.runtimeStrategy` の参照がゼロであることを grep で確認。

### 4. Consumer-owned composite deps types

- `StepExecutionDeps` = `Omit<PipelineDeps, "terminalState" | "roundGitEffects" | "client" | "runner">` — `executor.ts` の全 public メソッドが使用
- `ParallelReviewRoundDeps` = `Omit<PipelineDeps, "terminalState" | "client" | "runner">` — `ParallelReviewRound.run()` が使用
- `PipelineOrchestrationDeps` = `Omit<PipelineDeps, "client" | "runner">` — `Pipeline.run()` が使用

各シグネチャが対応型を使っていることを確認（executor.ts:131, 177, 205, 227, 256, 592; parallel-review-round.ts:91; pipeline.ts:138）。

### 5. 新規 as unknown as RuntimeStrategy の不在

`src/` ツリーで `as unknown as RuntimeStrategy` をスキャン → ゼロ件。`tests/` では `pipeline-sole-committer-e2e.test.ts` に既存 2 件のみ（test-cases.md TC-038 の期待値と一致）。

### 6. Capability derive helpers

`deriveStepArtifactLifecycleCapability`, `deriveStepIoValidationCapability`（step-capability.ts）、`deriveTerminalStateCapability`, `deriveRoundGitEffectsCapability`（pipeline-capability.ts）が capability interface 定義と同一ファイルに定義（D5 準拠）。

### 7. No-op singletons

`src/core/step/noop-capabilities.ts` に `noopStepArtifact`, `noopStepIo`, `noopTerminalState`, `noopRoundGitEffects` が定義。test fake の構築に使用可能。

### 8. LocalRuntime.buildDeps

`buildDeps()` が 4 つの R2b capability フィールドを正しく注入していることを確認（local.ts:629–632）:
```ts
stepArtifact: this.buildStepArtifactCapability(capturedConfig, request, slug, workspace),
stepIo: deriveStepIoValidationCapability(this),
terminalState: deriveTerminalStateCapability(this),
roundGitEffects: deriveRoundGitEffectsCapability(this),
```

`buildStepArtifactCapability` は capability 構築時点で `slugOpts` を closure に capture（mutable instance state への依存を排除）。

### 9. ManagedRuntime

`managed.ts` が R2b derive helpers を import し `buildDeps` に注入していることを確認（managed.ts:37–38）。

### 10. Contract tests

- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`: derive helper の compile-time 型証明 + runtime delegation 確認
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`: managed no-op semantics の契約固定
- `tests/unit/step/executor-lifecycle-ordering.test.ts`: TC-T15-01 (finalize が typed primitives を受ける)、TC-T15-02 (roundOwnsGitEffects=true で finalize がスキップされる)、TC-T15-06 (prepareStepArtifacts が runner.run より前に呼ばれる) を確認。

### 11. Architecture 文書

`architecture/components.md` の `RuntimeStrategy` セクションが R2b 対応の記述を含むことを確認:
- `RuntimeStrategy` は composition root 向け facade として記述済み
- R2b capability が `PipelineDeps` 個別フィールドとして記述済み
- `PipelineDeps.runtimeStrategy` 廃止が明示

### 12. Verification ステータス

`verification-result.md` より:
- build: passed (0.6s)
- typecheck: passed (15.7s)
- test: passed (99.4s)
- lint: passed (14.8s)
- changed-line-coverage: passed (122.1s)

### 13. 残存 unknown の確認

`src/core/port/runtime-strategy.ts` 内の `unknown` token: 4 件（`CleanupHandle` の branded type 定義 + `query(): AsyncGenerator<unknown>` + 型定義コメント）。`query()` の `unknown` は Non-goal として request.md で明示済み。目標の 4 signature の `unknown` はすべて除去済み。

---

## 検証できなかった項目

- TC-049 の実行時確認（compile-time 証明のみ — TypeScript checker の確認はできないが、typecheck passed で代替）
- ManagedRuntime の TC-028（`buildDeps` に capability フィールドが含まれること）: テストファイルを確認したが実際のインスタンス化部分（mock HTTP clients 必要）の実行は未確認。ただし typecheck passed で型整合性は保証済み。
- Command lifecycle ordering の TC-039〜TC-041 の実行確認: runner.test.ts で扱われているが個別実行は未実施。

---

## Findings 詳細

### F-001: `terminalState` への optional chaining が inconsistent（`pipeline.ts:625`）

`PipelineOrchestrationDeps.terminalState` は required non-nullable フィールド（`PipelineDeps.terminalState: TerminalStateCapability`、optional modifier なし）。しかし `pipeline.ts:625` では:

```ts
await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);
```

と `?.` (optional chaining) を使用している。一方、同じ `terminalState` を使う `pipeline.ts:400` では:

```ts
await deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);
```

と `?.` なしで呼び出している。

**影響**: runtime バグではない（required フィールドへの `?.` は単に safety check をスキップするだけで正常動作）。しかし D6 の設計原則「capability absence は注入値 `Capability | undefined` で表現する — optional chaining ではない」に反する inconsistency であり、将来の読者が `terminalState` が optional であると誤認するリスクがある。また、test assertions での呼び出し確認が `?.` 有りか無しかで変わる場合もある。

**修正**: 625 行目の `?.` を除去して `deps.terminalState.commitFinalState(...)` とする。
