# step result に modelUsage を記録して事後検証可能にする

## Meta

- **type**: new-feature
- **slug**: record-model-usage-in-step-result

## 背景

PR #95 で config.json の steps セクションから model を外出し設定可能にしたが、実際にどの model が使われたかを事後検証する手段がない。SDK の `SDKResultSuccess` には `modelUsage: Record<string, ModelUsage>` フィールドが含まれており、どのモデルが何トークン使ったかが返ってくる。現在の ClaudeCodeRunner はこの情報を破棄している。

## 要件

1. `AgentRunResult` に `modelUsage?: Record<string, { inputTokens: number; outputTokens: number }>` フィールドを追加
2. ClaudeCodeRunner が SDK の `SDKResultSuccess.modelUsage` を `AgentRunResult.modelUsage` に格納する
3. executor が step result に `modelUsage` を記録する（state.steps[name][-1] に含める）
4. `specrunner ps` で model 情報を表示する必要はない（state file を直接見れば確認可能）
5. ManagedAgentRunner は `modelUsage` を返さない（managed API にはこの情報がない）→ `undefined` のまま

## 受け入れ基準

- [ ] dogfood 実行後の state file に `modelUsage` が記録されている
- [ ] `modelUsage` のキーがモデル名（例: `claude-opus-4-6`）になっている
- [ ] `bun run typecheck && bun run test` が green
