# Design: save-session-id

## 概要

`ClaudeCodeRunner.run()` が SDK の `SDKResultSuccess.session_id` を無視しており、`AgentRunResult.sessionId` が常に `undefined` になる。1 箇所の抽出漏れを修正する。

## 現状分析

### データフロー（現在）

```
SDK query() → SDKResultSuccess { session_id: "abc-123", modelUsage: {...} }
                                  ↓
ClaudeCodeRunner.run()          modelUsage → 抽出済み ✓
                                session_id → 無視 ✗
                                  ↓
AgentRunResult { sessionId: undefined, modelUsage: {...} }
                                  ↓
StepExecutor.finalizeStep()     sessionId → null (session entry 未生成)
                                  ↓
StepRun { sessionId: null }
```

### データフロー（修正後）

```
SDK query() → SDKResultSuccess { session_id: "abc-123", modelUsage: {...} }
                                  ↓
ClaudeCodeRunner.run()          modelUsage → 抽出済み ✓
                                session_id → 抽出 ✓
                                  ↓
AgentRunResult { sessionId: "abc-123", modelUsage: {...} }
                                  ↓
StepExecutor.finalizeStep()     sessionId → session entry 生成
                                  ↓
StepRun { sessionId: "abc-123" }
```

## 修正方針

### D1: `successResult.session_id` の抽出

`src/adapter/claude-code/agent-runner.ts` L183-198 の success result ブロックで既に `successResult` を `SDKResultSuccess` にキャストしている。同ブロック内で `session_id` を変数に保存する。

`SDKResultSuccess.session_id` は SDK 型定義で `string`（必須フィールド、L3169）。

### D2: return への追加

L275-279 の success return に `sessionId` フィールドを追加する。変数が未設定（success ブロックを通過しなかった場合）は `undefined` のまま — `AgentRunResult.sessionId` は optional なので既存動作と互換。

## 影響範囲

- **変更ファイル**: `src/adapter/claude-code/agent-runner.ts` のみ（1 ファイル）
- **型変更**: なし（既存の `sessionId?: string` フィールドを使用）
- **下流への影響**: `StepExecutor.finalizeStep()` → `pushStepResult()` は既に `agentResult.sessionId` を処理するパスを持っている。ManagedAgentRunner では動作済み
- **AgentRunResult.sessionId の JSDoc**: "Session ID for managed runtime (undefined for local)" の記述は不正確になる。実態に合わせて更新する

## 非対象

- `SDKResultSuccess` の型変更
- StepExecutor / JobState 側のロジック変更
- テスト追加（プロジェクトにユニットテストなし）
