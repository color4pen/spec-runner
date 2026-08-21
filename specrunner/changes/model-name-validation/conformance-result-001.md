# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### request.md 受け入れ基準 (8 項目)

| # | 受け入れ基準 | 確認方法 | 結果 |
|---|------------|---------|------|
| AC-1 | composed pipeline の実効モデル（custom reviewer snapshot・regression-gate 動的注入を含む）が収集・照合されることをテストで固定する | TC-001 in `tests/core/model-validation/collect-effective-models.test.ts` を精読 | ✅ pass |
| AC-2 | `provider === "openai"` のモデルが照合対象外であることをテストで固定する | TC-005 in `tests/core/model-validation/check-model-existence.test.ts` を精読 | ✅ pass |
| AC-3 | 一覧取得成功 + 未知 Anthropic model で job 開始前に `CONFIG_INVALID` 停止（対象箇所付き報告）となることをテストで固定する | TC-023, TC-027 in `tests/core/model-validation/preflight.test.ts` を精読 | ✅ pass |
| AC-4 | 一覧取得失敗時に warning + skip で job が継続することをテストで固定する | TC-024, TC-028 in `tests/core/model-validation/preflight.test.ts` を精読 | ✅ pass |
| AC-5 | alias 3 種が静的検証・provider 解決・live 検証の全経路を pass することをテストで固定する | TC-011〜TC-015 in `tests/config/model-registry-aliases.test.ts`、TC-006 in `check-model-existence.test.ts`、TC-026 in `preflight.test.ts` を精読 | ✅ pass |
| AC-6 | 成功・取得失敗・timeout の全経路で SDK session / subprocess が残らないことをテストで固定する | TC-018, TC-019, TC-020 in `tests/adapter/claude-code/supported-models-probe.test.ts` を精読 | ✅ pass |
| AC-7 | 既存テストは無変更で green | `verification-result.md` (Verdict: passed) を確認 | ✅ pass |
| AC-8 | `typecheck && test` が green | `verification-result.md` の Phase 結果（typecheck: passed 14.6s, test: passed 91.8s）を確認 | ✅ pass |

### spec.md Requirement 照合

**Requirement 1: 実効モデルは composed pipeline の解決後モデルから収集される**
- SHALL: `collectEffectiveModels()` が `src/core/model-validation/collect-effective-models.ts` に実装されており、`descriptor.steps` を走査して `step.kind === "agent"` のみを対象とし、`traceStepExecutionConfig()` で実効モデルを解決する。✅
- MUST NOT: ファイル上の定数列挙は行っていない（descriptor 走査方式）。✅
- Scenario「custom reviewer と regression-gate の実効モデルが収集される」: TC-001 で固定済み。✅
- Scenario「config の byRequestType override が実効モデルに反映される」: TC-002 で固定済み。✅

**Requirement 2: OpenAI provider のモデルは live 照合の対象外である**
- SHALL/MUST: `checkModelExistence()` が `refs.filter((r) => r.provider === "anthropic")` で anthropic のみを対象とし、OpenAI は除外する。✅
- Scenario「OpenAI モデルは一覧に無くても未知として扱われない」: TC-005 で固定済み。✅

**Requirement 3: 未知 Anthropic モデルは job 開始前に CONFIG_INVALID で停止する**
- SHALL: `assertEffectiveModelsExist()` が `SpecRunnerError(CONFIG_INVALID, ...)` を throw する。✅
- MUST: step 名と config path を報告するエラーメッセージを生成する。✅
- 呼び出し位置: `pipeline-run.ts` の `prepare()` で `composeReviewerDescriptor` + `validateDescriptorInputCompleteness` の後、`assertNoDuplicateLiveJob` / `bootstrapJob` の前。job state 未作成のまま停止する。✅
- Scenario「腐った Anthropic model ID で job 開始前に停止する」: TC-023, TC-027 で固定済み。✅

**Requirement 4: 一覧取得失敗時は warning を出して検証を skip し job を継続する**
- SHALL/MUST: `skipped` 結果時に `logWarn(...)` を呼び、throw せず継続する。✅
- Scenario「offline で一覧取得に失敗しても job は継続する」: TC-024 で固定済み。✅

**Requirement 5: 検証は local runtime に限定される**
- SHALL: `runtime.listSupportedModels` が未定義なら即 return（managed skip）。✅
- MUST: managed runtime は対象外。`ManagedRuntime` には `listSupportedModels` を実装しない（capability presence パターン）。✅
- Scenario「managed runtime では実在検証が行われない」: TC-022, TC-029 で固定済み。✅

**Requirement 6: alias 3 種は静的検証・provider 解決・live 検証の全経路を pass する**
- SHALL: `BUILTIN_MODEL_REGISTRY` に `"sonnet"`, `"opus"`, `"haiku"` を `{ provider: "anthropic" }` で登録。✅
- `ANTHROPIC_MODEL_ALIASES: ReadonlySet<string> = new Set(["sonnet","opus","haiku"])` を export。✅
- MUST: `checkModelExistence()` が `ANTHROPIC_MODEL_ALIASES.has(ref.model)` で alias を実在扱い（live list 照合スキップ）。✅
- 既定モデルの alias への置換なし。✅
- Scenario「alias が静的検証と provider 解決を pass する」: TC-011〜TC-015 で固定済み。✅
- Scenario「alias は live 検証で実在扱いされる」: TC-006 で固定済み。✅

**Requirement 7: SDK session / subprocess は全経路で後始末される**
- SHALL: `supported-models-probe.ts` の `try/finally` で `clearTimeout` + `abortController.abort()` + `query?.close()` を全経路実行。✅
- MUST: 成功・取得失敗・timeout のいずれでも後始末される。✅
- Scenario「取得成功後に session が閉じられる」: TC-019 で固定済み（`abort()` と `close()` の spy を確認）。✅
- Scenario「timeout 経路でも session が閉じられる」: TC-018 で固定済み。✅

### design.md 設計決定の確認（計画コンテキスト）

| 設計決定 | 実装確認 |
|---------|---------|
| D1: `collectEffectiveModels` を pure module に置く | `src/core/model-validation/collect-effective-models.ts` で実装。✅ |
| D2: port + adapter probe に分離 | `src/core/port/model-listing.ts` (port) + `src/adapter/claude-code/supported-models-probe.ts` (probe) で実装。✅ |
| D3: `try/finally` で後始末を保証 | probe 実装に `try/finally` あり。✅ |
| D4: alias 実在扱い・OpenAI 除外の pure checker | `src/core/model-validation/check-model-existence.ts` で実装。✅ |
| D5: alias 3 種を BUILTIN_MODEL_REGISTRY に登録 | `model-registry.ts` に登録済み。✅ |
| D6: `RuntimeStrategy` に optional `listSupportedModels?` を追加、local 限定 | `runtime-strategy.ts` に optional method 追加、`LocalRuntime` に実装、`ManagedRuntime` は未実装。✅ |
| D7: doctor への同一 checker 再利用 | `src/core/doctor/checks/config/model-existence.ts` で `collectEffectiveModels` + `checkModelExistence` を再利用。✅ |

### tasks.md チェックボックス状態

T-01〜T-08 のすべてが `[x]` 完了状態。計画との乖離なし。

## 検証できなかった項目

None。

## Findings 詳細

指摘なし（すべての normative 項目に適合）。
