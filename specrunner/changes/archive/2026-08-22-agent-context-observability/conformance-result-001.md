# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更規模確認

- `git diff main...HEAD --stat`: 38 files changed, 6670 insertions(+), 10 deletions(-)
- 新規ソース: `src/kernel/context-metrics.ts`, `src/adapter/claude-code/context-observer.ts`
- 変更ソース: `src/core/port/agent-runner.ts`, `src/core/usage/types.ts`, `src/core/step/step-halt.ts`, `src/core/step/executor.ts`, `src/core/step/commit-orchestrator.ts`, `src/core/command/usage-show.ts`, `src/adapter/claude-code/agent-runner.ts`, `src/adapter/codex/agent-runner.ts`, `src/adapter/managed-agent/agent-runner.ts`, `src/adapter/managed-agent/usage.ts`
- 新規テスト: 7 ファイル（context-observer, agent-runner-context-metrics, commit-orchestrator-context-metrics, usage-show-context-metrics, context-metrics-types, codex/agent-runner-context-metrics, managed-agent/agent-runner-context-metrics）

### typecheck / test

- `bun run typecheck`: エラーなし（tsc: 0 errors）
- `bun run test`: 12283 passed | 1 skipped | 2 todo（全 826 test files passed）

### request.md 受け入れ条件（全 9 項目）

| 条件 | 状態 |
|---|---|
| 累計 ModelUsage と active context metric が意味上・型上区別される | ✓ PASS |
| provider が active context size を報告できる場合、invocation 中の peak を記録できる | ✗ FAIL（F-1） |
| provider が compaction を報告できる場合、回数と before/after context size を記録できる | ✓ PASS |
| context exhaustion 時、取得可能なら exhaustion 時点の context size が残る | ✗ FAIL（F-1 の連鎖影響） |
| context size を取得できない provider では値を捏造せず unavailable として扱う | ✓ PASS |
| job 完了後に step/model/provider 単位で context metrics を確認できる | △ PARTIAL（compaction/window は動作するが peak/exhaustion が F-1 で破損） |
| 既存 ModelUsage / cost 集計の意味を変更しない | ✓ PASS |
| Claude / Codex adapter のどちらか一方の仕様を core 契約として固定しない | ✓ PASS |
| typecheck / test green | ✓ PASS |

### spec.md Requirement ごとの検証

**Req: context metrics は累計 ModelUsage と別の型で表現される**
- `src/kernel/context-metrics.ts`: pure type module、src/ 配下 import なし。`AgentContextMetrics` = `provider`（必須）+ 7 optional field。✓
- `src/kernel/model-usage.ts`: diff なし。`ModelUsage` は 4 field のまま（contextWindow 等の追加なし）。✓
- `AgentRunResult.contextMetrics?: AgentContextMetrics` が `modelUsage` / `invocationMetrics` とは別 field。✓
- `CommandInvocation.contextMetrics?: AgentContextMetrics` が nested object（flat spread でない）。✓

**Req: Claude adapter は provider が報告した active context の peak を記録する**
- sub-agent 除外（`parent_tool_use_id !== null`）: ✓ context-observer.ts 内で実装済み
- replay 除外（`isReplay === true`）: ✓ 実装済み
- peak（最大値）追跡ロジック: ✓ 実装済み
- **BUG F-1**: `observe()` が `msg["usage"]` を読むが、実際の SDK message（`SDKAssistantMessage`）では usage は `msg["message"]["usage"]`（BetaMessage）に格納されている。実 SDK メッセージでは `msg["usage"]` が undefined になるため、`peakActiveContextTokens` が production では一切記録されない。詳細は Findings 詳細参照。

**Req: Claude adapter は provider native compaction の発火を記録する**
- `type: "system"` + `subtype: "compact_boundary"` 検出: ✓
- `compactionCount` インクリメント: ✓
- `compact_metadata.pre_tokens` → `contextTokensBeforeCompaction`: ✓
- `post_tokens` 欠落時 → `contextTokensAfterCompaction` を undefined にリセット: ✓
- compact_boundary は `type: "system"` メッセージで top-level フィールドを使うため F-1 の影響なし。✓

**Req: context exhaustion 時に観測できていた context size が残る**
- `isContextExhaustionError()` allowlist（case-insensitive: `prompt is too long` / `context length exceeded` / `context window exceeded`）、fail-closed: ✓
- `markExhaustion()` は `lastActiveContextTokens` が設定済みの場合のみ `exhaustionAtTokens` を更新: ✓
- **F-1 の連鎖影響**: production では `lastActiveContextTokens` が未設定のため、context 溢れエラー発生時でも `exhaustionAtTokens` が記録されない。✗

**Req: 報告能力の無い provider では context metrics を捏造しない**
- Codex adapter: doc comment 追加、全 return 経路で `contextMetrics` 未設定。✓
- Managed adapter: doc comment 追加。`mapSessionUsage` に context 値を非導出の旨を明記。✓
- `snapshot()`: 6 観測 field が全 undefined なら `undefined` を返す（空 record を作らない）。✓
- Codex / Managed の unavailability テスト: 追加・green。✓

