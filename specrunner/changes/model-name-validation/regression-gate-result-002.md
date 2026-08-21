# Regression Gate Result — Iteration 2

**Change**: model-name-validation
**Iteration**: 2
**Date**: 2026-08-21

## Verification Summary

All 11 ledger findings were verified against the current code. No regressions detected.

---

## Finding-by-Finding Verification

### [1] ff6f991b — ClaudeAgentSdk 型が supportedModels()/close() を公開していない

**Status: FIXED**

`src/adapter/claude-code/sdk-loader.ts` に `ClaudeSdkQueryResult` インターフェースが追加され、
`supportedModels(): Promise<SdkModelInfo[]>` と `close(): void` の両メソッドが定義されている（lines 20–23）。
`supported-models-probe.ts` は `sdk.query(...) as ClaudeSdkQueryResult` のキャストパターンを採用しており、
tasks.md T-05 にもキャスト方針が明記されている。

---

### [2] df4f7b43 — T-05: AsyncIterable 構成パターンが未定義

**Status: FIXED**

tasks.md T-05（lines 112–128）に `makePromptIterable(signal)` の concrete パターンが追記されている。
`AbortController.signal` の abort イベントで `Promise` を resolve して generator を `finally { return; }` で
正常終了させるパターンが示されている。

---

### [3] a9a38a2b — T-02: EffectiveModelRef.configPath と TracedStepConfigSource.configPath の命名混同

**Status: FIXED**

tasks.md T-02（lines 33–37）に **`configPath` の意味** ブロックが追記され、dotted key パス（`source.path`）と
絶対ファイルパス（`source.configPath`）の区別が明示されている。
`src/core/model-validation/collect-effective-models.ts` の `EffectiveModelRef` JSDoc（lines 27–33）にも
「NOTE: Do NOT confuse with TracedStepConfigSource.configPath」の注記が追加されている。

---

### [4] 84f69608 — TC-030 カテゴリが 'unit' だが実体は typecheck gate

**Status: FIXED**

`test-cases.md` の TC-030 カテゴリは `gate` に変更済みで GWT は削除されている（lines 336–342）。
Summary の Automated カウントも 31 に修正されている（line 54）。

---

### [5] 2e4fd659 — spec.md Scenario の custom reviewer 実効モデル記述が snapshot.model フォールバックを省略

**Status: FIXED**

`spec.md` の該当 Scenario THEN 節（lines 15–17）に `snapshot.model ?? DEFAULT_REVIEW_MODEL`
（snapshot.model 未設定時は `DEFAULT_REVIEW_MODEL`（`claude-sonnet-5`）にフォールバック）が明記されている。

---

### [6] 6944f1a4 — SdkModelInfo 型の定義が spec 内に存在しない

**Status: FIXED**

tasks.md T-05（lines 97–105）に `SdkModelInfo` の定義・由来（SDK の `ModelInfo` の minimal local alias）が
明記されている。`sdk-loader.ts`（lines 9–11）でも同定義が実装されており一致する。

---

### [7] 3152ea65 — TC-019/TC-020: AbortController.abort() の明示的 assert が欠落

**Status: FIXED**

`tests/adapter/claude-code/supported-models-probe.test.ts` の TC-019（lines 168–193）および TC-020
（lines 199–224）に `abortSpy = vi.spyOn(AbortController.prototype, "abort")` と
`expect(abortSpy).toHaveBeenCalled()` が追加されており、abort() の明示的検証が固定されている。

---

### [8] 7a4731aa — 同一解決チェーンの二重呼び出し（model/configPath 乖離リスク）

**Status: FIXED**

`src/core/model-validation/collect-effective-models.ts`（lines 83–86）は `traceStepExecutionConfig()` の
単一呼び出しのみを使用し、`traced.fields.model.value` から model を取得している。
`getStepExecutionConfig()` の独立呼び出しは存在しない。

---

### [9] 40a077c7 — DoctorContext に rawConfig が追加されていない

**Status: FIXED**

`src/core/doctor/types.ts`（lines 163–164）に `rawConfig?: SpecRunnerConfig` が追加されている。
`src/cli/doctor.ts`（line 223）が `rawConfig: rawConfig ?? undefined` で注入しており、
`src/core/doctor/checks/config/model-existence.ts`（line 44）が `ctx.rawConfig ?? MINIMAL_CONFIG` で参照している。

---

### [10] c67d10d8 — 同一解決チェーンの二重呼び出しが未修正（finding [8] の別 ref）

**Status: FIXED**

finding [8] と同一ファイル・同一修正で解消済み（`traceStepExecutionConfig()` 単一呼び出し）。

---

### [11] 244d375c — ResumeCommand.prepare() に assertEffectiveModelsExist が追加されていない

**Status: FIXED**

`src/core/command/resume.ts`（lines 371–394）の `prepare()` 内に `assertEffectiveModelsExist({...})` の
呼び出しが追加されており、`composeReviewerDescriptor` を使って state にスナップショットされた
custom reviewer を含む composed descriptor でモデル検証を行う。
`PipelineRunCommand.prepare()` と対称なガードが確立されている。

---

## Verdict

No regressions. All 11 findings have been resolved in iteration 2.
