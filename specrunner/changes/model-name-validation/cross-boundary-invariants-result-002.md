# Cross-Boundary-Invariants Review — model-name-validation (Iteration 2)

## Summary

Iteration 2 は operator 裁定済みの 3 件（F-01 / F-02 / F-03）が code-fixer によって修正されたかを確認する round。
「前周以降の code-fixer 変更 file: 変更なし」と記録されており、3 件いずれも未修正のまま残っている。

---

## 再指摘プロトコル適用

各 finding は対象ファイルを最新状態で Read してから再指摘した（プロトコル §1 準拠）。

---

## Findings

### F-01 (再指摘): DoctorContext に rawConfig が追加されていない — doctor check は依然 MINIMAL_CONFIG を使用

**Severity: medium | Resolution: fixable**

**Operator 裁定**: 選択肢 2 を採用 — `DoctorContext に rawConfig を追加し、doctor check が実効 config（deep-merge 後）と mergeModelRegistry(config) で collectEffectiveModels を呼ぶ`

**現在の実装状態（ファイルを再読し確認済み）:**

- `src/core/doctor/types.ts` の `DoctorContext` インターフェースに `rawConfig?: SpecRunnerConfig` フィールドが追加されていない（確認: line 91-165）
- `src/core/doctor/checks/config/model-existence.ts` line 23/47 は依然 `MINIMAL_CONFIG`（空の設定）と `BUILTIN_MODEL_REGISTRY` のみを使用している
- `src/cli/doctor.ts` は `rawConfig` を `loadConfigWithOverlay` で取得している（line 116-122）が、`DoctorContext` のフィールドとして注入していない（line 203-224）

**修正が不十分な理由:**

operator の裁定は「DoctorContext に rawConfig を追加し、doctor check が実効 config で collectEffectiveModels を呼ぶ」を選択した。しかし:

1. `DoctorContext` に `rawConfig?: SpecRunnerConfig` が存在しない → doctor check から実際のユーザー設定にアクセスできない
2. `model-existence.ts` が `MINIMAL_CONFIG` を使い続けている → ユーザーが `steps.design.model = "claude-defunct-99"` を設定していても doctor は通過し、run 時に `CONFIG_INVALID` で停止するという false assurance が継続している
3. `doctor.ts` の `ctx` 組み立てに `rawConfig` フィールドが含まれていない

**必要な修正:**

```typescript
// src/core/doctor/types.ts の DoctorContext に追加:
rawConfig?: import("../../config/schema.js").SpecRunnerConfig;

// src/core/doctor/checks/config/model-existence.ts の check() を更新:
const effectiveConfig = ctx.rawConfig ?? MINIMAL_CONFIG;
const merged = mergeModelRegistry(effectiveConfig);
const refs = collectEffectiveModels(STANDARD_DESCRIPTOR, effectiveConfig, undefined, merged);

// src/cli/doctor.ts の ctx 組み立てに追加:
rawConfig: rawConfig ?? undefined,
```

---

### F-02 (再指摘): 同一解決チェーンの二重呼び出しが未修正

**Severity: low | Resolution: fixable**

**Operator 裁定**: 「指摘どおり修正: 同一解決チェーンの二重呼び出しを一本化する」

**現在の実装状態（ファイルを再読し確認済み）:**

`src/core/model-validation/collect-effective-models.ts` line 82-87:

```typescript
const model = getStepExecutionConfig(config, stepName, stepDefaults, requestType).model;
const traced = traceStepExecutionConfig(config, stepName, stepDefaults, requestType);
const configPath: string | null = traced.fields.model.source.path ?? null;
```

**修正が不十分な理由:**

`getStepExecutionConfig` と `traceStepExecutionConfig` は同一の 6-level 解決ロジックをそれぞれ独立して実装している。operator の指示（「一本化する」）は実施されていない。

`traceStepExecutionConfig` は `fields.model.value` に実効値を含む（`step-config.ts:156-165` にて `traceField()` が value を返す）ため、両呼び出しを一本化できる:

