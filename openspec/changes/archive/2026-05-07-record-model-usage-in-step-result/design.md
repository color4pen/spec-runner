## Context

PR #95 で step ごとの model を config.json から設定可能にした。しかし実際のラン結果にどのモデルが使われたか・何トークン消費したかの記録がない。SDK の `SDKResultSuccess` は `modelUsage: Record<string, ModelUsage>` を返すが、ClaudeCodeRunner はこの情報を破棄して `completionReason` と `resultContent` だけ返している。

state file に modelUsage を記録すれば、dogfood 後に「期待通りのモデルが使われたか」「コスト構造はどうか」を事後検証できる。

## Goals / Non-Goals

**Goals:**

- SDK の `modelUsage` を step result に記録する
- 後方互換: `modelUsage` は optional。既存 state file は変更不要
- 型定義は SDK の `ModelUsage` のサブセット（`inputTokens` / `outputTokens` のみ）にしない → SDK の全フィールドをそのまま記録する

**Non-Goals:**

- `specrunner ps` への表示（state file 直接参照で十分）
- ManagedAgentRunner への対応（Managed API に modelUsage 相当の情報がない）
- コスト集計ロジック（記録だけ。集計は別 change）
- `total_cost_usd` や `num_turns` の記録（スコープ外。必要なら別 change）

## Decisions

### D1: AgentRunResult の拡張

`AgentRunResult` に optional フィールドを追加:

```typescript
export interface AgentRunResult {
  completionReason: "success" | "error" | "timeout";
  resultContent: string | null;
  sessionId?: string;
  agentBranch?: string;
  error?: Error & { code?: string; hint?: string };
  /** Model usage breakdown from SDK. undefined for managed runtime or error cases. */
  modelUsage?: Record<string, ModelUsage>;
}
```

`ModelUsage` 型は specrunner 独自に定義する（SDK の型を直接 export しない。port 層が adapter の型に依存しないため）:

```typescript
/** Per-model token usage recorded from the SDK result. */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}
```

SDK の `ModelUsage` から `webSearchRequests`, `costUSD`, `contextWindow`, `maxOutputTokens` は除外する。これらは実行環境固有のメタデータであり、トークン使用量の記録とは別関心。`costUSD` は SDK 側の計算値であり specrunner が独自に計算すべき。

### D2: ClaudeCodeRunner での抽出

`lastResult` が success の場合、`SDKResultSuccess` にキャストして `modelUsage` を取得する:

```typescript
// success path — extract modelUsage
const successResult = lastResult as SDKResultSuccess;
const modelUsage = successResult.modelUsage;
```

最終的な return に含める:

```typescript
return {
  completionReason: "success",
  resultContent,
  modelUsage,
};
```

SDK の `ModelUsage` 型には `webSearchRequests`, `costUSD`, `contextWindow`, `maxOutputTokens` も含まれるが、port 層の型変換で必要なフィールドのみマッピングする:

```typescript
const mapped: Record<string, ModelUsage> = {};
for (const [model, usage] of Object.entries(successResult.modelUsage)) {
  mapped[model] = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
  };
}
```

### D3: StepRun への記録

`StepRun` に optional フィールドを追加:

```typescript
export interface StepRun {
  attempt: number;
  sessionId: string | null;
  outcome: StepOutcome;
  startedAt: string;
  endedAt: string;
  /** Per-model token usage. Present only for local runtime (ClaudeCodeRunner). */
  modelUsage?: Record<string, ModelUsage>;
}
```

`StepResultInput` にも同名フィールドを追加し、`pushStepResult` でそのまま格納する。

### D4: ManagedAgentRunner は変更不要

ManagedAgentRunner は `modelUsage` を返さない（Managed Agents API のレスポンスに含まれない）。`AgentRunResult.modelUsage` は optional なので、undefined のまま返る。executor 側は `modelUsage` が undefined なら `StepRun` に含めない（JSON.stringify で自動省略）。

### D5: normalizeSteps の後方互換

既存の state file には `modelUsage` がない。`normalizeSteps` / `legacyObjectToStepRun` は `modelUsage` を明示的に扱わない。undefined のまま。読み取り時に存在チェックすればよい。

## Risks / Trade-offs

- [Trade-off] SDK の `ModelUsage` 全フィールドではなくサブセット → トークン系 4 フィールドで事後検証の目的は十分達成。`costUSD` は SDK のレート前提に依存するため独自記録のほうが正確
- [Risk] SDK の型が変わった場合 → port 層で明示的にマッピングしているため、コンパイルエラーで検知可能
- [Trade-off] `StepRun` 肥大化 → optional かつ JSON.stringify で undefined は省略されるため、managed runtime の state file にはフィールド自体が出現しない
