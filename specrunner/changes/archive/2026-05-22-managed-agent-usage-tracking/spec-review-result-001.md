# Spec Review Result: managed-agent-usage-tracking

- **verdict**: approved

## Summary

仕様・設計・タスクの三点セットが整合しており、実コードとも矛盾なし。実装ブロッカーなし。

---

## Findings

### [INFO] design.md D2 と D6 の `SessionUsage` 定義箇所に表記揺れあり

**対象**: `design.md` D2 コードブロック

D2 のコードブロックには `export interface SessionUsage { ... }` が `usage.ts` のローカル定義として掲載されているが、D6 では「`src/core/port/session-client.ts` が型の所有者」と確定している。`tasks.md` Task 2 は正しく「port から import」と指示しており、実装上の混乱は生じない。ただし設計文書としての整合性のため、D2 のコードブロックは `SessionUsage` のローカル定義を省略し `import` に置き換えるか、または「D6 参照」の注記を入れると望ましい。

→ 実装ブロッカーではなく、実装者は `tasks.md` に従えばよい。

### [INFO] `AgentRunResult.modelUsage` JSDoc の更新が tasks.md に未記載

**対象**: `src/core/port/agent-runner.ts` L92–95

現行コメント:
```
* Only populated by ClaudeCodeRunner (SDK provides this); ManagedAgentRunner leaves it undefined.
```

本 request 完了後は ManagedAgentRunner も populate するため、このコメントは実態と乖離する。tasks.md には当該コメント更新が含まれていない。実装者が Task 4 (`agent-runner.ts` 編集) のついでに更新することを推奨するが、動作には影響しない。

### [PASS] 2 経路カバレッジ

`runDesignStyle` (SSE + polling fallback) / `runPollingStyle` の両経路で usage read 挿入位置が明確。SSE end_turn 成功・SSE→polling fallback・polling 正常完了の全パスで "全 turn 完了後に 1 read" が成立する。

### [PASS] timeout early return は usage 不要

`runDesignStyle` L219 / `runPollingStyle` L489 の timeout early return に `modelUsage` を付けない設計は best-effort 原則と整合。セッションが未完了の場合は usage が得られないことを silent に扱う。

### [PASS] `mergeFollowUpResult` は `modelUsage` を保持

`follow-up.ts` の `mergeFollowUpResult` が `{ ...baseResult, resultContent: followUpResultContent }` スプレッドを使うため、`baseResult` に設定した `modelUsage` は結果に引き継がれる。

### [PASS] `SessionUsage` と `ModelUsage` の構造互換

`SessionUsage` は `ModelUsage` と同一フィールドを持ち structural typing で互換。port 型と state 型を別定義する判断 (D6) は型境界の明確化として妥当。

### [PASS] SDK 型境界

`getSessionUsage` の port 戻り型が `SessionUsage | undefined` (SDK 型なし) で、変換は adapter 層の純粋関数に閉じる。`src/core/port/session-client.ts` は SDK import を持たないまま維持される。

### [PASS] `step.agent.model` を一次キーにする根拠

`runDesignStyle` の SSE end_turn 成功経路では `resolvedConfig` が `if(needsPollingFallback)` ブロック内にのみ存在し scope 外。`step.agent.model` は全経路で常に scope 内であり、キーとして正しい。

### [PASS] セキュリティ

新たな認証経路・外部入力処理・SQL クエリなし。追加される API 呼び出しは既存の `retrieveSession` の再利用のみ。session ID は adapter 内部で生成・管理されており、外部入力によるインジェクションリスクなし。OWASP 上の懸念事項なし。
