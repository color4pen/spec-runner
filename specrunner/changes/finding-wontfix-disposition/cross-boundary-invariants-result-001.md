# Cross-Boundary-Invariants Review: finding-wontfix-disposition

**Reviewer**: cross-boundary-invariants
**Iteration**: 1
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

diff 対象: `src/state/schema/types.ts`, `src/core/decision/wontfix.ts`, `src/core/pipeline/findings-ledger.ts`, `src/core/step/custom-reviewer-round-context.ts`, `src/core/design-layer/topic-emission.ts`, `src/core/command/resume.ts`, `src/cli/resume.ts`, `src/cli/command-registry.ts` ほか

---

## Verified: correctly handled invariants

### 1. `custom-reviewer-round-context.ts:198-207` — `selectedOption` アクセス保護

`deriveOperatorAdjudicationContext` が `.filter((d) => d.kind !== "disposition")` を挿入してから `.map(d => ({ ..., selectedOption: d.selectedOption.label }))` を実行している。disposition arm に `selectedOption` は存在しないが、filter が先行するので undefined アクセスは起きない。✓

### 2. `topic-emission.ts:179-189` — `matchedDecision.selectedOption` narrowing guard

`findMatchingDecision` が disposition record を返した場合、`"selectedOption" in matchedDecision` ガードが false になり selectedOption にアクセスしない。✓

### 3. `collectFindingsLedger` での per-step `filterUndecidedFindings` 適用 (T-04/D5)

disposition record の `step` は必ず reviewerChain step (code-review / custom reviewer) なので、`collectSpecReviewLedger` の spec-review findings とは step が一致せず誤除外は起きない。✓

### 4. `isFindingDecided` / `filterUndecidedFindings` — kind を見ずに step + findingKey 照合

両 arm に `step` / `findingKey` が揃っており、既存の照合ロジックが disposition arm にも自動適用される。step-completion の verdict 導出前 `filterUndecidedFindings` が disposition record に効くことを TC-012 が固定している。✓

### 5. 後方互換 — `kind` 省略の既存レコード

inbox planner が `kind` を付けずに push している既存コードは `OptionDecisionRecord`（`kind?: "option"`）として TypeScript が受理する。TC-001 が既存テスト無変更 green を確認している。✓

### 6. all-or-nothing 保証 — decisions への書き込みは persist 前に検証

`resolveWontfixDispositions` は純関数で状態を変更せず、`PrepareError(2)` は persist の前に throw される。partial write は起きない。✓

---

## Findings

### Finding A: `approved + fixable → code-fixer` 遷移ガードが disposition 後に初めて発火する

**不変条件の破れ**: `buildReviewerChainTransitions`（順次チェーン）および `buildParallelReviewerTransitions`（code-review 行）の遷移ガードは、reviewer の `approved` verdict + raw StepRun fixable findings の組み合わせで code-fixer へルーティングする。

```ts
// src/core/pipeline/reviewer-chain.ts:165-177
transitions.push({
  step: reviewer,
  on: "approved",
  to: STEP_NAMES.CODE_FIXER,
  when: (s) => {
    const findings = lastFindingsOf(s, reviewer);  // raw StepRun, not decisions-filtered
    return collectFixableFindings(findings).length > 0;
  },
});
```

**変更前の暗黙の前提**: `decisions` には `option` レコード（decision-needed 由来）しか存在しなかった。fixable finding が `filterUndecidedFindings` で除外されることは実質なかった。したがって `reviewer approved` ↔ "raw StepRun に fixable finding が存在しない" は成立しており、上記 `when` ガードが `approved` 時に true を返すことはなかった（dead code）。

**変更後**: disposition record が fixable finding をキーとして decisions に入るため、`filterUndecidedFindings` が fixable finding を除外できる。reviewer は wontfix'd 唯一の finding しか持たない場合でも `approved` になる。その結果 raw StepRun には fixable finding が残ったまま verdict が `approved` になり、上記 `when` ガードが初めて true を返す。code-fixer が意図せず起動する。

**影響の範囲**:

- 主要ユースケース（operator が `--from regression-gate` で resume）では reviewer は再実行されないため、**通常この遷移は発火しない**。
- reviewer ステップから resume した場合や、livelock 解消後の pipeline がレビュー経路を通過する場合には発火し、wontfix 済み finding を修正しようと code-fixer が呼ばれる。
- code-fixer は `approved` を返し、遷移は `code-fixer → next(reviewer)` に進む（reviewer の last verdict が `approved` のため）。**livelock は発生しない**。ただし code-fixer が wontfix'd finding への不要な修正を試みる可能性がある。

**同じパターンが `buildParallelReviewerTransitions` の code-review 行にも存在する**（`src/core/pipeline/reviewer-chain.ts:350-363`）。

---

### Finding B: `collectParallelFixerFindings` が decisions を参照しない

```ts
// src/core/pipeline/findings-ledger.ts:85-119
export function collectParallelFixerFindings(state, members, canonScope?) {
  for (const name of members) {
    // ...verdict === "needs-fix" のメンバーだけ収集
    const fixable = collectFixableFindings(findings);
    all.push(...fixable);  // filterUndecidedFindings なし
  }
```

`collectFindingsLedger`（regression-gate 入力）は per-step で `filterUndecidedFindings` を適用するが、coordinator loop の code-fixer 入力（`collectParallelFixerFindings`）は同様のフィルタを持たない。coordinator が `needs-fix` を返す理由が non-wontfix'd finding であっても、wontfix'd finding が code-fixer input に混入する。

**影響**: verdict 導出は step-completion の `filterUndecidedFindings` が正しく処理するため verdict 破損・livelock はない。ただし code-fixer が wontfix'd finding を受け取り、不要な修正を試みる可能性がある。Finding A と根拠を共有する別の発火経路。

---

## Evidence Summary

| 観点 | 確認内容 | 結果 |
|------|---------|------|
| `custom-reviewer-round-context.ts` union narrowing | `kind !== "disposition"` filter でクラッシュ防止 | ✓ 正常 |
| `topic-emission.ts` selectedOption guard | `"selectedOption" in matchedDecision` ガード | ✓ 正常 |
| `filterUndecidedFindings` が disposition arm に効く | TC-012 | ✓ テスト固定 |
| `collectFindingsLedger` exclusion | TC-009/010/011 | ✓ テスト固定 |
| all-or-nothing 保証 | PrepareError(2) を persist 前に throw | ✓ 正常 |
| 後方互換 | `kind` 省略レコードが option として読める | ✓ 正常 |
| 遷移ガード (`approved + fixable → code-fixer`) | raw findings を見てフィルタなし | ⚠ Finding A |
| `collectParallelFixerFindings` decisions 参照なし | coordinator loop の code-fixer 入力 | ⚠ Finding B |

