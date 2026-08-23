# Cross-Boundary-Invariants Review: fresh-session-rollover

**Iteration**: 4  
**Reviewer**: cross-boundary-invariants  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 前周 findings の解消状況

前周 (iteration-3) で F-NEW-1（MEDIUM）を指摘した。code-fixer の変更ファイル（`src/core/step/executor.ts` / `src/core/step/step-halt.ts` / テスト群）を読み直し、解消状況を確認した。

| Finding | 前周裁定 | 解消状況 |
|---------|---------|---------|
| F-NEW-1 (MEDIUM) post-success halt 3 種が sessionRollovers を転記しない | fixable | **解消済み** |

### F-NEW-1 解消確認（読み直し）

**`step-halt.ts` のファクトリ関数シグネチャ変更確認:**

```typescript
// makeDriftHalt (line 237-243): sessionRollovers? 引数が追加済み
export function makeDriftHalt(
  drift: GuardDrift,
  stepName: string,
  slug: string,
  recordOpts?: ...,
  contextMetrics?: AgentContextMetrics,
  sessionRollovers?: AgentSessionRollover[],  // ← 追加済み
): StepHalt & { kind: "awaiting-resume" }

// makeOutputGateHalt (line 330-338): 同様に追加済み
// makeCommitFailHalt (line 388-395): 同様に追加済み
```

**`executor.ts` の call site 確認:**

```typescript
// line 405 — drift halt
const halt = makeDriftHalt(drift, step.name, deps.slug, { startedAt }, runResult.contextMetrics, runResult.sessionRollovers);  // ✓

// line 426 — output gate halt
const halt = makeOutputGateHalt(allViolations, step.name, state.branch ?? null, { startedAt }, runResult.contextMetrics, runResult.sessionRollovers);  // ✓

// lines 465-470 — commit fail halt
const halt = makeCommitFailHalt(
  finalizeError as Error & { code?: string; hint?: string },
  step.name,
  { startedAt },
  runResult.contextMetrics,
  runResult.sessionRollovers,  // ✓
);
```

3 call site すべてで `runResult.sessionRollovers` が渡されていることを確認。F-NEW-1 は充足されている。✅

---

## Findings（新規・iteration 4）

### F-NEW-2 — LOW: `commitRound` の halt メンバーが `sessionRollovers` の contextOnly エントリを usage.json に書かない

**ファイル**: `src/core/step/commit-orchestrator.ts`  
**行**: 730–741（commitRound の halt メンバー処理）

**観察内容:**

`CommitOrchestrator.commitRound()`（並列レビューラウンドのコミッター）には、halt メンバーを処理する分岐がある。

```typescript
// commit-orchestrator.ts 730-741
} else {
  // halt — recordFailedStepResult only (no store.fail / transitionJob)
  state = recordFailedStepResult(state, step.name, result.halt.error, result.halt.recordOpts ?? {});

  // history from halt.history (in-memory append)
  if (result.halt.history) {
    state = appendHistoryEntry(state, {
      ts: now,
      ...result.halt.history,
    });
  }
}
```

この分岐では `result.halt.sessionRollovers` のイテレートが行われない。同じ gap は `contextMetrics` にも存在していた（本 PR 前からの既存制限）。

ステップ 4「best-effort post-persist」（lines 767–778）は success メンバーだけを対象とし、halt メンバーの usage.json 追記は一切行わない:

```typescript
for (const { step, result, preWriteIo, preReadIo } of successEntries) {
  await this.applySuccessPostPersistEffects(store, state, step, result, deps, preWriteIo, preReadIo);
}
// halt メンバーへの usage.json 書き込みなし ← gap
```

**壊れる不変条件:**

design D7 は「`CommitOrchestrator` が各要素を `usage.json` の `contextOnly: true` エントリとして append する」と規定する。tasks T-06 では `commitHalt`（逐次ハルトパス）への追加が明示されているが、`commitRound` の halt メンバーパスは対象外のまま。

結果として以下の三重条件下で D7 の保証が成立しない:

1. カスタムレビュアーが **並列ラウンドメンバー** として実行される
2. そのレビュアーで **コンテキスト枯渇による rollover が発生** する
3. rollover budget が尽きる / rollover 後も失敗して **halt メンバー** になる

この場合、`sessionRollovers` に記録された contextOnly エントリが usage.json に書かれない。

**発生確率の評価:**

並列ラウンドは custom reviewer ステップのみ（code-review 後の review-feedback フェーズ）。コンテキスト枯渇が発生するのは実装量の大きい step が支配的であり、短期間動作のレビュアー step での枯渇は稀。さらに rollover 後も失敗する三重条件は実運用上極めて低頻度。

なお、`step:rollover` event は rollover 発生時点で emit 済み（JSONL ログには残る）。usage.json の durable record という要件のみが満たされない。

**contextMetrics との対比:**

`commitHalt`（逐次ハルトパス）は contextMetrics と sessionRollovers の両方を usage.json に書く（commit-orchestrator.ts 587–629）。並列ラウンドの halt メンバーはどちらも書かない。本 PR 前は sessionRollovers が存在しなかったため gap が顕在化しなかった。

