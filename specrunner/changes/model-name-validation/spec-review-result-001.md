# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

以下のファイルを精読し、各要件・設計決定・テストケースを確認した。

### 読んだ仕様ファイル
- `request.md` — 要件・受け入れ基準・architect 設計判断
- `design.md` — 7 つの設計決定（D1–D7）の根拠・trade-off
- `tasks.md` — 8 タスク（T-01〜T-08）の実装指示・受け入れ基準
- `spec.md` — 6 つの Requirement と 8 つの Scenario
- `test-cases.md` — 33 テストケース（TC-001〜TC-033）

### 確認したコード
- `src/config/model-registry.ts` — 現状の `BUILTIN_MODEL_REGISTRY`・`resolveProvider`（alias 未登録を確認）
- `src/config/step-config.ts` — `getStepExecutionConfig` / `traceStepExecutionConfig` の型・動作
- `src/config/schema/validation.ts` — `checkModelRegistry` の照合ロジック
- `src/core/port/runtime-strategy.ts` — `RuntimeStrategy` / `RealRuntimeStrategy` の optional method パターン
- `src/adapter/claude-code/provider-readiness-probe.ts` — probe 手本のコード・型キャストパターン
- `src/adapter/claude-code/sdk-loader.ts` — `ClaudeAgentSdk` / `ClaudeSdkQuery` の型定義
- `src/core/command/pipeline-run.ts` — `prepare()` の実装順序（compose → validate → assertNoDuplicate → bootstrap）
- `src/core/step/custom-reviewer.ts` — `agent.model = snapshot.model ?? DEFAULT_REVIEW_MODEL`
- `src/core/step/regression-gate.ts` — `DEFAULT_REVIEW_MODEL = "claude-sonnet-5"`
- `src/core/doctor/types.ts` — 現状の `DoctorContext` インターフェース（`supportedModelsProbe` フィールドなし）
- `src/core/doctor/checks/index.ts` — 既存 local/managed/common checks の構造
- `src/core/pipeline/types.ts` — `PipelineDescriptor.steps` 型 / `AgentStep.kind`
- `src/core/pipeline/compose-reviewers.ts` — 合成後 descriptor の構造
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `Query`・`supportedModels()`・`close()`・`SDKUserMessage` の型定義
- `tests/config/model-registry.test.ts` — 既存テストの alias 追加後への影響確認
- `tests/core/provider-readiness-gate.test.ts` — probe テストの注入パターン確認

### 確認した主な整合性

| チェック項目 | 結果 |
|---|---|
| 受け入れ基準 8 項目がすべて TC に対応するか | ✓（TC-001〜TC-033 がカバー） |
| spec.md の各 Requirement が design.md の Decision に対応するか | ✓（D1–D7 で全 Requirement をカバー） |
| `prepare()` 内の配置順序（compose後・bootstrap前）が現コードと整合するか | ✓ |
| alias 追加後の既存テスト（`toEqual(BUILTIN_MODEL_REGISTRY)`）が壊れないか | ✓（design.md Risks で分析済み） |
| `provider === "openai"` の除外が test-cases で固定されるか | ✓（TC-005） |
| session cleanup が全経路で固定されるか | ✓（TC-018/019/020） |
| `RealRuntimeStrategy` に `listSupportedModels` を含めないことが明示されるか | ✓（D6） |

---

## 検証できなかった項目

1. **TC-033（gate）の実際のビルド・テスト成功**: 実装前のため `bun run typecheck && bun run test` を実行できない。設計上の問題は見つかっていないが、実行確認は実装フェーズで行う。

2. **streaming input mode の実際の動作**: `Query.supportedModels()` が control request として streaming mode 起動時に即座に利用可能かどうかを実際の SDK で確認できない。設計は sdk.d.ts:2026-2030 のコメントを根拠にしているが、実装時の動作確認が必要。

---

## Findings 詳細

### Finding 1: `ClaudeAgentSdk` 型が `supportedModels()` / `close()` を公開していない（HIGH / fixable）

**概要**: T-05 で作成する probe は `sdk.query()` の戻り値として `Query.supportedModels()` および `Query.close()` を呼ぶ必要がある。しかし現在の `ClaudeAgentSdk`（`src/adapter/claude-code/sdk-loader.ts`）では `ClaudeSdkQuery` の戻り値型が `AsyncGenerator<unknown, void>` であり、これらのメソッドを型として公開していない。

**根拠**: 
- `sdk.d.ts:2098` — `supportedModels(): Promise<ModelInfo[]>` は `Query` インターフェースに定義されているが、`sdk-loader.ts` の `ClaudeSdkQuery` 戻り値型は `AsyncGenerator<unknown, void>`
- `sdk.d.ts:2230` — `close(): void` も同様
- tasks.md の T-01〜T-08 に `sdk-loader.ts` の型更新について言及がない

