# Cross-Boundary Invariants Review — agent-context-observability
## Iteration 1

---

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証サマリー

| 観点 | 判定 |
|------|------|
| TC-019 不変条件（halt 経路 usage.json 非記録）の保持 | ✅ PASS |
| cost 集計不変（aggregateUsage / deriveRunStat が null modelUsage をスキップ） | ✅ PASS |
| ModelUsage 型の非変更 | ✅ PASS |
| B-13/B-14（executor が store 直呼びしない） | ✅ PASS |
| B-2/B-3（SDK 封じ込め / shared-kernel 純粋性） | ✅ PASS |
| success 経路での contextMetrics 永続化の gate 結合 | ⚠️ MEDIUM |
| parallel round halt 経路での contextMetrics 暗黙廃棄 | ⚠️ LOW |
| output-repair ターン error 経路での exhaustion 検知欠落 | ⚠️ LOW |

---

## PASS 判定の根拠

### TC-019 不変条件の保持

既存の TC-019 は「error halt が usage.json に書かない」を固定する。

新実装 `commitHalt` のガード条件は：
```typescript
if (halt.contextMetrics !== undefined && deps?.cwd && deps?.slug) { ... }
```
TC-019 が使う `makeAgentThrowHalt` は `contextMetrics` フィールドを持たない（factory に引数がない）ため、このガードが false になり entry は追加されない。TC-019 テストは互換。

### cost 集計不変

`aggregateUsage`（usage-summary.ts L71）:
```typescript
if (!inv.modelUsage) continue;
```

`deriveRunStat`（job-stats.ts L185）:
```typescript
if (inv.modelUsage) { ... }
```
```typescript
if (typeof inv.totalCostUsd === "number") { ... }
if (typeof inv.numTurns === "number") { ... }
```

halt 由来の新規 entry は `modelUsage: null`、`totalCostUsd`・`numTurns` なし。すべてのガードで正しくスキップされる。コスト集計に影響なし。

### ModelUsage 型

`src/kernel/model-usage.ts` の `ModelUsage` は 4 フィールド（inputTokens / outputTokens / cacheReadInputTokens / cacheCreationInputTokens）のまま変更なし。`AgentContextMetrics` は完全に新規の別型・別モジュール。

### B-13/B-14

`contextMetrics` の永続化は `CommitOrchestrator.applySuccessPostPersistEffects`（success 経路）と `commitHalt`（halt 経路）の 2 箇所のみ。`StepExecutor` は `contextMetrics` を `StepExecutionResult.contextMetrics` および `StepHalt.contextMetrics` として downstream に渡すだけで、store 直呼びなし。

### B-2/B-3

`src/kernel/context-metrics.ts` は `src/` 配下を一切 import しない pure type module。SDK 型は adapter 内（`context-observer.ts`）に封じ込め済み。

---

## 問題のある発見

### Finding A — MEDIUM: success 経路の contextMetrics 永続化が `modelUsage` ガードに従属している

**ファイル**: `src/core/step/commit-orchestrator.ts` L255–276

**既存コードの暗黙前提**:
`applySuccessPostPersistEffects` の `appendInvocation` 呼び出しは `if (modelUsage && deps.cwd && deps.slug)` ブロック内に閉じている。これは「managed runtime や Codex ではモデル使用量が取れないので usage.json に書かない」という既存の不変条件であり、変更していないコード。

**新挙動との相互作用**:
`contextMetrics` の永続化がこのブロック内に追加された：
```typescript
if (modelUsage && deps.cwd && deps.slug) {
  await appendInvocation(usageAbsPath, {
    modelUsage,
    ...(invocationMetrics ?? {}),
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),  ← ここ
  });
}
```

**破られる不変条件**:
受け入れ条件「provider が active context size を報告できる場合、invocation 中の peak を記録できる」は、`modelUsage` が absent なら `contextMetrics` が定義されていても**無言で廃棄される**ことにより違反しうる。

具体的シナリオ: ClaudeCodeRunner の成功 run で SDK が空 (`{}`) の modelUsage を返した場合、`extractedModelUsage` が undefined のままとなる。この場合 `contextObserver.snapshot()` が non-undefined を返しても entry は書かれない。`modelUsage` と `contextMetrics` の永続化を同一ガードに統合したことで、一方の欠如が他方の永続化を阻む。

**実害リスク**: Claude Code SDK は成功 result で常に modelUsage を返すため現時点では latent（潜在的）バグ。しかし型上は `AgentRunResult.modelUsage` が `undefined` になりうるため、構造的な coupling として残る。