**修正の方向（参考）:**

`commitRound` の halt メンバー処理に、`commitHalt` の usage 追記ブロック（lines 587–606）と同等のループを best-effort で追加する。`deps.cwd` / `deps.slug` の条件チェックが必要。

---

## 確認済み不変条件（iteration 4・全量）

| 確認項目 | ファイル / 行 | 状態 |
|---------|------------|------|
| F1: throw 経路が rollover ループ内 try-catch で捕捉（iter-3 修正） | agent-runner.ts 1007–1125 | ✅ green |
| F2: budget 枯渇時 observeResult/markExhaustion 二重呼出し除去（iter-3 修正） | agent-runner.ts 1254–1259 | ✅ green |
| F3: writeSummary undefined sessionId（iter-3 修正） | agent-runner.ts 1503–1509 | ✅ green |
| F-NEW-1: post-success halt 3 種の sessionRollovers 転記（iter-3 修正） | executor.ts 405/426/470 | ✅ green |
| abort ガード: timeout / watchdog 中に rollover しない | agent-runner.ts 1034 | ✅ green |
| `capturedToolResult = null` が throw/result 両ロールオーバーパスでリセット | agent-runner.ts 1063 / 1177 | ✅ green |
| `resumeFallbackDone = true` で resume→fresh 二重発火防止 | agent-runner.ts 1064 / 1178 | ✅ green |
| `delete queryOptions["resume"]` で fresh session に resume なし | agent-runner.ts 1061 / 1175 | ✅ green |
| `finalizeStepArtifacts` は成功経路のみ 1 回（executor.ts） | executor.ts 446–473 | ✅ green |
| `TRANSIENT_TOKENS` 不変（transient-error.ts 未修正） | transient-error.ts | ✅ green |
| prompt 末尾の completion directive 不変条件（rollover 後も同順） | agent-runner.ts 1074–1076 / 1187–1190 | ✅ green |
| `touchedFileMessages` がロールオーバーを跨いで蓄積継続 | agent-runner.ts 793–796 / tasks T-04 | ✅ green |
| `agentRedirectCounter` 共有（意図的設計） | agent-runner.ts 728 | ✅ green |
| makeTimeoutHalt が sessionRollovers を転記 | step-halt.ts 173–175 | ✅ green |
| makeNonSuccessHalt が sessionRollovers を転記 | step-halt.ts 209–211 | ✅ green |
| CommitOrchestrator.commitHalt が sessionRollovers 分を best-effort 追記 | commit-orchestrator.ts 587–606 | ✅ green |
| CommitOrchestrator.applySuccessPostPersistEffects が sessionRollovers 分を追記 | commit-orchestrator.ts 268–286 | ✅ green |
| commitRound 成功メンバーが sessionRollovers を usage.json に書く | commit-orchestrator.ts 768–769 → applySuccessPostPersistEffects | ✅ green |
| rollover-prompt.ts が git commit/push を促す文言を含まない | rollover-prompt.ts 40–41 | ✅ green |
| budget 枯渇時の即 return で post-loop 処理をスキップ（二重処理なし） | agent-runner.ts 1097–1119 | ✅ green |
| contextObserver が session ごとに新規生成（D7 分離） | agent-runner.ts 1067 / 1181 | ✅ green |
| isContextExhaustionError() が新 classifier を追加せず唯一の判定正本 | context-observer.ts 34–41 | ✅ green |
| transientRetryAttempts が rollover 跨ぎで累積維持（operator 裁定 4） | agent-runner.ts 853 (リセットなし) | ✅ green |
| makeAgentThrowHalt が sessionRollovers を転記しない → SpecRunnerError は rollover 前にのみ発生するため無害 | executor.ts 356–361 / agent-runner.ts 1566 | ✅ 問題なし |
| sessionLogWriter が rollover 跨ぎで単一ファイルに継続書き込み → DEBUG 用、per-session 分離は summary で対処済み | agent-runner.ts 797–807 | ✅ 設計内 |

---

## エビデンスサマリー

| 確認項目 | checked | 状態 |
|---------|---------|------|
| F-NEW-1: post-success halt 3 種（解消確認） | ✓ | 解消済み |
| F-NEW-2: commitRound halt メンバーの sessionRollovers 欠落 | ✓ | NEW LOW |
| abort ガード | ✓ | green |
| finalizeStepArtifacts 単一呼出し | ✓ | green |
| TRANSIENT_TOKENS 不変 | ✓ | green |
| capturedToolResult / sessionId リセット | ✓ | green |
| prompt 末尾 completion directive 不変条件 | ✓ | green |
| COMMIT_DISCIPLINE（rollover-prompt.ts） | ✓ | green |
| contextObserver per-session 分離 | ✓ | green |
| isContextExhaustionError() 唯一正本 | ✓ | green |
| transientRetryAttempts 累積維持 | ✓ | green |
| commitRound 成功メンバーの sessionRollovers 書き込み | ✓ | green |
| makeAgentThrowHalt 非害確認 | ✓ | green |

計: checked=13, skipped=0, unverified=0
