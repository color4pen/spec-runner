# Regression Gate Result — Iteration 1

## Summary

7 findings checked. 6 fixed. 1 regression.

## Verified Findings

### ✅ [MEDIUM] T-05 persist 挿入点 — FIXED

`resume.ts` lines 238-261: `stateToWrite` が `appendOperatorAdjudication` の適用後に算出され、
worktree / no-worktree 両 path の `persist(stateToWrite)` に渡されている。
最初の「running」遷移 persist が裁定込みの state を 1 回にまとめて書き出す構造に修正済み。

### ✅ [MEDIUM] XML 特殊文字エスケープ — FIXED

`custom-reviewer-round-context.ts` lines 53-58 に `escapeXml` 関数が実装されており、
`buildOperatorAdjudicationBlock` 内で adjudications および decisions の全テキストフィールドに適用されている。
`design.md` Risks セクション (lines 175-179) に XML エスケープ要件が明示された。

### ✅ [LOW] decisions projection で resumeComment 除外理由 — FIXED

`tasks.md` T-03 lines 58-59 に除外理由を明記: "DecisionRecord.resumeComment は projection に含めない
（operatorAdjudications[*].text と内容が重複するため除外。operator の裁定文は text field 経由で注入される）"。

### ✅ [LOW] iteration 1 + non-empty decisions シナリオ — FIXED

`spec.md` lines 87-93 に新 Scenario が追加済み:
"iteration 1 かつ decisions が存在するとき前周 context block は注入されないが裁定 block は注入される"。

### ✅ [LOW] appendOperatorAdjudication シグネチャ — FIXED

`operations.ts` lines 52-58: シグネチャが `(state: JobState, record: OperatorAdjudication): JobState` に
整理されており、`JobState | Record<string, unknown>` のユニオン型は消えている。

### ✅ [MEDIUM] buildOperatorAdjudicationBlock — DecisionRecord フィールドの null ガード — FIXED

`deriveOperatorAdjudicationContext` lines 198-205: `d.finding.title`, `d.finding.file`,
`d.selectedOption.label`, `d.selectedOption.consequence`, `d.finding.rationale` の 5 フィールドに
`?? ""` フォールバックが追加されている。`decision-ledger.ts` の規律に準拠。

### ❌ [MEDIUM] decisions[i].step の ?? "" null ガード欠落 — REGRESSION

**File**: `src/core/step/custom-reviewer-round-context.ts` line 199

`deriveOperatorAdjudicationContext` 内:

```ts
const decisions = (state.decisions ?? []).map((d) => ({
  step: d.step,   // ← ?? "" ガードなし
  title: d.finding.title ?? "",
  ...
}));
```

`DecisionRecord.step` は型上 `string`（必須）だが、`validateJobState` は decisions エントリの内部フィールドを
検証しない。malformed な `state.json` で `d.step` が `undefined` になると、
`buildOperatorAdjudicationBlock` 内の `escapeXml(d.step)` が `undefined.replace(...)` → TypeError を
スローし、buildMessage → executor.produce() → step halt に伝播する。

前の code-fixer は 5 フィールドに `?? ""` を追加したが、`step` を見落とした（F-001 不完全修正）。

修正: `step: d.step ?? ""`

