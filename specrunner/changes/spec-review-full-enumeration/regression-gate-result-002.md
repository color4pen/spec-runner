# Regression Gate Result — Iteration 2

## Checked findings

### [LOW] StepOutcome.commitOid は参照されない dead スキーマフィールド

**File**: src/state/schema/types.ts:173  
**Status**: FIXED

`StepOutcome` インターフェース（lines 122–167）には `commitOid` フィールドが存在しない。
`commitOid?: string` は `StepRun` トップレベル（line 209）に配置されており、オーケストレーターが読む位置と一致している。
`StepOutcome` に dead フィールドは残っていない。

---

### [LOW] TC-022: priorStepRun.outcome.commitOid を設定しているが orchestrator は stepRun.commitOid（トップレベル）を読む

**File**: tests/unit/core/step/spec-review-scope-exclusion.test.ts:147  
**Status**: FIXED

`priorStepRun` の構築（lines 145–156）で `commitOid: PRIOR_COMMIT_OID` をトップレベルに配置済み。
`outcome` には `commitOid` フィールドなし（verdict / findingsPath / error のみ）。

加えて lines 284–290 で `priorOid` のアサートが追加されており、
「オーケストレーターが正しい `priorOid` を解決して渡す」経路が機械検証されている。

---

## Evidence

- checked: 2
- skipped: 0
- unverified: 0

No regressions detected.
