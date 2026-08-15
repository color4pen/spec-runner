# Regression Gate Result — absorb-build-fixer (Iteration 3)

## Summary

**11 findings verified. 0 regressions. 0 contradictions.**

All ledger items from the previous review have been addressed in the current code.

---

## Finding Verification

### [LOW] D1: Approved verdict overturned ブロックの副作用が設計文書未記載

**File**: `specrunner/changes/absorb-build-fixer/design.md`

**Status**: ✅ FIXED

design.md の D1「副作用(guard 必須)」セクションが `currentStep === exhaustedReviewer` guard の存在、
発火条件、従来の code-review/spec-fixer 経路への影響不変を明示的に記述している。

---

### [LOW] T-05: from 経路での alias 適用順序が tasks.md に未記載

**File**: `specrunner/changes/absorb-build-fixer/tasks.md`

**Status**: ✅ FIXED

tasks.md T-05 AC に「`from` 経路で alias が `allowed.has()` 検証より前に適用されている(alias 後の名前が検証対象。`--from build-fixer` が「無効な step 名」で拒否されないこと)」と明記された。
実装 `resolve-step.ts:98` も `LEGACY_STEP_ALIASES[from]` を `allowed.has()` より前に適用しており一致する。

---

### [MEDIUM] TC-003/TC-004: 失敗内容が message に含まれることが未テスト

**File**: `tests/unit/absorb-build-fixer/implementer-recovery.test.ts`

**Status**: ✅ FIXED

- TC-003: `verificationContent あり → message に ## Verification Failures が含まれる` (line 145–166) が追加され、`expect(message).toContain("## Verification Failures")` で固定済み。
- TC-004: `fresh fallback でも verificationContent → message に ## Verification Failures が含まれる` (line 225–242) が追加され、同様に固定済み。

---

### [LOW] Stale JSDoc: reverificationNeeded が build-fixer を mutator として記述

**File**: `src/core/pipeline/reverification.ts`

**Status**: ✅ FIXED

reverification.ts line 92–93 の JSDoc は「an impl-phase mutator step (implementer / code-fixer)」と記述されており、build-fixer への言及がない。`IMPL_CODE_MUTATOR_STEPS` の実体（line 21–23）と一致している。

---

### [LOW] Stale file header: TC-003/TC-004 コメントが build-fixer を参照

**File**: `tests/unit/core/pipeline/pipeline.reverification.test.ts`

**Status**: ✅ FIXED

ファイル冒頭コメント（line 3–10）は:
- line 6: `TC-003: 再検証 failed は implementer へ流れる（recovery re-entry）`
- line 7: `TC-004: implementer 回復後に code-review 再入を経て adr-gen へ向かう（D4）`

build-fixer への言及はなく、implementer に正しく更新されている。

---

### [LOW] TC-015: verificationFailedLast 行の順序検証が不精確

**File**: `tests/unit/absorb-build-fixer/transitions.test.ts`

**Status**: ✅ FIXED

line 220–235 の TC-015 は `t.when === verificationFailedLast` で verificationFailedLast 行を直接ピンポイントし、`t.to === STEP_NAMES.BITE_EVIDENCE` で BITE_EVIDENCE 行を特定している。`findIndex(t.when !== undefined)` による間接的な検索ではなく、正確な関数参照比較で固定済み。

---

### [LOW] Design D3 fresh-fallback 逸脱: fresh session でも buildImplementerRecoveryMessage を使用

**File**: `src/core/step/implementer.ts`

**Status**: ✅ FIXED

implementer.ts の `buildMessage` (line 308–338) は:
- 前回 session あり (`getPreviousSessionId !== null`) → `buildImplementerRecoveryMessage`
- 前回 session なし (fresh fallback) → `buildImplementerInitialMessage` + failureSection 付与

fresh fallback で `buildImplementerInitialMessage` を使用する経路が正しく実装されており、D3 の設計意図と一致する。

---

### [LOW] Stale build-fixer references in unedited comment-only files

**File**: `src/core/verification/propagate.ts` 他

**Status**: ✅ FIXED

以下のファイルに build-fixer への言及がないことを確認:
- `src/core/verification/propagate.ts` — 「implementer re-entry (recovery mode)」に更新済み
- `src/core/verification/reload-coverage-config.ts` — マッチなし
- `src/core/verification/parse-result.ts` — マッチなし
- `src/core/step/staging-containment.ts` — マッチなし
- `src/core/step/commit-push.ts` — マッチなし
- `src/core/step/canon-write-scope.ts` — マッチなし
- `src/core/port/step-types.ts` — マッチなし
- `src/adapter/claude-code/agent-runner.ts` — マッチなし

---

### [LOW] STANDARD_TRANSITIONS の verificationFailedLast 行コメントが不正確

**File**: `src/core/pipeline/types.ts`

**Status**: ✅ FIXED

types.ts line 282 のコメントは:
```
// (first-match-wins: must precede unconditional BITE_EVIDENCE row; placed after isTestGenExempt row above)
```
「isTestGenExempt 行の後に配置」が明示されており、「must precede BITE_EVIDENCE row」かつ「placed after isTestGenExempt row」で正確。

---

### [MEDIUM] fixerNamesForReroute が spec-review approved → implementer (isTestGenExempt) を誤 intercept

**File**: `src/core/pipeline/pipeline.ts`

**Status**: ✅ FIXED

pipeline.ts line 467 に `currentStep === exhaustedReviewer` guard が実装されている:
```typescript
if (currentStep === exhaustedReviewer && budget.getFixerIter(budgetSkippedFixer) >= effectiveMaxReroute) {
```
spec-review → implementer 経路では `currentStep = "spec-review"` ≠ `exhaustedReviewer = "verification"` となるため、guard が false になり budget-skip は発火しない。

---

### [MEDIUM] currentStep === exhaustedReviewer guard のシナリオテストなし

**File**: `src/core/pipeline/pipeline.ts`

**Status**: ✅ FIXED

`tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` に TC-016 が追加された（line 1395–1560）。
- `loopFixerPairs = { "verification": "implementer" }` で verification 2 回失敗 → implementer recovery 2 回
- その後 verification pass → spec-review approved (isTestGenExempt=true for "chore") → implementer as creator
- guard なしでは `conformanceCallCount=1` になる（budget-skip が誤発火）ことを sabotage 記述で示し、
  guard あり時は `implementerCallCount=3`, `conformanceCallCount=0`, `budgetSkippedEvents=[]` を assert。
