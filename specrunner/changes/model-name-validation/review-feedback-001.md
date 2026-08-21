# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル

| ファイル | 確認内容 |
|---|---|
| `src/config/model-registry.ts` | alias 3 種の追加、`ANTHROPIC_MODEL_ALIASES` export、既存 model 不変 |
| `src/core/model-validation/collect-effective-models.ts` | pure collector 実装、6 段 config 解決チェーン利用、provider undefined 扱い |
| `src/core/model-validation/check-model-existence.ts` | pure checker 実装、OpenAI 除外、alias 実在扱い、unavailable→skipped |
| `src/core/model-validation/preflight.ts` | orchestrator、managed skip（method absence 判定）、anthropic refs 0 件の probe 省略 |
| `src/core/port/model-listing.ts` | port 型定義、adapter / core/runtime への依存なし |
| `src/adapter/claude-code/supported-models-probe.ts` | streaming input 起動、AbortController timeout、try/finally cleanup、token 非露出 |
| `src/adapter/claude-code/sdk-loader.ts` | `SdkModelInfo` / `ClaudeSdkQueryResult` 型追加 |
| `src/core/runtime/local.ts` | `listSupportedModels` 実装、lazy import パターン（provider-readiness と同型） |
| `src/core/port/runtime-strategy.ts` | `listSupportedModels?` optional 追加、`RealRuntimeStrategy` 集合に**含めない** |
| `src/core/command/pipeline-run.ts` | `assertEffectiveModelsExist` 呼び出し位置（composeReviewerDescriptor 後・bootstrapJob 前）確認 |
| `src/core/doctor/checks/config/model-existence.ts` | preflight と同一 checker 再利用、probe 未注入 → warn |
| `src/core/doctor/types.ts` | `supportedModelsProbe?` フィールド追加 |
| `src/core/doctor/checks/index.ts` | `modelExistenceCheck` が `localChecks` に登録済 |
| `src/cli/doctor.ts` | local runtime 時のみ probe を lazy import して DoctorContext に注入 |
| `tests/unit/architecture/arch-allowlist.ts` | `B6-pipeline-run-model-preflight-port-call` エントリ追加（`env: process.env` の正当性文書化）|

### テストファイル（TC 対応）

| テストファイル | カバー TC |
|---|---|
| `tests/config/model-registry-aliases.test.ts` | TC-011 〜 TC-015 |
| `tests/core/model-validation/collect-effective-models.test.ts` | TC-001 〜 TC-004 |
| `tests/core/model-validation/check-model-existence.test.ts` | TC-005 〜 TC-010 |
| `tests/adapter/claude-code/supported-models-probe.test.ts` | TC-016 〜 TC-021 |
| `tests/core/model-validation/preflight.test.ts` | TC-022 〜 TC-029 |
| `tests/core/doctor/checks/config/model-existence.test.ts` | TC-031 〜 TC-032 |

### 受け入れ基準の充足確認

| 基準 | 状態 | 根拠 TC |
|---|---|---|
| composed pipeline の実効モデルが収集・照合される | ✅ | TC-001 |
| `provider === "openai"` が照合対象外 | ✅ | TC-005 |
| 未知 Anthropic model で CONFIG_INVALID 停止 | ✅ | TC-023, TC-027 |
| 一覧取得失敗時 warning + skip + 継続 | ✅ | TC-024, TC-028 |
| alias 3 種が全経路 pass | ✅ | TC-006, TC-011〜TC-015 |
| 全経路で session / subprocess が残らない | ⚠️ | TC-018〜TC-020（詳細は Findings 詳細参照）|
| 既存テスト無変更で green | ✅ | verification-result.md（typecheck + test = pass）|
| `typecheck && test` が green | ✅ | verification-result.md |

### verification-result.md 確認

- build / typecheck / test / lint / changed-line-coverage すべて passed（exit 0）
- test suite: 91.8 秒で完走

### 構造・設計適合性

- `collectEffectiveModels` は `getStepExecutionConfig` / `traceStepExecutionConfig` の実際の解決経路を再利用しており、snapshot 由来・動的注入の custom reviewer / regression-gate を自然に網羅する
- `checkModelExistence` は pure function でテスト容易性が高い
- probe の cleanup は `try/finally` で保証（全経路: abort + close + clearTimeout）
- `listSupportedModels` を `RealRuntimeStrategy` required 集合に加えないことで managed が強制実装されない（capability presence パターン）
- `pipeline-run.ts` の呼び出し位置は composeReviewerDescriptor 後・bootstrapJob 前で仕様通り
- DSM §3 の closure ルール準拠: adapter からの dynamic import で core/credentials への forbidden static import edge を回避している（provider-readiness-probe.ts と同じパターン）
- B-6 allowlist エントリ `B6-pipeline-run-model-preflight-port-call` を正当に追加

## 検証できなかった項目

None — すべての主要ファイルと対応テストを確認した。

## Findings 詳細

### F-001: `AbortController.abort()` の明示的 spy assertion が TC-019 / TC-020 に存在しない（medium）

**ファイル**: `tests/adapter/claude-code/supported-models-probe.test.ts`  
**該当 TC**: TC-019（成功後）, TC-020（取得失敗後）

tasks.md T-05 の受け入れ基準:

> 成功・取得失敗・timeout の全経路で **`AbortController.abort()` と `Query.close()`** が呼ばれる（= session / subprocess を残さない）ことを fake SDK でテストで固定する

- TC-019（成功後）: `closeSpy` が呼ばれたことは確認済み。`abortController.abort()` は `finally` ブロックで必ず実行されるが、spy が無く明示的に assert していない。
- TC-020（取得失敗後）: 同上。
- TC-018（timeout 後）: abort signal が `supportedModels()` の reject を引き起こしているため **間接的**には検証されているが、abort spy は無い。

**実装コードは正しい** — `finally { clearTimeout(timeoutId); abortController.abort(); query?.close(); }` が全経路で実行される。問題はテストの明示的 assertion が欠けている点のみ。

**修正案**: TC-019 / TC-020 の fake SDK 内で AbortController の `abort` を spy する、または query mock が abort signal を受け取った事実を assert するケースを追加する。
