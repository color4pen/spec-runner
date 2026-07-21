# Regression Gate — Evidence Report (Iteration 2)

## Scope

Verifying that 5 findings from the iteration-1 review are still fixed in the current code.

---

## Finding 1 [LOW] — EVIDENCE_COUNTS_DEFINITION に "escalation" が含まれ D6 の設計意図と乖離

**File**: `src/prompts/judge-rules.ts:99`

**Verification**: Current line 99 reads:

```
- `checked === 0` は「判定不能」として扱われます。何かしら検証した場合は checked に実測値を記入してください。
```

"escalation" の文字列は含まれていない。「判定不能として扱われます」のみ。D6 の設計意図と合致。

**Status**: STILL FIXED ✓

---

## Finding 2 [LOW] — collectFindingsLedger パラメータ順序変更はスコープ外

**File**: `src/core/pipeline/findings-ledger.ts:28`

**Verification**: コードは `(reviewerChain, state)` 順を維持。対応として両 ADR を更新済み（下記 Finding 5 と同根）。git diff 確認:

- `findings-ledger.ts`: `(reviewerChain: string[], state: JobState)` — 実装はそのまま
- ADR 2026-06-12 line 57: `collectFindingsLedger(reviewerChain, state)` — 新順序に更新済み
- ADR 2026-07-14 line D3: `collectFindingsLedger(deriveImplReviewerChain(state), state)` — 新順序に更新済み

実装と文書が一致した状態が維持されている。

**Status**: STILL FIXED ✓

---

## Finding 3 [MEDIUM] — EVIDENCE_COUNTS_DEFINITION が 'escalation' を断定するが deriveRegressionGateVerdict は vacuous ルールを適用しない

**File**: `src/prompts/judge-rules.ts:99`

**Verification**: Finding 1 と同一ソース。現行の `EVIDENCE_COUNTS_DEFINITION` 末尾は:

```
- `checked === 0` は「判定不能」として扱われます。何かしら検証した場合は checked に実測値を記入してください。
```

"escalation になります" の文言は存在しない。D6 の「具体的 routing を断定しない」方針に適合。

**Status**: STILL FIXED ✓

---

## Finding 4 [LOW] — isJudgeStep 診断が 'escalation' を誤報する

**File**: `src/core/step/step-completion.ts:163`

**Verification**: 現行コード（line 152–165）:

```typescript
if (tr.evidence?.checked === 0) {
  stderrWrite(`[${step.name}] vacuous check: checked=0 — 検証実績ゼロのため判定不能として扱われます`);
}
```

conformance ブランチ（line 151–153）、judge ブランチ（line 163–165）の両方で "escalation" でなく「判定不能として扱われます」を出力。regression-gate のように `judgeVerdictFn` オーバーライドを持つ step でも誤情報を提示しない。

**Status**: STILL FIXED ✓

---

## Finding 5 [LOW] — ADR が旧シグネチャ (state, chain) を参照している

**Files**: `specrunner/adr/2026-07-14-reduce-added-agent-turns.md:61`, `specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md:57`

**Verification**: git diff で両 ADR の変更を確認:

- `2026-06-12` line 57: `collectFindingsLedger(state, reviewerChain)` → `collectFindingsLedger(reviewerChain, state)` に更新済み
- `2026-07-14` line 10: `collectFindingsLedger(state, reviewerChain)` → `collectFindingsLedger(reviewerChain, state)` に更新済み
- `2026-07-14` line D3: `collectFindingsLedger(state, deriveImplReviewerChain(state))` → `collectFindingsLedger(deriveImplReviewerChain(state), state)` に更新済み

現行実装シグネチャ `(reviewerChain, state)` と ADR 記述が一致。

**Status**: STILL FIXED ✓

---

## Summary

全 5 件の修正が iteration 2 コードで維持されていることを確認。退行なし。

| # | Severity | File | Status |
|---|----------|------|--------|
| 1 | LOW | judge-rules.ts:99 | FIXED |
| 2 | LOW | findings-ledger.ts:28 | FIXED |
| 3 | MEDIUM | judge-rules.ts:99 | FIXED |
| 4 | LOW | step-completion.ts:163 | FIXED |
| 5 | LOW | ADR files | FIXED |

evidence: checked=5, skipped=0, unverified=0
