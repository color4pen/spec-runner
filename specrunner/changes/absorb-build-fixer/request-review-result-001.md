# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コード断言の照合

以下の断言をすべて実コードで確認した。

| 断言 | 確認結果 |
|------|----------|
| `src/core/pipeline/types.ts:290-293` — `VERIFICATION failed → BUILD_FIXER`、`BUILD_FIXER success → VERIFICATION` | ✅ 正確。行 290/292/293 で確認 |
| `src/core/pipeline/types.ts:195-199` — `VERIFICATION_RETRIES_EXHAUSTED`（ループ上限） | ✅ 正確。`LOOP_ERROR_CODES[STEP_NAMES.VERIFICATION]` が該当行に存在 |
| chore 経路（FAST_TRANSITIONS）`:347-350` も同型 | ✅ 正確。行 347-350 で同一パターンを確認 |
| `src/core/step/build-fixer.ts` — 独立 step 定義 | ✅ `BuildFixerStep` として存在、`BUILD_FIXER_SYSTEM_PROMPT` に「機械的修正のみ」制約あり |
| `src/prompts/build-fixer-system.ts` — 機械的修正への制約 | ✅ "仕様変更・設計判断は禁止" など制約が明記されている |
| `src/adapter/claude-code/agent-runner.ts` の resume option | ✅ 行 560: `ctx.session.resumeSessionId ? { resume: ctx.session.resumeSessionId } : {}` |
| `src/cli/command-registry.ts` の `--from` 候補に `build-fixer` が含まれる | ✅ 行 209: `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")` で動的列挙 |

### 追加探索

**session 継続の仕組みを追跡した**:

- `src/core/step/step-context-builder.ts:96` — `resumeSessionId` は `FIXER_STEP_NAMES.has(step.name)` が true の場合のみ解決される
- `src/core/step/fixer-helpers.ts:15` — `FIXER_STEP_NAMES = { spec-fixer, build-fixer, code-fixer }` であり、`implementer` は含まれていない
- `src/adapter/claude-code/agent-runner.ts:765-774` — resume 失敗時の fresh session fallback は既存インフラに実装済み

**loopFixerPairs の利用箇所を追跡した**:

- `src/core/pipeline/registry.ts:66` — `[STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER`
- `src/core/pipeline/pipeline.ts:757` — 枯渇時の `resumePoint.step` が `loopFixerPairs[exhaustedLoopName]` から決定される
- `src/core/pipeline/pipeline.ts:252` — `isFixer = Object.values(this.loopFixerPairs).includes(currentStep)` でフィクサー判定
- 変更後 verification のペアフィクサーが未定義のまま、または IMPLEMENTER に変更する場合の影響が設計に必要

**影響範囲を広く確認した**:

- `src/core/pipeline/reverification.ts:21` — `IMPL_CODE_MUTATOR_STEPS` に `BUILD_FIXER` が含まれる（削除時は機械的に除去するだけで reverification の意味論は変わらない）
- `src/core/step/fixer-helpers.ts` — `FIXER_STEP_NAMES`・`buildContinuationMessage` に BUILD_FIXER 専用ロジックあり
- `src/core/doctor/checks/agents/{agents-registered,definition-drift,agent-provider-alive}.ts` — 管理対象エージェントとして BUILD_FIXER が列挙
- `src/cli/{managed,config-effective}.ts` — BuildFixerStep をインポート
- `src/kernel/agent-definition.ts` — `AgentStepName` union と `AGENT_STEP_NAMES` array の compile-time sync guard が存在（両方同期更新が必要）

### 後方互換性

- `StepName = string`（passthrough 型）なので既存 state の `"build-fixer"` エントリは読み込み時にエラーにならない
- `isStandardStepName` は whitelist チェックだが read/fold パスでは使用されず、backward compat は成立する

## 検証できなかった項目

- `managed runtime` での session 継続挙動（request の scope 外かつ実環境なし）
- job journal の fold 動作（既存 build-fixer 履歴に対する実際の resume）

## Findings 詳細

### F1: implementer session 継続の実装機構が未定義

request 要件 2「再入は継続 session」は意図として明確だが、仕組みが未指定。

現在 `resumeSessionId` が渡されるのは `FIXER_STEP_NAMES`（`spec-fixer / build-fixer / code-fixer`）に登録されたステップのみ（`step-context-builder.ts:96`）。`implementer` は未登録のため、変更後もそのままでは verification failure 経路で session 継続が機能しない。

設計が選べる実装経路:

- **A**: `FIXER_STEP_NAMES` に `implementer` を追加（conformance → implementer 再入も session 継続になる。副作用はあるが有害ではない）
- **B**: `buildStepContext` に verification failure 経路専用の条件分岐を追加（`previousVerificationFailed` フラグ等を state から判定）

どちらを採るかは design step で決定できる。request の acceptance criteria「遷移表・build-fixer 関連の既存テストの更新対象を design で全列挙」はこの enumeration を design に委ねているため、blocking ではない。

### F2: loopFixerPairs の変更先が未定

`registry.ts:66` の `[STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER` は pipeline.ts 内の複数箇所（exhaustion resume point, isFixer 判定, 予算トラッキング, episode reset）に影響する。

build-fixer 削除後の正しい値:
- `[STEP_NAMES.VERIFICATION]: STEP_NAMES.IMPLEMENTER` — exhaustion 時の resumePoint.step が implementer になり、budget tracking も implementer を対象に行われる
- エントリを削除した場合、exhaustion resume が `verification` 自身にフォールバックし、budget reset がスキップされる可能性がある

これも design で決定可能。request の acceptance criteria「verification ループ上限が再入方式でも機能することをテストで固定する」がこの変更を前提に含むため、design が正しく枚挙すれば問題は解消する。