**Req: context metrics は usage.json に永続化され step / model / provider 単位で確認できる**
- success path: `applySuccessPostPersistEffects` → `appendInvocation` に `contextMetrics` を include。条件は `(modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug`。✓
- halt path: `commitHalt` が `halt.contextMetrics !== undefined && deps?.cwd && deps?.slug` 条件で `appendInvocation`（`modelUsage: null`、invocation metrics なし）。✓
- best-effort: try/catch で握りつぶし、FSM 遷移・rethrow に影響なし。✓
- `apply()` が `commitHalt(step, state, result.halt, deps)` に `deps` を渡す。✓

**Req: 既存の usage / cost 集計の意味を変えない**
- halt entry は `modelUsage: null` かつ invocation metrics フィールドなし（numTurns / durationMs 等を含まない）。✓
- `contextMetrics` のない halt では usage.json に entry を追加しない（TC-019 互換維持）。✓
- 既存 `commit-orchestrator-usage-metrics.test.ts` が全 green（TC-019 含む）。✓

**Req: core 契約は provider 中立に保たれる**
- `AgentContextMetrics` に `trigger`（manual/auto）、閾値、compaction policy フィールドなし。✓
- `provider` は自由文字列（enum なし）。✓
- Codex / Managed runtime で例外なし動作（報告しない provider では context 情報が単に不在）。✓

### design.md / tasks.md の計画整合（参考）

- T-01〜T-08 の全 checkbox が checked。✓
- design D1〜D9 は実装に反映されている。
- `src/core/step/step-completion.ts` には contextMetrics の関与なし（verdict 導出に関係しない）。✓
- `makeAgentThrowHalt` は contextMetrics を持たない（runner throw 経路は AgentRunResult を返さないため設計上許容）。✓

## 検証できなかった項目

None — 全 spec.md Requirement と全受け入れ条件を検証した。

## Findings 詳細

### F-1: context-observer が assistant message の usage を誤ったパスで読む（HIGH / fixable）

**場所**: `src/adapter/claude-code/context-observer.ts`（`observe()` メソッド内、約 103 行目）

**事象**:

`observe()` 内で assistant message の usage を次のように読んでいる：

```typescript
// 現状（誤り）
const usage = msg["usage"];
if (usage === null || typeof usage !== "object") return;
```

しかし実際の `SDKAssistantMessage`（`@anthropic-ai/claude-agent-sdk` v0.2.128 の型定義）の構造は次のとおりで、usage は `message` フィールド（BetaMessage）に格納されている：

```typescript
type SDKAssistantMessage = {
  type: 'assistant';
  message: BetaMessage;   // BetaMessage.usage = BetaUsage（input_tokens 等を持つ）
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

同じコードベースの `touched-files-recorder.ts`（L66）は `msg["message"]` を経由して content にアクセスしており、実 SDK 構造を正しく参照している：

```typescript
const inner = msg["message"] as Record<string, unknown> | undefined;
```

**影響**:

production で実 SDK メッセージが届く場合、`msg["usage"]` は `undefined`（object ではない）のため、早期リターン条件 `typeof usage !== "object"` が true になり、assistant message ごとに即 return される。

結果として：
- `lastActiveContextTokens` が一切更新されない → `peakActiveContextTokens` は常に `undefined`
- `markExhaustion()` が呼ばれても `lastActiveContextTokens === undefined` のため `exhaustionAtTokens` も常に `undefined`

テスト（`context-observer.test.ts` / `agent-runner-context-metrics.test.ts`）は usage を top-level に置いたモックメッセージを使用しているため、この誤りを検出できていない。

**違反している仕様**:

- spec.md Req 2: "adapter SHALL record the maximum observed value as `peakActiveContextTokens`"
- spec.md Req 4: "adapter SHALL set `exhaustionAtTokens` to the most recently observed active context size"
- request.md 受け入れ条件: "provider が active context size を報告できる場合、invocation 中の peak を記録できる"
- request.md 受け入れ条件: "context exhaustion 時、取得可能なら exhaustion 時点の context size が残る"

**修正案**:

`context-observer.ts` の `observe()` 内で usage へのアクセスを BetaMessage 経由に変更する：

```typescript
// 修正後（正しい）
const innerMsg = msg["message"];
const usage = (innerMsg !== null && typeof innerMsg === "object")
  ? (innerMsg as Record<string, unknown>)["usage"]
  : undefined;
if (usage === null || typeof usage !== "object") return;
```

テストのモックメッセージも正しい構造に更新する：

```javascript
// 修正後のモック構造
{
  type: "assistant",
  message: {
    usage: { input_tokens: 80000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 2000 }
  },
  parent_tool_use_id: null
}
```

**注意**: compaction（`type: "system"`）、contextWindow（`observeResult` 経由の result message）は異なるパスを使用するため、この F-1 の影響を受けない。compaction カウントと contextWindowTokens は production でも正常に動作する。

**fixTarget**: code-fixer（孤立したコードレベルの修正で、spec / design の変更は不要）
