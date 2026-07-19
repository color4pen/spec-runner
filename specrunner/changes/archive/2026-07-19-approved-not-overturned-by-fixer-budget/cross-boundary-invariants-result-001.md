# Cross-Boundary Invariants Review — approved-not-overturned-by-fixer-budget — iter 001

- **verdict**: approved
- **iteration**: 001

## 観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Findings

| # | Severity | Category | 対象 | 説明 |
|---|----------|----------|------|------|
| 1 | low | cross-boundary | `pipeline.ts:449` + `reviewer-chain.ts:265-279` | **`regressionGateActive` の implicit priority 依存**。budget-skip 後、regression-gate の state は `approved + fixable findings` のまま残る。後続で conformance が `needs-fix:code-fixer` を返して code-fixer が走ると、code-fixer の approved routing で `regressionGateActive(state)` が `true` を返す（regression-gate の最後の run は approved+fixable のため）。ただし Priority 1 の `conformanceFixInProgress` が正しく `true` を返し（`getConformanceFixContext` の recency 検査は code-fixer 自身でなく active reviewer = regression-gate の `endedAt` を比較基準にするため、regression-gate が conformance より前に走った事実は変わらない）、Priority 2 の `regressionGateActive` は上書きされる。budget-skip 以前は「regression-gate approved + fixable → fixer 突入 → budget 切れ escalation」で code-fixer が実際に走ることがなかったため、この false-positive は新たな実行経路でのみ発現する。conformanceFixInProgress の Priority 1 が正しく機能している限り問題ないが、両述語の暗黙の priority 依存が一層強まった点を記録しておく。 |

---

## 詳細分析

### I1: budget-skip の閾値判定が既存 exhaustion 検査と等価か

budget-skip ブロック（`pipeline.ts:449`）:

```
budget.getFixerIter(budgetSkippedFixer) >= resolveMaxIterations(resolvePairedReviewForFixer(state, budgetSkippedFixer, loopFixerPairs))
```

既存 fixer 突入前 exhaustion 検査（`pipeline.ts:563-566`）:

```
budget.getFixerIter(nextStep) >= resolveMaxIterations(resolvePairedReviewForFixer(state, nextStep, loopFixerPairs))
```

budget-skip 発火時点では `budgetSkippedFixer === nextStep`（まだ差し替え前）。かつ design.md に記載のとおり approved→fixer 間に episode reset は挟まらない（fixer は `loopNames` 非該当、reviewer は `loopFixerPairs` の key = paired-step 扱いでリセット対象外）。よって両者が参照する `getFixerIter` の値は同一。閾値計算も完全一致。**両検査は等価。✓**

### I2: budget-skip 後の episode-reset ブロック群への影響

budget-skip で `nextStep` が `code-fixer` から `conformance`（または `coordinator`）に差し替わった後の各ブロック:

- **Loop step → fixer episode reset（lines 501-515）**: `loopNames.includes("conformance") = false` → `pairedFixerForNext = undefined` → no-op。✓
- **Unpaired step → fixer episode reset（lines 517-528）**: `currentStep = reviewer` は `loopFixerPairs` の key → 条件 `!(currentStep in loopFixerPairs)` = false → no-op。✓
- **Loop 突入前 exhaustion（lines 543-553）**: `loopNames.includes("conformance") = false` → no-op。✓
- **Fixer 突入前 exhaustion（lines 556-567）**: `fixerNames.has("conformance") = false` → no-op。✓

budget-skip 後の全下流 bookkeeping が差し替え後 `nextStep` に対して正しく no-op になる。**✓**

### I3: conformance → code-fixer 経路での episode-reset による fixer 予算リセット

budget-skip で conformance に到達し、conformance が `needs-fix:code-fixer` を返した場合:
- `currentStep = "conformance"` は `loopFixerPairs` の key でない
- `fixerNames.has("code-fixer") = true`
- Unpaired step → fixer episode reset が発火し `budget.resetFixerStep("code-fixer")` が走る

すなわち regression-gate フェーズで使い切った code-fixer 予算は、conformance が code-fixer を起動した時点でリセットされる。この挙動は **budget-skip の有無に関わらず既存挙動と同じ**（conformance は常に unpaired step）。conformance 起因 fix は常に fresh な fixer 予算で走る。✓

### I4: clean 遷移先の取得ロジックと transition table の構造的保証

`cleanTransition` lookup（`pipeline.ts:453-461`）は:
1. `t.step === currentStep && t.on === "approved"` — 当該 reviewer の approved 行
2. `!fixerNamesForReroute.has(t.to)` — code-fixer を除外
3. `t.to !== "end" && t.to !== "escalate"` — terminal 除外（防御的 filter）
4. `(!t.when || t.when(state))` — when guard pass

`buildReviewerChainTransitions` / `buildParallelReviewerTransitions` が生成する approved 行のうち、findings-routing 行は `to: code-fixer`（条件2 で除外）、clean 行は `to: next_reviewer / conformance / coordinator`（条件2・3 をパス、when 無し）。
各 reviewer に clean 行はちょうど1本存在し、findings-routing 行が array で先行するが `!fixerNames.has` により除外される。**transitions.find の first-match で正しく clean 行を得る。✓**

code-review が code-review reviewer として参照するコードは（`review-feedback-001.md` で Finding #1 として既出）：実運用 reviewer-chain に `approved → end` 直結行は存在せず弊害なし。

### I5: history エントリの永続化タイミング

budget-skip ブロック（line 471）は `appendHistoryEntry(state, warning)` でインメモリ更新のみ行い、その直後に `store.persist` を呼ばない。
その後 `transitionStore.appendHistory(state, transition)` が呼ばれ（`pipeline.ts:579`）、`appendHistory` 内部で `persist(updated)` が走る。この時点の `state` は warning エントリ込みのため、warning と transition 遷移の両方がアトミックに永続化される。**warning エントリは失われない。✓**

### I6: `needs-fix` escalation 挙動の不変性

budget-skip の発火条件 `outcome === "approved"` が必須条件1として先に評価される。verdict が `needs-fix` のまま fixer budget を使い切った場合はこの条件を満たさず、従来の `handleExhausted` パスへ素通りする。`LOOP_ERROR_CODES` の文言・`resumePoint` の書き込み・`awaiting-resume` 遷移は一切変更されていない。**`needs-fix` escalation は完全に不変。✓**

---

## 総合評価

実装はエンジン（`runInternal`）に閉じており、transition table・verdict 導出規則・`handleExhausted` のいずれも変更していない。
分析した全ての cross-boundary 相互作用（budget 等価性 / episode-reset / conformance 経路 / regressionGateActive priority / history 永続化）に問題なし。

Finding #1（`regressionGateActive` implicit priority 依存）は既存設計の性質が新しい実行経路で露出したものであり、`conformanceFixInProgress` が正しく Priority 1 として機能する限り実害なし。現時点での修正を要する欠陥ではない。
