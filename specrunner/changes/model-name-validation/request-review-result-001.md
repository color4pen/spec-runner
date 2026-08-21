# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### SDK 型定義の確認

**`sdk.d.ts:2098` — `supportedModels(): Promise<ModelInfo[]>` の存在**
`Query` interface（`AsyncGenerator<SDKMessage, void>` を extends）のメソッドとして `supportedModels(): Promise<ModelInfo[]>` が line 2098 に存在することを確認した。また同メソッドはコントロールリクエストとして "streaming input mode" でのみ使用可能な旨が line 2025-2034 の comment に明記されている。

**`sdk.d.ts:1062-1096` — `ModelInfo` 型**
`ModelInfo` 型は line 1061-1097 に定義されており（コメントは 1061 行目から、closing brace は 1097 行目）、`value: string`, `displayName: string`, `description: string`, `supportsEffort?`, `supportedEffortLevels?`, `supportsAdaptiveThinking?`, `supportsFastMode?`, `supportsAutoMode?` を含む。`value` が API 呼び出し時のモデル識別子であることも確認した。

**`sdk.d.ts:56` — alias 受理の引用範囲**
Line 56 のコメントは `AgentDefinition.model`（sub-agent 定義用フィールド）の説明であり、「Model alias (e.g. 'sonnet', 'opus', 'haiku') or full model ID (e.g. 'claude-opus-4-5'). If omitted or 'inherit', uses the main model」と記載されている。一方、メインセッションの `query()` オプション `model` フィールド（line 1452-1454）のコメントは「Claude model to use. Defaults to the CLI default model. Examples: 'claude-sonnet-4-6', 'claude-opus-4-7'」とのみ記載されており、alias への言及がない。なお、この差異は requirement #5 の実装に直接影響しない（live 検証では alias を "実在扱い" としてスキップする設計のため）。

### 既存コードの確認

**`src/config/model-registry.ts`**
`BUILTIN_MODEL_REGISTRY` に `provider: "anthropic"` のモデル（claude-opus-4-8, claude-sonnet-5 等）と `provider: "openai"` のモデル（gpt-5.5 等）が混在していることを確認した。alias（`sonnet`, `opus`, `haiku`）は存在しない。

**`src/config/schema/validation.ts`**
`validateConfig()` → `runSemanticChecks()` → `checkModelRegistry()` のフローで、全 step の model 名が `BUILTIN_MODEL_REGISTRY` に存在するか照合済みであることを確認した。alias が現状で config に指定されると `CONFIG_INVALID` で停止する。

**`src/config/step-config.ts:62`**
`getStepExecutionConfig()` が 6-level resolution chain で実効モデルを解決することを確認した。`step.agent.model`（stepDef 相当）が level 5（最後の fallback）として機能する。

**custom reviewer のモデル解決**
`src/core/step/custom-reviewer.ts` の `createCustomReviewerStep(snapshot)` で `agentDef.model = snapshot.model ?? DEFAULT_REVIEW_MODEL`（"claude-sonnet-5"）に設定されることを確認した。snapshot.model は `ReviewerSnapshot` の `model?: string` フィールドから来る。

**regression-gate のモデル解決**
`src/core/step/regression-gate.ts` の `createRegressionGateStep()` で `agentDef.model = DEFAULT_REVIEW_MODEL`（"claude-sonnet-5"）が hard-code されることを確認した。ファイル上の定数列挙ではこの動的注入を網羅できない点も確認。

**pipeline descriptor の step 列挙**
`PipelineDescriptor.steps` は `readonly (readonly [string, Step])[]` であり、`composeReviewerDescriptor()` で custom reviewer steps と regression-gate step が挿入される。これを走査することで composed pipeline 全 AgentStep のモデルを収集できる構造になっていることを確認した。

**`provider-readiness-probe.ts` の参考実装**
`createClaudeProviderReadinessProbe()` が SDK query → メッセージ消費 → 早期 abort → `clearTimeout` の全経路クリーンアップパターンを実装していることを確認した。本 request の session cleanup 要件（requirement 6）はこのパターンを踏襲することで実現可能。

**doctor checks 構造**
`src/core/doctor/checks/index.ts` の `localChecks` に新規チェックを追加できる拡張点が存在することを確認した。`DoctorCheck` interface が既存の seam になっている。

## 検証できなかった項目

**メインセッション `Options.model` での alias 受理**
SDK type 宣言上、`Options.model`（主 query 用）が alias を受理するか否かは明示されていない（コメントに alias への言及なし）。Claude CLI が alias を `--model` フラグで受理するかどうかを実動作確認する手段がないため unverified とする。なお requirement #5 は「live 検証では alias は実在扱いとする（解決は SDK 側の責務）」としており、live 検証の正確性への影響はない。実行時に alias が拒否された場合は agent 呼び出し失敗として顕在化するが、これは既存動作の範囲でありスコープ外の問題。

## Findings 詳細

低重要度の観察として、`sdk.d.ts:56` の引用が `AgentDefinition.model`（sub-agent フィールド）を指している点と、`ModelInfo` の行番号範囲（記載: 1062-1096, 実際: 1061-1097）に軽微なずれがある。いずれも実装の正確性に影響しない観察であり、blocking finding ではない。

要件・受け入れ基準・設計判断はいずれも一貫しており、実装可能な具体性を持っている。
