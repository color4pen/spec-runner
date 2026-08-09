# Regression Gate Result — Iteration 1

## Summary

7 findings verified. 4 confirmed fixed (including both HIGH). 1 LOW finding not applied (verifyFindingRefs still uses effectiveToolResult). 2 LOW findings intentionally left by design (lastUndecidedFindings pre-exclusion, per tasks.md).

---

## Finding-by-Finding Evidence

### [HIGH-1] computeRegressionLedger 間接循環 import

**Claimed fix**: `computeRegressionLedger(reviewerChain: string[], state, canonScope?)` takes reviewerChain from caller; findings-ledger.ts does NOT import reviewer-chain.ts.

**Verification**:
- `findings-ledger.ts` imports: `judge-verdict.js`, `fixer-helpers.js`, `step-names.js` — no `reviewer-chain.ts`. ✅
- `computeRegressionLedger` signature at `findings-ledger.ts:207` takes `reviewerChain: string[]` as first param. ✅
- `step-completion.ts:214` calls `deriveImplReviewerChain(state)` and passes result to `computeRegressionLedger`. ✅

**Status**: FIXED — cycle is absent.

---

### [LOW-2] legacy findingsPath フォールバックパスの tasks.md 記述欠落

**Claimed fix**: tasks.md T-01 updated to explicitly scope legacy path as out of scope for `selectFixerTargetFindings`.

**Verification**:
- tasks.md T-01 last bullet now reads: "legacy findingsPath フォールバックパス... `selectFixerTargetFindings`（`Finding[]` を受け取る純関数）の **適用対象外**とする。変更は `Ignore LOW severity findings` 行（`:293`）の削除のみ。このパスは旧形式 job の resume 専用で低頻度のため、LOW の明示除外なしの動作を許容する。" ✅

**Status**: FIXED — scope limitation is documented.

---

### [LOW-3] deriveRegressionGateVerdict docstring 乖離

**Claimed fix**: Docstring updated to reflect that `step-completion.ts` applies `excludeKnownUnfixedRegressions` before calling this function.

**Verification**:
- `judge-verdict.ts:209-213` now reads: "Rationale: the caller (step-completion.ts) applies excludeKnownUnfixedRegressions before invoking this function, so the findings received here have already had known-unfixed entries (low-severity ledger items that were never routed to code-fixer) removed. Any remaining fixable finding therefore represents a genuinely new regression..." ✅

**Status**: FIXED — docstring matches implementation.

---

### [HIGH-4] approved + fixable 遷移が false loop を生む

**Claimed fix**: `persistToolResult.findings` filtered with `excludeKnownUnfixedRegressions` so the `approved+fixable → code-fixer` transition in reviewer-chain.ts does not fire on known-unfixed low entries.

**Verification**:
- `step-completion.ts:249-260`: After verdict, a regression-gate–specific block applies `excludeKnownUnfixedRegressions` to `persistToolResult.findings` and overwrites `persistToolResult`. ✅
- `regressionGateActive` (reviewer-chain.ts) reads the persisted tool result; with low entries removed, `collectFixableFindings(toolResult.findings).length` will be 0 for approved+low-only cases. ✅
- reviewer-chain.ts itself was not changed (the fix is in persistence, not the transition condition). ✅

**Status**: FIXED — false loop eliminated via persistence filter.

---

### [LOW-5] lastUndecidedFindings が pre-exclusion のまま

**Claimed fix**: N/A — tasks.md T-02 **explicitly preserves** this: "lastUndecidedFindings は従来通り整形前の undecidedFindings を保持する（escalationReason 用）."

**Verification**:
- `step-completion.ts:219`: `lastUndecidedFindings = undecidedFindings;` — pre-exclusion, unchanged by design. ✅ (design intent)
- Finding rationale acknowledged: "regression-gate が escalation になる全ケースで isCanonEscalation = false となるため現状は無害."

**Status**: NOT fixed, intentionally. Design decision documented in tasks.md. No routing impact; escalation reason is informational only.

---

### [LOW-6] verifyFindingRefs が effectiveToolResult（未フィルタ）を参照する

**Claimed fix**: Change line 269 from `effectiveToolResult` to `(persistToolResult ?? effectiveToolResult)`.

**Verification**:
- `step-completion.ts:269`: `const tr = effectiveToolResult as JudgeReportResult | RequestReviewReportResult;` — **unchanged**. ✅
- `persistToolResult` (with filtered findings) is computed at lines 253-260, but the verifyFindingRefs block immediately following at line 269 still uses `effectiveToolResult` (unfiltered).
- The suggested one-line fix was not applied.

**Status**: NOT FIXED. verifyFindingRefs still operates on unfiltered effectiveToolResult. If a stale ledger entry (known-unfixed low) points to a deleted file, the overridden-to-escalation path remains reachable despite an approved verdict. Original finding severity: LOW.

---

### [LOW-7] lastUndecidedFindings pre-exclusion (Iter 1 Finding 2 carryover)

**Claimed fix**: Same as Finding 5 — identical issue, different framing.

**Verification**: Same as Finding 5. tasks.md explicitly preserves pre-exclusion behavior. Currently harmless (all gate escalation routes yield isCanonEscalation = false).

**Status**: NOT fixed, intentionally. Same design decision as Finding 5.

---

## Acceptance Criteria Spot Checks

| Criterion | Result |
|-----------|--------|
| `grep -rn "Ignore LOW severity" src/` = 0 hits | ✅ 0 hits confirmed |
| regression-gate-system.ts ledger description updated | ✅ "reviewer が指摘した fixable findings 全件（修正済みとは限らない）" |
| regression-gate.ts buildLedgerBlock updated | ✅ "identified by reviewers during this job. Not all may have been fixed." |
| No circular import findings-ledger → reviewer-chain | ✅ confirmed |
| persistToolResult filtered to prevent false loop | ✅ confirmed |