**影響**: 実装者が次のいずれかを選択する必要がある：
- Option A: `sdk-loader.ts` の `ClaudeSdkQuery` 戻り値型を拡張して `supportedModels()` / `close()` を公開する
- Option B: probe 内で型キャスト（`as unknown as {...}`）を使用する（`provider-readiness-probe.ts` が `messages as AsyncGenerator<...>` とキャストしている既存パターン）

tasks.md でこの選択が明示されていないため、実装者の判断に委ねられる。既存の手本（provider-readiness-probe.ts）はキャストを使うが、型安全性の観点からは Option A が望ましい。

### Finding 2: streaming AsyncIterable の構成方法が未定義（MEDIUM / fixable）

**概要**: T-05 では「`prompt` を `AsyncIterable` として渡す — control request `supportedModels()` は streaming mode でのみ利用可能」と述べるが、この `AsyncIterable<SDKUserMessage>` の具体的な構成方法（何を yield すべきか、finally でどう終了させるか）が tasks.md / design.md に記載されていない。

**根拠**:
- `sdk.d.ts:3489` — `SDKUserMessage = { type: 'user', message: MessageParam, parent_tool_use_id: string | null, ... }` という構造体が必要
- `provider-readiness-probe.ts` は `prompt: "ok"` という string 形式を使うため、streaming mode の手本を提供しない
- design.md D3 は「streaming input の AsyncIterable は完了/return させる」と述べるが、実装パターンは不明

**影響**: probe の実装者は自分で「セッションを維持しつつ finally で終了可能な AsyncIterable」を設計する必要がある。`AbortController.signal` との統合方法も自明でない。実装方針は tasks.md に補足が必要。

### Finding 3: `EffectiveModelRef.configPath` の命名と `TracedStepConfigSource.configPath` の混同リスク（MEDIUM / fixable）

**概要**: D1 は `EffectiveModelRef.configPath` を「設定キーの dotted path（例: `steps.code-review.model`）」と定義し、`traceStepExecutionConfig(...).fields.model.source.path` から取得すると明記する。しかし `TracedStepConfigSource` には同名の `configPath?: string` フィールドが存在し、こちらは「設定ファイルの絶対パス」を意味する（異なるセマンティクス）。

**根拠**:
```typescript
// TracedStepConfigSource (step-config.ts)
export interface TracedStepConfigSource {
  layer: TraceSourceLayer;
  level: TraceSourceLevel;
  path: string | null;       // ← dotted key path（D1 が使用）
  configPath?: string;       // ← 設定ファイルの絶対パス（別物）
}
```
D1 は明示的に `.source.path` を使うと述べているが、実装者が `.source.configPath` を誤用するリスクがある。エラーメッセージの報告値（step 名 + config path）に誤った値が入るとデバッグ困難になる。

**改善案**: T-02 の `EffectiveModelRef.configPath` フィールド定義のコメントに「`TracedStepConfigSource.path`（ドット区切りキー）を格納する。`TracedStepConfigSource.configPath`（設定ファイル絶対パス）ではない」と明記する。

### Finding 4: TC-030 のカテゴリが "unit" だが実体は typecheck 確認（LOW / fixable）

**概要**: TC-030「port ファイルが adapter / core/runtime に依存しない」のカテゴリが "unit" になっているが、`WHEN` で `bun run typecheck` の実行を確認する。これは unit テストでなく gate（ビルド検証フェーズ）に属する。

**根拠**: test-cases.md フォーマット定義:
> gate TC: GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

TC-030 は GWT を記述しており（GIVEN/WHEN/THEN がある）、内容的には typecheck gate に相当する。カテゴリを "gate" に変更し、GWT を削除して「`bun run typecheck`」を本文に記録する形式が正しい。

**影響**: テストカウント調整が必要（automated: 32 → 31、gate 増加）。ただし T-04 は純粋な型定義ファイルの追加であり DSM 違反は起きにくいため、実害は小さい。

### Finding 5: spec.md シナリオの custom reviewer 実効モデル記述が不完全（LOW / fixable）

**概要**: spec.md「Scenario: custom reviewer と regression-gate の実効モデルが収集される」の THEN 節に「custom reviewer の実効モデルは snapshot.model」とあるが、コード上は `snapshot.model ?? DEFAULT_REVIEW_MODEL`（`claude-sonnet-5`）である。`snapshot.model` が未設定の場合の挙動が記述されていない。

**根拠**:
```typescript
// src/core/step/custom-reviewer.ts:106
model: snapshot.model ?? DEFAULT_REVIEW_MODEL,
```
テスト TC-001 の実装時に `snapshot.model` が設定された場合のみをテストする可能性があり、未設定時のフォールバック挙動が TC で固定されない。

**影響**: TC-001 の GWT（spec 参照）が「snapshot.model を持つ reviewer」の場合のみカバーする可能性があり、`snapshot.model = undefined` の場合（DEFAULT_REVIEW_MODEL へフォールバック）が照合対象に含まれることのテストが欠ける。