```typescript
const traced = traceStepExecutionConfig(config, stepName, stepDefaults, requestType);
const model = traced.fields.model.value as string;
const configPath: string | null = traced.fields.model.source.path ?? null;
```

将来 `getStepExecutionConfig` が変更されても `traceStepExecutionConfig` を更新しなかった場合、エラーメッセージの model 名と configPath が乖離するリスクが継続している。

---

### F-03 (再指摘): ResumeCommand.prepare() での model existence 検証が未追加

**Severity: low | Resolution: fixable**

**Operator 裁定**: 「選択肢 2 を採用: ResumeCommand の prepare() にも assertEffectiveModelsExist を追加する。既存の assertProviderReadiness と対称にし、resume 時の model 失効も preflight で検出する。取得失敗時の warn+skip（fail-open）は起動時と同一とする。」

**現在の実装状態（ファイルを再読し確認済み）:**

`src/core/command/resume.ts` の `prepare()` メソッド（line 141-572）に `assertEffectiveModelsExist` の呼び出しが存在しない。

`assertProviderReadiness` は `CommandRunner.execute()`（base class、line 109-124）で呼ばれるため run/resume 両方で実行される。一方 `assertEffectiveModelsExist` は `PipelineRunCommand.prepare()`（line 142-150）にのみ存在し、resume 時は呼ばれない。

**修正が不十分な理由:**

operator は「assertProviderReadiness と対称にする」を選択した。この決定に従い `ResumeCommand.prepare()` に `assertEffectiveModelsExist` を追加する必要がある。現在この呼び出しが存在しないため：

- resume 時に model が失効していても preflight で検出されない
- pipeline の agent step 実行時に SDK レベルで失敗し mid-run halt になる
- `assertProviderReadiness`（resume でも実行される）との非対称が継続している

**必要な修正（追加箇所: resume.ts の request 解析後、状態遷移前）:**

composed descriptor は resume でも `state.reviewers` から再構築できる。ただし resume 時は requestType のみ `request.type` から取得し、descriptor は `composeReviewerDescriptor(getPipelineDescriptor(pipelineId), state.reviewers ?? [])` で再構成して渡す。

---

## 確認した invariant（問題なし、全量列挙）

| Invariant | 確認結果 |
|-----------|----------|
| `BUILTIN_MODEL_REGISTRY` 追加による既存テスト破壊 | alias 3 件追加済み。前回確認と変化なし |
| alias 追加 → `resolveProvider` が "anthropic" を返す | `model-registry.ts` 確認。変化なし |
| `assertEffectiveModelsExist` が `bootstrapJob` 前に throw | `pipeline-run.ts` line 142-150 → line 155 の順序確認済み |
| `RealRuntimeStrategy` に `listSupportedModels` が required 追加されない | `runtime-strategy.ts` line 613 で optional のまま。確認済み |
| B-6: `process.env` が stripSecrets なしで subprocess に到達しない | `supported-models-probe.ts` で `stripSecrets(env)` 経由。変化なし |
| doctor check が probe 未注入時 warn を返す | `model-existence.ts` line 33-39 で正しく対応済み |
| `ANTHROPIC_MODEL_ALIASES` と registry 内 alias の一致 | `model-registry.ts` で同一ファイルに同居。変化なし |
| `traceStepExecutionConfig` の `source.path` vs `source.configPath` 混同 | `collect-effective-models.ts` line 87 で `.source.path` を使用。変化なし |
| probe の finally で abort + close + clearTimeout が全経路実行 | `supported-models-probe.ts` line 162-166 で確認済み |
| ManagedRuntime に `listSupportedModels` が実装されない | `preflight.test.ts` TC-029 で固定済み、実装変化なし |

---

## Evidence

- **checked**: 13 items（再指摘 3 件 + invariant 問題なし 10 件）
- **skipped**: 0
- **unverified**: 0
