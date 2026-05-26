# Spec Review Result

- **verdict**: approved

## Summary

#376 (anthropic-client `as unknown as` 廃止) と #377 (executor emit event 名型安全化) の両方について、設計・仕様・タスクリストが整合している。SDK 型を実際に確認した上で設計判断が行われており、型安全化の方向性は正しい。

---

## #376: anthropic-client の `as unknown as` 廃止

### SDK 型検証

- `BetaManagedAgentsAgent.version: number` が非 optional で存在することを確認（SDK L109）✅
- `BetaManagedAgentsAgentToolset20260401Params`・`BetaManagedAgentsCustomToolParams` が SDK に存在することを確認（SDK L179, L283）✅
- `AgentCreateParams.tools?: Array<Toolset20260401 | MCPToolset | CustomTool>` を確認（SDK L486）✅
- `AgentUpdateParams.version: number`（非 optional）を確認（SDK L509）→ `current.version` 直参照が有効 ✅

### 設計の正確性

- **D2の型互換性主張**: `Array<A | B>` は TypeScript の配列共変性により `Array<A | B | C>` に代入可能。`BetaManagedAgentsMCPToolsetParams` を除外した部分 union の代入は正当 ✅
- **tasks の計数**: version キャスト 4 箇所 + tools キャスト 2 箇所 = 合計 6 箇所（request.md の数と一致）✅
- **`?? 1` fallback 削除**: SDK が `number` を保証するため不要 ✅

---

## #377: executor emit event 名の型安全化

### 設計の正確性

- `DomainEvent` 型は `src/core/event/types.ts` に定義済み。`"step:progress"` が union に含まれる ✅
- adapter が現在 emit する event は `"step:progress"` のみであり、`DomainEvent` 変更後も既存呼び出しは valid ✅
- executor の `event as Parameters<EventBus["emit"]>[0]` キャストは、`event` が `DomainEvent` 型になれば不要になる（EventBus の emit が `DomainEvent` を第 1 引数に取るため）✅

### baseline spec との整合

- `agent-runner-port` baseline spec L28 は `emit: (event: DomainEvent) => void` と記述しており、`string` ではなく `DomainEvent` を意図している。今回の変更は spec の意図に合致 ✅
- baseline spec に `payload` パラメータが明示されていないのは pre-existing な spec の簡略表記であり、今回の変更スコープ外 ✅

---

## Delta Spec 検証

### `managed-agent-adapter` (新規 capability)

- `## Requirements` セクション構造 ✅
- `### Requirement:` ヘッダー形式 ✅
- `#### Scenario:` ヘッダー形式 ✅
- `SHALL`/`MUST` normative keyword 存在 ✅
- Requirement と Scenario の間にコードブロックなし ✅
- 旧形式 (`## ADDED/MODIFIED`) 不使用 ✅

### delta なしの判断（agent-runner-port / claude-code-runtime）

- `agent-runner-port` の変更は baseline spec の記述（`DomainEvent`）への整合であり delta 不要の判断は妥当 ✅
- `claude-code/agent-runner.ts` の `emitFn` 型変更はランタイム動作変化なし。型注釈の修正のみであり既存 spec 要件（`step:progress` emit）を引き続き満たす ✅

---

## セキュリティ考慮

純粋な TypeScript コンパイル時型変更であり、実行時の認証・入力検証・データ変換に変化なし。OWASP 該当項目なし。

---

## 軽微な観察（ブロックなし）

1. `AgentUpdateParams.tools` は `Array<...> | null` optional だが、配列を渡す既存コードは変更後も valid（null 非代入）
2. `agent-runner-port` baseline の `emit` 記述が `payload` 引数を省略している点は pre-existing な不正確さ。今回変更スコープ外
