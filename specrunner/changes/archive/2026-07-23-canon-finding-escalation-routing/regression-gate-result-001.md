# Regression Gate Evidence — canon-finding-escalation-routing — Iteration 1

## Verification Summary

Verified 4 findings from the ledger against the current branch HEAD.
All 4 findings remain present in the code. Code-fixer returned "approved" without applying fixes
(it skipped all 3 LOW findings per configured policy; Finding 4 MEDIUM arrived from the
cross-boundary-invariants reviewer after code-fixer had already run and was never delivered to it).

## Evidence per Finding

### Finding 1 (LOW) — escalationReason の後因果判定: ok=false + 正典 finding 共存で誤付与

**File**: src/core/step/step-completion.ts:280  
**Status**: ❌ Not fixed

```typescript
// step-completion.ts:280
if (verdict === "escalation" && lastUndecidedFindings !== null) {
  const resolver = lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer;
  const unroutable = selectUnroutableCanonFindings(lastUndecidedFindings, canonScope, resolver);
  if (unroutable.length > 0) {
    escalationReason = buildCanonEscalationReason(unroutable);
  }
}
```

When `ok=false`, `verdictFn` (e.g. `deriveRegressionGateVerdict`) returns "escalation" immediately
at priority #1 (line 160 of judge-verdict.ts: `if (!ok) return "escalation"`). However,
`lastUndecidedFindings` was already set from the judge path (step-completion.ts ~line 193-196).
The post-verdict `selectUnroutableCanonFindings` call at line 282 filters only for
`resolution === "fixable"` and will find any unroutable canon findings, incorrectly setting
`escalationReason` even though escalation was caused by `ok=false`. The condition does not
distinguish the actual cause of escalation.

---

### Finding 2 (LOW) — judgeVerdictFn コメントの陳腐化: deriveRegressionGateVerdict の引数数

**File**: src/core/port/step-types.ts:281  
**Status**: ❌ Not fixed

```typescript
// step-types.ts:281-282 (current)
* The evidence parameter is optional — functions with only 2 arguments (e.g. deriveRegressionGateVerdict)
* are still assignable to this type because JavaScript silently ignores extra arguments.
```

`deriveRegressionGateVerdict` now accepts 4 parameters
(`findings: Finding[], ok: boolean, evidence?: Evidence, canonScope?: CanonWriteScope`), as visible
in judge-verdict.ts:154-159. The comment's example "functions with only 2 arguments" is factually
incorrect. The assignability claim itself remains true (optional parameters are backward compatible),
but the illustrative example is stale and misleading.

---

### Finding 3 (LOW) — TC-023 未実装: 非 canon 由来 escalation で escalationReason が未設定

**File**: tests/unit/core/step/  
**Status**: ❌ Not fixed

Searched all new test files added in this branch:
- tests/unit/core/step/canon-escalation.test.ts
- tests/unit/core/step/canon-write-scope.test.ts
- tests/unit/core/step/judge-verdict-canon.test.ts
- tests/unit/core/pipeline/findings-ledger-canon.test.ts
- tests/unit/core/pipeline/pipeline-fatal-codes.test.ts

None implements TC-023 ("非 canon 由来 escalation で StepCompletion.escalationReason は未設定").
The `deriveStepCompletion` integration path for `escalationReason` is not covered by any unit test.
The `ok=false + unroutable canon finding` scenario (Finding 1) and the
`decision-needed + unroutable canon finding` scenario (Finding 4) both remain mechanically
undetectable without this test.

---

### Finding 4 (MEDIUM) — escalationReason の誤帰属: decision-needed + fixable canon finding 共存

**File**: src/core/step/step-completion.ts:280  
**Status**: ❌ Not fixed

Same structural location as Finding 1 but distinct scenario: `decision-needed` finding triggers
escalation at priority #3 in `deriveRegressionGateVerdict` (judge-verdict.ts:162:
`if (findings.some((f) => f.resolution === "decision-needed")) return "escalation"`), before the
canon check at priority #4 is ever evaluated. However, step-completion.ts:282 calls
`selectUnroutableCanonFindings(lastUndecidedFindings, ...)` after the verdict is already set.
`lastUndecidedFindings` contains all undecided findings including any fixable unroutable canon
finding that co-exists with the decision-needed finding. `selectUnroutableCanonFindings` filters
only for `resolution === "fixable"`, so it returns the canon finding, and `escalationReason` is
set. Operator sees CANON_FINDING_ESCALATION but the actual issue requires an architectural
decision, not a canon file edit.

The fix requires the verdict function (or a separate signal) to communicate WHY escalation was
returned, so step-completion.ts can only set `escalationReason` when the canon check itself
triggered the escalation (priority #4 path).

Note: code-fixer was never given this finding — it arrived from cross-boundary-invariants (which
ran after code-fixer) and was not included in the review-feedback-001.md that code-fixer received.
