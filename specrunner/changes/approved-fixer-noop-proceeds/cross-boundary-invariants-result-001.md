# Cross-Boundary-Invariants Review — approved-fixer-noop-proceeds — iter 1

## Verdict

- **verdict**: approved

---

## Scope

変更対象 3 ファイル:

- `src/core/pipeline/reviewer-chain.ts` — `codeReviewFindingsRoutingActive` 追加（41 行）
- `src/core/step/no-op-detect.ts` — `findingsRoutingApproved` param 追加（11 行）
- `src/core/step/executor.ts` — import + フラグ算出（6 行）

テスト 2 ファイル（新規）:

- `src/core/pipeline/__tests__/reviewer-chain.test.ts` — 163 行追加
- `src/core/step/__tests__/executor-no-op.test.ts` — 193 行追加

---

## Invariant Analysis

### INV-1: routing 遷移条件と predicate の対称性

routing（`buildReviewerChainTransitions` / `buildParallelReviewerTransitions`）が code-fixer を起動するときの条件は `collectFixableFindings(findings).length > 0`。`codeReviewFindingsRoutingActive` の条件 2 も同じ関数を同じ閾値で使う。「routing が true だったとき predicate が true を返す」という対称性は保たれており、「routing が送り込んだのに predicate が false を返して escalate する」逆方向の矛盾もない。

**問題なし。**

### INV-2: conformance-after-fixable（設計が識別した edge case 1）

条件 1（`getConformanceFixContext !== null`）の評価:

`getConformanceFixContext` は conformance の `endedAt` と predecessor（code-review）の `endedAt` を比較する recency 判定を持つ。code-review approved+fixable → code-fixer no-op exempt → conformance needs-fix:code-fixer → 2 回目の code-fixer というシーケンスでは、conformance の `endedAt` が code-review の `endedAt` より新しいため、`getConformanceFixContext` は non-null を返し、条件 1 が `false` → `codeReviewFindingsRoutingActive` は `false` → no-op は escalate される。

**問題なし。設計の Mitigation が正しく実装されている。**

### INV-3: coordinator / regression-gate 経路（設計が識別した edge case 2）

composed path では、routing 遷移表の構造的保証として **coordinator は code-review がクリーンな approved を返した後にのみ起動される**（fixable findings がある approved → code-fixer、fixable なし → coordinator という順序）。したがって coordinator が code-fixer を起動した時点では code-review の最新 verdict は `approved` + findings なしとなり、条件 2 が `false` → predicate は `false`。

ベルトとサスペンダー: 条件 3（`resolveActiveReviewer === CODE_REVIEW`）は、custom member や regression-gate の方が code-review より新しい `startedAt` を持つ場合に `false` を返し、coordinator / regression-gate 起動の fixer no-op を更に守る。

**問題なし。構造的保証 + 条件 3 の二重ガードが機能している。**

### INV-4: state のタイミング

`codeReviewFindingsRoutingActive(state)` は `executor.ts:563` で呼ばれる。この時点は `finalizeStepArtifacts`（コミット/プッシュ）後、`finalizeStep`（現 code-fixer 実行結果を state に書き込む）前。state には現 code-fixer の実行結果は含まれず、直前の code-review verdict が正しく反映されている。

**問題なし。**

### INV-5: needs-fix 経路の #734 検出維持

code-review verdict が `needs-fix` のとき、条件 2（`verdict === "approved"`）が即座に `false` を返す。`findingsRoutingApproved = false` → `detectNoOp` は従来通り `"needs-fix"` を返す。テスト Req 2 がこの回帰を明示的に固定している。

**問題なし。#734 は後退しない。**

### INV-6: `verdictOverride` の適用スコープ

`finalizeStep`（`executor.ts:860`）は `agentResult.verdictOverride !== undefined && verdict !== "error"` のときのみ override を適用する。code-fixer が error verdict を返した場合は `findingsRoutingApproved` の値にかかわらず override は適用されない。

**問題なし。error path は不変。**

### INV-7: 遷移表の不変性

本変更は no-op override の抑止のみで、遷移テーブル行の追加・変更は一切ない。`code-fixer approved → conformance/coordinator` の既存行が override 抑止後の `approved` verdict を受け取り、次段へ正しく前進させる。T-04 の acceptance criteria（遷移表変更なし）は実装で確認されている。

**問題なし。**

---

## Observations（非ブロッキング）

### OBS-1: `noOpDetect: true` と code-fixer identity の暗黙結合 [LOW]

`executor.ts:563` の `step.noOpDetect === true ? codeReviewFindingsRoutingActive(state) : false` は、`noOpDetect: true` を持つ将来のステップでも `codeReviewFindingsRoutingActive` を呼ぶ。現状 `noOpDetect: true` は `code-fixer.ts:119` のみで、JSDoc に「Consumer: executor's no-op override suppression」と明記されているため実害はない。将来の防衛的な書き方として `step.name === STEP_NAMES.CODE_FIXER` ガードを追加する選択肢はあるが、現設計範囲では対応不要。

---

## Summary

変更が暗黙に破る不変条件は発見されなかった。

1. routing と predicate の対称性（INV-1）✓
2. conformance-after-fixable の 2 回目誤 exempt（INV-2）✓  
3. coordinator/regression-gate 経路の誤 exempt（INV-3）✓  
4. state タイミング（INV-4）✓  
5. #734 needs-fix 後退なし（INV-5）✓  
6. error verdict の不変性（INV-6）✓  
7. 遷移表不変性（INV-7）✓  

テスト: 5840 件全 green（typecheck / lint / test 全 phase passed）。要件 1–4 の executor 統合テストおよび predicate 単体テストが追加されている。
