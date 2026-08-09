# Regression Gate Result — Iteration 2

## Summary

7 findings verified. 5 confirmed still fixed (including both HIGHs). Finding 6 (LOW) newly fixed by code-fixer between iterations. Findings 5 and 7 (LOW) remain intentionally not code-fixed per tasks.md design — safe and informational only.

---

## Finding-by-Finding Evidence

### [HIGH-1] computeRegressionLedger 間接循環 import

**Claimed fix**: `computeRegressionLedger(reviewerChain: string[], state, canonScope?)` takes reviewerChain from caller; findings-ledger.ts does NOT import reviewer-chain.ts.

**Verification**:
- `findings-ledger.ts` top-level imports: `judge-verdict.js`, `fixer-helpers.js`, `canon-escalation.js`, `step-names.js` — no `reviewer-chain.ts`. ✅
- `computeRegressionLedger` at `findings-ledger.ts:205-213` takes `reviewerChain: string[]` as first param, passes it to `collectFindingsLedger`. ✅
- `step-completion.ts:214`: calls `deriveImplReviewerChain(state)` and passes result to `computeRegressionLedger`. ✅
- No cycle: `findings-ledger.ts` → `reviewer-chain.ts` → `regression-gate.ts` → `findings-ledger.ts` path does not exist. ✅

**Status**: STILL FIXED — import cycle absent.

---

### [LOW-2] legacy findingsPath フォールバックパスの tasks.md 記述欠落

**Claimed fix**: tasks.md T-01 updated to explicitly scope legacy path as out-of-scope for `selectFixerTargetFindings`.

**Verification**:
- tasks.md T-01 last bullet reads: "legacy findingsPath フォールバックパス... `selectFixerTargetFindings`（`Finding[]` を受け取る純関数）の **適用対象外**とする。変更は `Ignore LOW severity findings` 行（`:293`）の削除のみ。このパスは旧形式 job の resume 専用で低頻度のため、LOW の明示除外なしの動作を許容する。" ✅

**Status**: STILL FIXED — scope limitation documented.

---

### [LOW-3] deriveRegressionGateVerdict docstring 乖離

**Claimed fix**: Docstring updated to reflect that step-completion.ts applies `excludeKnownUnfixedRegressions` before calling this function.

**Verification**:
- `judge-verdict.ts:209-213`: "Rationale: the caller (step-completion.ts) applies excludeKnownUnfixedRegressions before invoking this function, so the findings received here have already had known-unfixed entries (low-severity ledger items that were never routed to code-fixer) removed. Any remaining fixable finding therefore represents a genuinely new regression or a regression of a previously-fixed finding — both warrant needs-fix." ✅

**Status**: STILL FIXED — docstring matches implementation.

---

### [HIGH-4] approved + fixable 遷移が false loop を生む

**Claimed fix**: `persistToolResult.findings` filtered with `excludeKnownUnfixedRegressions` so the `approved+fixable → code-fixer` transition in reviewer-chain.ts does not fire on known-unfixed low entries.

**Verification**:
- `step-completion.ts:249-260`: After verdict, regression-gate–specific block applies `excludeKnownUnfixedRegressions` to `persistToolResult.findings` and overwrites `persistToolResult`. ✅
- `step-completion.ts:269`: verifyFindingRefs now uses `(persistToolResult ?? effectiveToolResult)` so the filtered findings are what gets checked. ✅
- `regressionGateActive` in reviewer-chain.ts reads persisted tool result; with low entries removed, `collectFixableFindings(toolResult.findings).length` returns 0 for approved+low-only cases → no loop. ✅
- reviewer-chain.ts itself was not changed (fix is in persistence layer). ✅

**Status**: STILL FIXED — false loop eliminated via persistence filter.

---

### [LOW-5] lastUndecidedFindings が pre-exclusion のまま escalation reason 計算に渡される

**Claimed fix**: N/A — tasks.md T-02 explicitly preserves this: "lastUndecidedFindings は従来通り整形前の undecidedFindings を保持する（escalationReason 用）."

**Verification**:
- `step-completion.ts:219`: `lastUndecidedFindings = undecidedFindings;` — pre-exclusion, unchanged by design. ✅ (design intent)
- escalationReason computation (lines 360-381): `isCanonEscalation` is false for all known gate escalation routes (ok=false / checked=0 / decision-needed / finding-ref override), so pre-exclusion findings in `lastUndecidedFindings` do not leak into escalation reason in practice.

**Status**: NOT fixed by code (intentional). Design decision preserved per tasks.md. No routing impact; currently safe per rationale.

---

### [LOW-6] verifyFindingRefs が effectiveToolResult（未フィルタ）を参照する

**Claimed fix**: Change line 269 from `effectiveToolResult` to `(persistToolResult ?? effectiveToolResult)`.

**Verification**:
- `step-completion.ts:269`: `const tr = (persistToolResult ?? effectiveToolResult) as JudgeReportResult | RequestReviewReportResult;` — now uses filtered persistToolResult. ✅
- For regression-gate steps, `persistToolResult` contains findings filtered by `excludeKnownUnfixedRegressions` (set at lines 253-260), so verifyFindingRefs now operates on verdict-relevant findings only. ✅

**Status**: FIXED — verifyFindingRefs now uses filtered persistToolResult. (Newly fixed between iteration 1 and 2.)

---

### [LOW-7] lastUndecidedFindings pre-exclusion (Iter 1 Finding 2 carryover)

**Claimed fix**: Same as Finding 5 — identical issue, different framing.

**Verification**: Same as Finding 5. tasks.md explicitly preserves pre-exclusion behavior. Currently harmless (all gate escalation routes yield isCanonEscalation = false).

**Status**: NOT fixed by code (intentional). Same design decision as Finding 5.

---

## Acceptance Criteria Spot Checks

| Criterion | Result |
|-----------|--------|
| `grep -rn "Ignore LOW severity" src/` = 0 hits | ✅ 0 hits confirmed |
| regression-gate-system.ts ledger description updated | ✅ "reviewer が指摘した fixable findings 全件（修正済みとは限らない）" |
| regression-gate.ts buildLedgerBlock updated | ✅ "identified by reviewers during this job. Not all may have been fixed." |
| No circular import findings-ledger → reviewer-chain | ✅ confirmed |
| persistToolResult filtered to prevent false loop | ✅ confirmed |
| verifyFindingRefs uses persistToolResult (filtered) | ✅ confirmed (newly fixed this iteration) |
| lastUndecidedFindings pre-exclusion (Findings 5, 7) | ⚠ Intentional per tasks.md — informational only, no routing impact |
