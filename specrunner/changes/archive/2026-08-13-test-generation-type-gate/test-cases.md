# Test Cases: chore type のテスト生成免除

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 16
- **Manual**: 0
- **Priority**: must: 16, should: 2, could: 0

---

### TC-001: chore は isTestGenRequired が false を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: テスト生成要否は request type で宣言的に決まる > Scenario: chore はテスト生成免除

---

### TC-002: 非免除 4 type は isTestGenRequired が true を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: テスト生成要否は request type で宣言的に決まる > Scenario: 非免除 type はテスト生成必須

---

### TC-003: 未知 type は fail-closed で isTestGenRequired が true を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: テスト生成要否は request type で宣言的に決まる > Scenario: 未知 type は fail-closed で免除されない

---

### TC-004: chore は SPEC_REVIEW approved から IMPLEMENTER へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 免除 type の pipeline はテスト生成工程を通らない > Scenario: chore は spec-review 承認から implementer へ直行

---

### TC-005: chore は IMPLEMENTER success から VERIFICATION へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 免除 type の pipeline はテスト生成工程を通らない > Scenario: chore は implementer 成功から verification へ直行

---

### TC-006: chore の spec-fixer 観測修正は IMPLEMENTER へ forward される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 免除 type の pipeline はテスト生成工程を通らない > Scenario: chore の spec-fixer 観測修正は implementer へ forward

---

### TC-007: 非免除 type は SPEC_REVIEW approved から TEST_CASE_GEN へ遷移する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 免除 type の pipeline はテスト生成工程を通らない > Scenario: 非免除 type は従来通りテスト生成を通る

---

### TC-008: 免除 type で changed-line coverage gate が明示 skip される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 免除 type では changed-line coverage gate を明示 skip する > Scenario: 免除 type で coverage gate が明示 skip される

---

### TC-009: 非免除 type では changed-line coverage gate が従来通り実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 免除 type では changed-line coverage gate を明示 skip する > Scenario: 非免除 type では coverage gate が従来通り走る

---

### TC-010: chore でも verification の command 実行が走る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 免除 type でも既存テスト実行は維持される > Scenario: chore でも verification の command 実行が走る

---

### TC-011: TYPE_CONFIG の全 5 entry に testGenRequired フィールドが存在し entry 数は 5 のまま

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `TYPE_CONFIG` オブジェクトを参照する
**WHEN** `Object.keys(TYPE_CONFIG)` の長さと各 entry の `testGenRequired` プロパティを確認する
**THEN** キー数は 5 のままであり、全 5 entry に `testGenRequired` が boolean 型で定義されている

---

### TC-012: STANDARD_TRANSITIONS で免除 row は unconditional の TEST_CASE_GEN row より前に位置する

**Category**: unit
**Priority**: must
**Source**: design.md > D2, tasks.md > T-03

**GIVEN** `STANDARD_TRANSITIONS` 配列を参照する
**WHEN** `SPEC_REVIEW` ステップの `approved` 遷移 row のインデックスを比較する
**THEN** `isTestGenExempt` を when に持つ `SPEC_REVIEW → IMPLEMENTER` row のインデックスが、when を持たない `SPEC_REVIEW → TEST_CASE_GEN` row のインデックスより小さい（first-match-wins で免除判定が優先される）

---

### TC-013: requestType 未指定のとき coverage gate は従来通り実行される（fail-closed）

**Category**: integration
**Priority**: must
**Source**: design.md > D4, tasks.md > T-04

**GIVEN** `verification.coverage` が設定されており、`runVerification` を第 5 引数 (requestType) なしで呼び出す
**WHEN** verification が実行される
**THEN** `changed-line-coverage` phase が `skipped` にならず、coverage gate が従来通り評価される

---

### TC-014: build 失敗時でも coverage の skip 理由は免除 type 由来が明示される

**Category**: integration
**Priority**: must
**Source**: design.md > D4, tasks.md > T-05

**GIVEN** request type が `chore` で `verification.coverage` が設定されており、build コマンドが失敗する
**WHEN** verification が実行される
**THEN** `changed-line-coverage` phase は `status: "skipped"` であり、その stdout/理由には `test-generation-exempt request type: chore` が含まれ、`previous command failed` は含まれない（免除チェックが failed チェックより前に評価される）

---

### TC-015: specFixerForwardsToImplementer は specFixerForwardsToTestGen が false のとき false を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D3, tasks.md > T-02

**GIVEN** `specFixerForwardsToTestGen(state)` が `false` を返す state（最新 spec-review が `approved` でない、または conformance fix context が存在する）で request type が `chore`
**WHEN** `specFixerForwardsToImplementer(state)` を評価する
**THEN** `false` を返す（AND 合成の片方が false → 合成も false）

---

### TC-016: FAST_TRANSITIONS は本変更による追加 row を含まない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `FAST_TRANSITIONS` 配列を参照する
**WHEN** `isTestGenExempt` / `specFixerForwardsToImplementer` を when に持つ row の存在を確認する
**THEN** 当該 predicate を参照する row が存在せず、FAST_TRANSITIONS は変更されていない

---

### TC-017: typecheck が全体で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01, T-02, T-03, T-04, T-05

verification phase: typecheck

---

### TC-018: test suite が全体で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05 受け入れ基準「リポジトリ全体で `typecheck && test` が green」

verification phase: test (vitest run)

---

## Result

```yaml
result: completed
total: 18
automated: 16
manual: 0
must: 16
should: 2
could: 0
blocked_reasons: []
```
