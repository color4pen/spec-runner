## Context

PR #91 で各 step に model / maxTurns をハードコードした。dogfood で implementer の maxTurns: 60 が不足して pipeline が失敗。現状、実行パラメータの調整にはソースコード変更が必要。

config.json は `~/.config/specrunner/config.json` に保存され、`SpecRunnerConfig` 型で管理される。現在の config schema は version 1 で、agents / pipeline / anthropic / github / environment / specReview / specFixer を持つ。step 実行パラメータのセクションは存在しない。

ClaudeCodeRunner（local runtime）は `step.maxTurns` と `step.agent.model` を直接 SDK `query()` に渡している。ManagedAgentRunner（managed runtime）は agent 定義の model を使い、maxTurns は session レベルでは制御しない（Managed Agents API の仕様）。

## Goals / Non-Goals

**Goals:**

- config.json に `steps` セクションを追加し、step ごとの model / maxTurns / timeoutMs を設定可能にする
- config → defaults → step ハードコード → SDK デフォルトの 4 段階解決
- `maxTurns: null` で unlimited（SDK に maxTurns を渡さない）
- 後方互換: `steps` セクションがなくても既存動作を維持
- `specrunner init --runtime=local` で `steps.defaults` を含む config を生成

**Non-Goals:**

- ManagedAgentRunner への適用（Managed Agents API は session 単位の maxTurns / model 切替をサポートしない）
- timeoutMs の実装（SDK に timeout パラメータなし。config 定義のみ用意）
- top-level の specReview / specFixer timeout config のキー名変更

## Decisions

### D1: config schema の拡張方法

`SpecRunnerConfig` に `steps?: StepConfigMap` をオプショナルフィールドとして追加する。

```typescript
interface StepExecutionConfig {
  model?: string;
  maxTurns?: number | null;  // null = unlimited
  timeoutMs?: number | null; // null = no timeout
}

interface StepConfigMap {
  defaults?: StepExecutionConfig;
  [stepName: string]: StepExecutionConfig | undefined;
}
```

**理由**: 既存フィールドを変更せず追加のみ。`steps` 未指定時は undefined で後方互換を自動的に維持。`StepConfigMap` を `Record<string, StepExecutionConfig | undefined>` ベースにすることで、step 名の追加時に型変更が不要。

### D2: 解決関数 `getStepExecutionConfig`

`src/config/step-config.ts` に純粋関数として実装する。

```typescript
function getStepExecutionConfig(
  config: SpecRunnerConfig,
  stepName: string,
  stepDefaults: { model: string; maxTurns?: number }
): ResolvedStepConfig
```

解決順序:
1. `config.steps?.[stepName]?.[field]` — step 個別設定
2. `config.steps?.defaults?.[field]` — config デフォルト
3. `stepDefaults[field]` — step 定義のハードコード値（呼び出し元が渡す）
4. SDK デフォルト（maxTurns 未指定 = undefined → SDK 側で unlimited）

**理由**: step 定義（`step.agent.model`, `step.maxTurns`）は Step オブジェクト側が持つため、解決関数はそれを引数として受け取り、config の値で上書きする設計。Step オブジェクト自体を変更する必要がない。

`ResolvedStepConfig` の型:
```typescript
interface ResolvedStepConfig {
  model: string;           // 必ず解決済み（step 定義が fallback）
  maxTurns: number | null; // null = unlimited
  timeoutMs: number | null; // null = no timeout
}
```

### D3: ClaudeCodeRunner への適用箇所

`ClaudeCodeRunner.run()` 内で `getStepExecutionConfig(ctx.config, step.name, { model: step.agent.model, maxTurns: step.maxTurns })` を呼び、解決済みの値を SDK `query()` の options に渡す。

- `maxTurns: null` の場合は `options.maxTurns` を省略（SDK のデフォルト = unlimited）
- `model` は解決済み値をそのまま渡す
- `timeoutMs` は解決するが options には渡さない（SDK 未対応）

現在の `step.maxTurns ?? 30` のフォールバックは `getStepExecutionConfig` の解決チェーンに置き換わる。

### D4: init での steps.defaults 生成

`runInitLocal()` で config に `steps` セクションがなければ `steps.defaults` を追加する。既存 config に `steps` が既にある場合は上書きしない。

```json
{
  "steps": {
    "defaults": {
      "model": "claude-sonnet-4-6",
      "maxTurns": null,
      "timeoutMs": null
    }
  }
}
```

**理由**: `null` はデフォルトで unlimited を意味する。ユーザーが必要に応じて数値に変更できる。model は最も汎用的な sonnet をデフォルトとする。

### D5: ManagedAgentRunner は対象外

ManagedAgentRunner は Anthropic Managed Agents API を使用しており、session 作成後の model / maxTurns 変更はサポートされない。config の `steps` 設定は local runtime（ClaudeCodeRunner）でのみ効果を持つ。将来 Managed Agents API が対応した場合に拡張する。

## Risks / Trade-offs

- [Risk] config の `steps` に存在しない step 名を書いた場合、サイレントに無視される → 将来的に `specrunner doctor` で検証可能にするが、本 change では対象外
- [Risk] `maxTurns: null` と `maxTurns` 未指定の区別が必要 → `null` は明示的に unlimited、`undefined`（未指定）は次の fallback に進む。JSON では `null` と key 不在を区別可能
- [Trade-off] 解決関数を Step オブジェクトの外に置くため、Step 自体は config-agnostic のまま → Step の単純さを維持。テストで config なしに Step を検証可能
