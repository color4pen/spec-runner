# Regression Gate — Evidence Report (Iteration 1)

## Finding 1: [MEDIUM] regression-gate buildMessage の severity=high 指示

**File**: `src/core/step/regression-gate.ts:160`

**Verification**: STILL PRESENT (not fixed)

Line 160 of the current branch code reads:

```
3. Report any regressions (findings that are back) with severity=high / resolution=fixable.
```

After D2 abolished `excludeKnownUnfixedRegressions`, LOW-severity ledger entries are now passed verbatim to `buildFindingsBlock` and appear in the agent's view with `[LOW]` labels. The prompt's step 3 instruction still says `severity=high`, which:
- May cause the agent to misinterpret `[LOW]` entries as "intentionally-unfixed legacy" findings
- Semantically changes any LOW regression into a HIGH-severity report without making that explicit

The text was not updated as part of this change set.

---

## Finding 2: [LOW] regressionGateActive の approved+fixable 分岐が dead code

**File**: `src/core/pipeline/reviewer-chain.ts:272`

**Verification**: STILL PRESENT (not fixed)

Lines 272–278 of the current branch code:

```typescript
if (verdict === "approved") {
  // findings-routing: approved but had fixable findings
  const toolResult = last.outcome.toolResult as { findings?: ... } | null | undefined;
  const findings = toolResult?.findings ?? [];
  return collectFixableFindings(findings).length > 0;
}
```

After D2 (abolishment of `excludeKnownUnfixedRegressions`), `deriveRegressionGateVerdict` guarantees that any `fixable` finding → `needs-fix`. Therefore the regression-gate can never return `approved` while fixable findings remain in `toolResult`. The branch condition at line 272 is structurally unreachable. The comment ("regression-gate approved BUT had fixable findings (findings-routing path)") also documents a state that can no longer occur.

The branch was not removed as part of this change set.

---

## Summary

| Finding | File | Line | Status |
|---------|------|------|--------|
| MEDIUM — severity=high prompt instruction not updated for LOW ledger entries | regression-gate.ts | 160 | **Still present** |
| LOW — regressionGateActive approved+fixable branch is dead code | reviewer-chain.ts | 272 | **Still present** |

Both findings from the review ledger remain unaddressed in the current branch.
