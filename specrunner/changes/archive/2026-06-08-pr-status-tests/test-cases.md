# Test Cases: pr-status.ts ユニットテスト追加

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 11
- **Manual**: 2
- **Priority**: must: 11, should: 2, could: 0

---

### TC-001: fetchPrViewWithRetry — mergeStateStatus が CLEAN なら成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fetchPrViewWithRetry は mergeStateStatus を確認し UNKNOWN を retry する > Scenario: mergeStateStatus が CLEAN なら成功

---

### TC-002: fetchPrViewWithRetry — getPullRequest が throw なら escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fetchPrViewWithRetry は mergeStateStatus を確認し UNKNOWN を retry する > Scenario: getPullRequest が throw なら escalation

---

### TC-003: fetchPrViewWithRetry — UNKNOWN から retry して 2 回目で解決すれば成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fetchPrViewWithRetry は mergeStateStatus を確認し UNKNOWN を retry する > Scenario: UNKNOWN から retry して 2 回目で解決すれば成功

---

### TC-004: fetchPrViewWithRetry — UNKNOWN のまま全 retry 消尽で escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fetchPrViewWithRetry は mergeStateStatus を確認し UNKNOWN を retry する > Scenario: UNKNOWN のまま全 retry 消尽で escalation

---

### TC-005: fetchPrViewWithRetry — MERGED + UNKNOWN は retry せず即成功（bypass）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fetchPrViewWithRetry は mergeStateStatus を確認し UNKNOWN を retry する > Scenario: MERGED + UNKNOWN は retry せず即成功（bypass）

---

### TC-006: checkMergeableForMerge — mergeable が MERGEABLE なら成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkMergeableForMerge は mergeable を分岐し UNKNOWN を retry する > Scenario: mergeable が MERGEABLE なら成功

---

### TC-007: checkMergeableForMerge — mergeable が CONFLICTING なら escalation に baseBranch を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkMergeableForMerge は mergeable を分岐し UNKNOWN を retry する > Scenario: mergeable が CONFLICTING なら escalation に baseBranch を含む

---

### TC-008: checkMergeableForMerge — UNKNOWN から retry して 2 回目で MERGEABLE なら成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkMergeableForMerge は mergeable を分岐し UNKNOWN を retry する > Scenario: UNKNOWN から retry して 2 回目で MERGEABLE なら成功

---

### TC-009: checkMergeableForMerge — UNKNOWN のまま全 retry 消尽で escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkMergeableForMerge は mergeable を分岐し UNKNOWN を retry する > Scenario: UNKNOWN のまま全 retry 消尽で escalation

---

### TC-010: checkMergeableForMerge — getPullRequest が throw なら escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkMergeableForMerge は mergeable を分岐し UNKNOWN を retry する > Scenario: getPullRequest が throw なら escalation

---

### TC-011: sleepFn 注入で retry が実待ちを発生させない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 両関数は sleepFn 注入で wall-clock 待ちなしに retry を実行できる > Scenario: 注入した sleepFn が実待ちを置き換える

---

### TC-012: typecheck と test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04: 品質ゲートを green にする

**GIVEN** `tests/unit/core/finish/pr-status.test.ts` が追加されている  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** exit 0 でどちらも pass する

---

### TC-013: lint が green

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-04: 品質ゲートを green にする

**GIVEN** `tests/unit/core/finish/pr-status.test.ts` が追加されている  
**WHEN** `bun run lint` を実行する  
**THEN** exit 0、warning 0 で pass する

---

## Result

```yaml
result: completed
total: 13
automated: 11
manual: 2
must: 11
should: 2
could: 0
blocked_reasons: []
```
