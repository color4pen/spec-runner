# Cross-Boundary Invariants Review — agent-context-observability
## Iteration 2

---

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 前周指摘の再確認

前周（iteration 1）で報告した 3 件を現行コードで再読・再確認した。

| 前周 finding | 状態 |
|---|---|
| F-1 medium/fixable — success 経路 contextMetrics が modelUsage ガードに従属 | **未修正**（code-fixer 変更なし） |
| F-2 low/decision-needed — parallel round halt 経路の contextMetrics 廃棄 | Operator 裁定：現状維持。再指摘なし。 |
| F-3 low/fixable — output-repair 非成功 result で exhaustion 未記録 | **未修正**（code-fixer 変更なし） |

code-fixer は iteration 1 以降に変更を加えていない（machine-derived: commit diff から機械導出で "変更なし"）。
F-1 / F-3 はコードが変わっていないため finding が継続中。以下に現行コードを再読した上で各再指摘を記す。

---

## F-1（再指摘）— success 経路の contextMetrics 永続化が modelUsage ガードに従属

### 現行コード（再読確認）

`src/core/step/commit-orchestrator.ts` L258–276:

```typescript
if (modelUsage && deps.cwd && deps.slug) {
  const usageAbsPath = path.join(deps.cwd, usageJsonPath(deps.slug));
  try {
    await appendInvocation(usageAbsPath, {
      command: "job",
      timestamp: completedAt,
      modelUsage,
      jobId: state.jobId,
      stepName: step.name,
      ...(invocationMetrics ?? {}),
      ...(contextMetrics !== undefined ? { contextMetrics } : {}),
    });
  } catch {
    // Best-effort: usage append failure must not block step completion
  }
}
```

`contextMetrics` の append は `modelUsage && ...` ガードの **内側** にある。modelUsage が falsy（undefined / null）なら contextMetrics が存在していても usage.json への書き込みは発生しない。

### なぜ修正が不十分か

コードが変更されていないため、問題が残っている。

**発生シナリオ**: SDK が usage 情報を返さないが（= `modelUsage === undefined`）、compact_boundary event や assistant message の usage が観測された invocation。例：セッション初期の短時間 invocation で SDK の result が `modelUsage: {}` や無し、かつ compaction が発火したケース。

この場合 `extractedModelUsage` は undefined となり、success path の `applySuccessPostPersistEffects` は usage.json に一切書かない。contextMetrics（compaction 情報含む）は消失する。

**テストカバレッジの欠落**: 既存の `makeSuccessResultWithContextMetrics` ヘルパー（commit-orchestrator-context-metrics.test.ts L146–165）は常に `modelUsage` を含む。`modelUsage` 不在 + `contextMetrics` 存在 のケースを検証するテストが存在しない。

**operator 裁定**: F-1 は修正する（`modelUsage` ガードを `contextMetrics` 永続化から独立させ、modelUsage がなくても contextMetrics があれば `modelUsage: null` エントリを append する）。回帰テストも追加する。

この修正はまだ適用されていない。

---

## F-3（再指摘）— output-repair ターンの非成功 result / error で markExhaustion が呼ばれない

### 現行コード（再読確認）

`src/adapter/claude-code/agent-runner.ts` output-repair ループ（L1144–1183 抜粋）:

```typescript
try {
  const repairMessages = effectiveQueryFn({ prompt: repairPrompt, options: repairOptions });
  watchdog.bump();
  abortController.signal.throwIfAborted();
  for await (const message of repairMessages as AsyncGenerator<SDKMessage, void>) {
    watchdog.bump();
    observeMessage(message);
    contextObserver.observe(message);
    if (message.type === "result" && (message as SDKResultMessage).subtype === "success") {
      // success: modelUsage 更新のみ。contextObserver.observeResult は呼ばれない
      ...
    }
    // ← 非成功 result に対するブランチが存在しない
  }
} catch (err) {
  if (abortController.signal.aborted) throw err;
  // ← contextObserver.markExhaustion は呼ばれない
  stderrWrite(`[specrunner] warn: ...`);
}
```

### なぜ修正が不十分か

コードが変更されていないため、問題が残っている。

**欠落 1**: repair ストリームが非成功 result（`subtype !== "success"`）を返したとき:
- `contextObserver.observeResult(errorResult as Record<string, unknown>)` が呼ばれない → contextWindowTokens が更新されない
- `contextObserver.markExhaustion(errorJoined)` が呼ばれない → repair ターンで "Prompt is too long" が発生しても `exhaustionAtTokens` が設定されない

**欠落 2**: repair ターンで SDK が throw した場合の catch ブロック:
- `contextObserver.markExhaustion((err as Error).message)` が呼ばれない → SDK throw が context exhaustion 起因の場合も `exhaustionAtTokens` が欠落する

**postWork との非対称性**: `postWork` ターン（`runFollowUpQueryWithRetry`）では非成功 result に対して `contextObserver.observeResult` と `markExhaustion` が適切に呼ばれている（L1075–1083）。repair ターンのみが未対応。

**テストカバレッジの欠落**: TC-029 コメントに "postWork ターンと output-repair ターンでも observe が呼ばれる" とあるが、実際の test describe は "postWork ターンの compaction も contextMetrics.compactionCount に含まれる" のみ。output-repair 非成功結果や catch 経路での exhaustionAtTokens 検証テストが存在しない。

**operator 裁定**: F-3 は修正する（postWork follow-up と同じ扱いに揃える）。回帰テストも追加する。

この修正はまだ適用されていない。

---

## 不変条件の保持確認（iteration 2 で新規に確認した観点）

iteration 2 では operator 裁定済み F-1 / F-3 fix の事前チェックを含め、以下の不変条件を追加検証した。すべて現行コードで保持されている。

### TC-019 不変条件の継続保持

halt 経路で contextMetrics のない halt（`makeAgentThrowHalt` / `makeOutputGateHalt` / `makeCommitFailHalt` 等）では、`commitHalt` の `halt.contextMetrics !== undefined` ガードが false となり usage.json 書き込みは発生しない。TC-019（error 時は invocation metrics を書かない）は変わらず保持される。

### cost 集計の不変性（F-1 fix 後を先読み）

operator 裁定の F-1 fix（`modelUsage: null` entry を追加）が適用された後も:
- `aggregateUsage`（usage-summary.ts）: `if (!inv.modelUsage) continue;` でスキップ
- `deriveRunStat`（job-stats.ts）: `if (inv.modelUsage)` ブロックのみ加算

いずれも `modelUsage: null` entry を無視するため、数値は変わらない。

### B-2/B-3 境界の保持

`AgentContextMetrics` は `src/kernel/context-metrics.ts`（zero imports from src/）に置かれ、SDK 型を含まない。adapter が SDK message を観測して port 型へ変換する構造は変わらない。

### D6（undefined = unavailable の一規則）の保持

Codex / managed adapter は `contextMetrics` を設定しない（未変更）。`ClaudeCodeRunner` も観測がゼロの invocation では `contextObserver.snapshot()` が undefined を返す（context-observer.ts L192–202 の `hasAnyValue` チェック）。空 object を書かない規則が保持されている。

---

## evidence

- 確認ファイル数: 10（commit-orchestrator.ts / agent-runner.ts / context-observer.ts / step-halt.ts / kernel/context-metrics.ts / usage/types.ts / usage/store.ts / usage-show.ts / agent-runner.ts(port) / executor.ts）
- 確認テストファイル数: 2（commit-orchestrator-context-metrics.test.ts / agent-runner-context-metrics.test.ts）
- 確認項目: 12（上記 PASS 項目 + F-1/F-3 再確認）