**修正案**: `contextMetrics` が存在する場合は `modelUsage` の有無に関わらず entry を appendInvocation する（`modelUsage: null` で書く、または別の appendInvocation 呼び出しを追加）。

---

### Finding B — LOW: parallel round halt 経路が `contextMetrics` を暗黙に廃棄する

**ファイル**: `src/core/step/commit-orchestrator.ts` L671–681

**既存コードの暗黙前提**:
`commitRound` の member halt 処理は、sequential path の `commitHalt` を呼ばず in-memory の `recordFailedStepResult` のみを実行する。これは B-13 parallel extension の既存設計。

**新挙動との相互作用**:
`StepHalt` union に `contextMetrics?: AgentContextMetrics` が追加されたが、`commitRound` の halt 分岐はこのフィールドを一切読まない：
```typescript
} else {
  state = recordFailedStepResult(state, step.name, result.halt.error, result.halt.recordOpts ?? {});
  if (result.halt.history) { state = appendHistoryEntry(...); }
  // halt.contextMetrics は読まれず廃棄
}
```

**破られる不変条件**:
`StepHalt` を保持している halt は「`commitHalt` 呼び出しにより contextMetrics が usage.json に永続化される」という暗黙の前提を持つが、parallel round 経路ではこの前提が満たされない。カスタムレビュアーが `Prompt is too long` で halt した場合、exhaustion 時点の context 情報が失われる。

**設計文書の記述**: `design.md` Risks セクションに「parallel round member の halt では usage.json append 経路が無い」として明示済み。

**実害リスク**: カスタムレビュアーが context exhaustion で halt する頻度は通常ステップより低い（レビュアーは軽量な判定タスク）。設計文書で acknowledged。

**修正案**: `commitRound` の halt 分岐で `result.halt.contextMetrics` が存在する場合に best-effort で `appendInvocation` を呼ぶ（sequential の `commitHalt` と同じ pattern）。ただし設計判断が必要。

---

### Finding C — LOW: output-repair ターンの error 経路で `markExhaustion` が呼ばれない

**ファイル**: `src/adapter/claude-code/agent-runner.ts` L1147–1184（output-repair ループ）

**既存コードの暗黙前提**:
postWork follow-up 経路（L1075–1095）では、非成功 result に対して `contextObserver.markExhaustion` を明示的に呼んでいる：
```typescript
if (followLastResult && followLastResult.subtype !== "success") {
  contextObserver.observeResult(followErrorResult as Record<string, unknown>);
  const followErrorJoined = ...
  if (followErrorJoined) contextObserver.markExhaustion(followErrorJoined);
  return { ... };
}
```

**新挙動との相互作用**:
output-repair ループは非成功 result を明示的に処理しない：
```typescript
for await (const message of repairMessages) {
  observeMessage(message);
  contextObserver.observe(message);
  if (message.type === "result" && subtype === "success") {
    // modelUsage を蓄積
  }
  // 非成功 result は無処理 → markExhaustion が呼ばれない
}
```
さらに catch ブロックはエラーを absorb して継続するだけで、error 文字列を `markExhaustion` に渡さない。

**破られる不変条件**:
「すべての turn で context exhaustion が検知・記録される」という暗黙の前提を、repair ターンの error 経路が満たさない。repair ターンで exhaustion が発生しても `exhaustionAtTokens` は設定されない。

**実害リスク**: output-repair ターン（outputVerification 設定時のみ）で context exhaustion が起きるシナリオは稀。`peakActiveContextTokens` は assistant messages 経由で記録される可能性が高い。`exhaustionAtTokens` の欠落のみ。

**修正案**: repair ループ内で `message.type === "result" && subtype !== "success"` のケースを追加し、`contextObserver.observeResult` + `markExhaustion` を呼ぶ。

---

## 検証対象ファイルリスト

確認したファイル：
- `src/kernel/context-metrics.ts`
- `src/core/port/agent-runner.ts`
- `src/core/usage/types.ts`
- `src/core/usage/store.ts`
- `src/core/step/commit-orchestrator.ts`
- `src/core/step/step-halt.ts`
- `src/core/step/executor.ts`
- `src/adapter/claude-code/context-observer.ts`
- `src/adapter/claude-code/agent-runner.ts`
- `src/adapter/codex/agent-runner.ts`
- `src/adapter/managed-agent/agent-runner.ts`
- `src/core/command/usage-show.ts`
- `src/core/command/usage-summary.ts`
- `src/core/command/job-stats.ts`
- `tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts`
- `tests/unit/core/step/commit-orchestrator-context-metrics.test.ts`
- `src/state/schema/types.ts`
- `specrunner/changes/agent-context-observability/design.md`
- `specrunner/changes/agent-context-observability/tasks.md`
