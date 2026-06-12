# Test Cases: code 変更後の機械検証を pr-create 前に保証する

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 13, should: 6, could: 0

---

### TC-001: code-fixer の変更が pr-create 前に再検証される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 最後のコード変更を含む状態での機械検証が pr-create 前に成功していること > Scenario: code-fixer の変更が pr-create 前に再検証される

---

### TC-002: conformance needs-fix:code-fixer 経由の変更も再検証される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 最後のコード変更を含む状態での機械検証が pr-create 前に成功していること > Scenario: conformance needs-fix:code-fixer 経由の変更も再検証される

---

### TC-003: 再検証 failed は build-fixer へ流れる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 再検証が failed のとき build-fixer 経路へ遷移すること > Scenario: 再検証 failed は build-fixer へ流れる

---

### TC-004: build-fixer 回復後に再検証が通過して pr-create へ向かう

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 再検証が failed のとき build-fixer 経路へ遷移すること > Scenario: build-fixer 回復後に再検証が通過して pr-create へ向かう

---

### TC-005: fixer が走らない clean run では verification が一度だけ走る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: コード変更が起きていない run で再検証を追加しないこと > Scenario: fixer が走らない clean run では verification が一度だけ走る

---

### TC-006: 初回 verification passed は code-review へ向かう

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 初回 verification の遷移先が不変であること > Scenario: 初回 verification passed は code-review へ向かう

---

### TC-007: custom reviewer 構成で再検証行が保持される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: custom reviewer 構成でも保証が成立すること > Scenario: custom reviewer 構成で再検証行が保持される

---

### TC-008: codeChangedSinceLastVerification — code-fixer が verification より後なら true

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state に verification run（earlier endedAt）と code-fixer run（later endedAt）が存在する
**WHEN** `codeChangedSinceLastVerification(state)` を呼ぶ
**THEN** `true` を返す

---

### TC-009: codeChangedSinceLastVerification — verification が全 mutator より後なら false

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state に implementer run（earlier endedAt）と verification run（later endedAt）が存在し、以降に code-mutator run がない
**WHEN** `codeChangedSinceLastVerification(state)` を呼ぶ
**THEN** `false` を返す

---

### TC-010: codeChangedSinceLastVerification — verification 不在で mutator あり → true

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state に implementer run が存在し、verification run が一度も存在しない
**WHEN** `codeChangedSinceLastVerification(state)` を呼ぶ
**THEN** `true` を返す

---

### TC-011: codeChangedSinceLastVerification — 非 code-mutator step の run は述語を true 化しない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state に verification run（later endedAt）が存在し、verification より後に custom reviewer / conformance / regression-gate / adr-gen の run があるが、`IMPL_CODE_MUTATOR_STEPS` の run は verification より前のみ
**WHEN** `codeChangedSinceLastVerification(state)` を呼ぶ
**THEN** `false` を返す（code-mutator 集合外の step は mTime に影響しない）

---

### TC-012: conformanceApprovedLatest — 最新 verdict が approved → true

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state の `conformance` runs の末尾 run に `outcome.verdict === "approved"` が存在する
**WHEN** `conformanceApprovedLatest(state)` を呼ぶ
**THEN** `true` を返す

---

### TC-013: conformanceApprovedLatest — 最新 verdict が needs-fix → false

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state の `conformance` runs の末尾 run に `outcome.verdict === "needs-fix:code-fixer"` が存在する
**WHEN** `conformanceApprovedLatest(state)` を呼ぶ
**THEN** `false` を返す

---

### TC-014: conformanceApprovedLatest — conformance 未実行 → false

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / design.md D4

**GIVEN** state に `conformance` の run が存在しない
**WHEN** `conformanceApprovedLatest(state)` を呼ぶ
**THEN** `false` を返す

---

### TC-015: STANDARD_TRANSITIONS に conformance approved → verification の when 付き行が存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05 / design.md D2

**GIVEN** `STANDARD_TRANSITIONS` を参照する
**WHEN** conformance の `on: "approved"` 行を検索する
**THEN** `to: VERIFICATION` かつ `when` が function の行が存在し、`to: ADR_GEN`（no `when`）の fallback 行よりも前に配置されている

---

### TC-016: STANDARD_TRANSITIONS に verification passed → adr-gen の when 付き行が存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05 / design.md D3

**GIVEN** `STANDARD_TRANSITIONS` を参照する
**WHEN** verification の `on: "passed"` 行を検索する
**THEN** `to: ADR_GEN` かつ `when` が function の行が存在し、`to: CODE_REVIEW`（no `when`）の fallback 行よりも前に配置されている

---

### TC-017: fallback 行（conformance approved → adr-gen / verification passed → code-review）が残置されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05 / design.md D2 D3

**GIVEN** `STANDARD_TRANSITIONS` を参照する
**WHEN** conformance `on: "approved"` および verification `on: "passed"` の全行を検索する
**THEN** `when` を持たない `{ CONFORMANCE, on: "approved", to: ADR_GEN }` と `{ VERIFICATION, on: "passed", to: CODE_REVIEW }` の両行が存在する

---

### TC-018: STANDARD_TRANSITIONS の行数が 37 になっている

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05 / design.md Risks

**GIVEN** `STANDARD_TRANSITIONS` を参照する
**WHEN** `STANDARD_TRANSITIONS.length` を評価する
**THEN** `37` を返す（変更前 35 に 2 行追加）

---

### TC-019: conformance → verification 入場で verification の loop 予算が fresh から数え直される

**Category**: integration
**Priority**: should
**Source**: design.md D5 / tasks.md T-06

**GIVEN** pipeline が conformance approved → verification の再検証経路に入り、直前の verification ↔ build-fixer ループでカウンタが消費されていた状態
**WHEN** conformance approved から verification へ遷移する
**THEN** episode-reset が発火し `loopIters[verification]` と `fixerIters[build-fixer]` が 0 にリセットされ、入場直後に `VERIFICATION_RETRIES_EXHAUSTED` で打ち切られない

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 13
should: 6
could: 0
blocked_reasons: []
```
