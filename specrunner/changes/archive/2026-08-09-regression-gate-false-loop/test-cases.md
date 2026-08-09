# Test Cases: regression-gate を新規退行の検出に限定する

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 10, should: 3, could: 0

---

### TC-001: approved 経路の未修正 low finding は needs-fix にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate は既知未修正 finding を退行事由にしない > Scenario: approved 経路の未修正 low finding は needs-fix にならない

---

### TC-002: 既知未修正が全件一致する場合は approved

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: regression-gate は既知未修正 finding を退行事由にしない > Scenario: 既知未修正が無ければ空 ledger と同じく approved

---

### TC-003: 新規検出の退行は needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate は新規退行に needs-fix を返す > Scenario: 新規検出の退行は needs-fix

---

### TC-004: 修正済み finding の退行は needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate は新規退行に needs-fix を返す > Scenario: 修正済み finding の退行は needs-fix

---

### TC-005: standard reviewer path の routing は low を除外する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: LOW 除外は routing 層 1 箇所で表現し code-fixer prompt は severity 再フィルタしない > Scenario: standard reviewer path の routing は low を除外する

---

### TC-006: code-fixer prompt に severity 再フィルタ行が存在しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: LOW 除外は routing 層 1 箇所で表現し code-fixer prompt は severity 再フィルタしない > Scenario: code-fixer prompt に severity 再フィルタ行が存在しない

verification command: `grep -rn "Ignore LOW severity" src/` が exit 0 かつ出力 0 件

---

### TC-007: regression-gate-system.ts に「修正した findings」記述が残っていない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: regression-gate の ledger 説明が実装の実態と一致する > Scenario: 「修正した findings」記述が残っていない

verification command: `grep -n "were fixed during this job\|code-fixer が修正した\|修正した fixable findings" src/prompts/regression-gate-system.ts src/core/step/regression-gate.ts` が 0 件

---

### TC-008: selectFixerTargetFindings は low fixable を除外し high/medium fixable を保持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** findings 配列として `[{severity:"low", resolution:"fixable"}, {severity:"high", resolution:"fixable"}, {severity:"medium", resolution:"fixable"}, {severity:"low", resolution:"decision-needed"}]` が与えられる
**WHEN** `selectFixerTargetFindings(findings)` を呼ぶ
**THEN** 返り値は `[{severity:"high", resolution:"fixable"}, {severity:"medium", resolution:"fixable"}]` のみ（low は resolution 不問で除外、非 fixable も除外）

---

### TC-009: excludeKnownUnfixedRegressions は fingerprint 一致の low ledger エントリで gate finding を除外する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `gateFindings = [{file:"A.ts", line:10, title:"T", severity:"high", resolution:"fixable"}]`
**And** `ledger = [{file:"A.ts", line:10, title:"T", severity:"low", resolution:"fixable"}]`（fingerprint `"A.ts|10|T"` が一致）
**WHEN** `excludeKnownUnfixedRegressions(gateFindings, ledger)` を呼ぶ
**THEN** 返り値は `[]`（ledger の low エントリが既知未修正集合を構成し、gate finding が除外される）

---

### TC-010: excludeKnownUnfixedRegressions は fingerprint 不一致の場合は除外しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `gateFindings = [{file:"B.ts", line:1, title:"T", severity:"high", resolution:"fixable"}]`
**And** `ledger = [{file:"A.ts", line:1, title:"T", severity:"low", resolution:"fixable"}]`（file が異なり fingerprint 不一致）
**WHEN** `excludeKnownUnfixedRegressions(gateFindings, ledger)` を呼ぶ
**THEN** 返り値は gateFindings をそのまま返す（除外なし）

---

### TC-011: computeRegressionLedger は regression-gate の skipWhen/buildMessage と同一の dedupe 結果を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** spec-review ledger エントリと standard reviewer ledger エントリが重複を含む state が存在する
**WHEN** `computeRegressionLedger(reviewerChain, state)` を呼ぶ
**THEN** 返り値が `collectSpecReviewLedger(state)` と `collectFindingsLedger(reviewerChain, state)` を `dedupeFindings` で合成した結果と一致する

---

### TC-012: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

verification command: `typecheck && test` が exit 0 で完了する（新規テスト追加 + 既存テスト無改変の両方を通す）

---

### TC-013: 既存テストの期待値変更が design.md の列挙（0 件）と一致する

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D4: 既存テストの期待値変更

verification command: `git diff main -- "src/**/*.test.ts" "src/**/*.test-d.ts"` で既存テストファイルに期待値の変更行がないこと（design.md が「期待値変更が必要な既存テスト = 0 件」と宣言しているため、変更は追加テストのみであること）

---

## Result

```yaml
result: completed
total: 13
automated: 9
manual: 0
must: 10
should: 3
could: 0
blocked_reasons: []
```
