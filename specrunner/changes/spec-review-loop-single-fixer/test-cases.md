# Test Cases: spec-review loop の単一 fixer 化

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 13
- **Manual**: 0
- **Priority**: must: 7, should: 6, could: 2

---

### TC-001: test-cases.md 宛の fixable finding が spec-fixer に route され escalation にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review の fixable canon finding は spec-fixer に route される > Scenario: test-cases.md 宛の fixable finding が spec-fixer に route され escalation にならない

---

### TC-002: finding と無関係の operator 編集が一巡後も残る（#1015 の歯）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: operator が採用した test-cases.md 編集は needs-fix 一巡で保存される > Scenario: finding と無関係の operator 編集が一巡後も残る

---

### TC-003: needs-fix 一巡に test-case-gen が現れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen は design 後に一度だけ走る producer である > Scenario: needs-fix 一巡に test-case-gen が現れない

---

### TC-004: spec-fixer の write scope に test-cases.md が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer は test-cases.md を targeted に修正し再生成しない > Scenario: spec-fixer の write scope に test-cases.md が含まれる

---

### TC-005: needs-fix 継続で予算が枯渇する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review ⇄ spec-fixer の収束予算は透過化なしで数えられる > Scenario: needs-fix 継続で予算が枯渇する

---

### TC-006: 削除対象シンボルが src/ 配下に存在しない

**Category**: gate
**Priority**: must
**Source**: tasks.md T-09

`bun run test` + grep verification。対象シンボル: `specReviewNeedsFixIsTcOnly` / `testCaseGenEffectiveFixer` / `specFixerNeedsFixForward` / `loopIntermediateSteps` および SPEC_REVIEW→TEST_CASE_GEN / SPEC_FIXER→TEST_CASE_GEN の transition。

---

### TC-007: typecheck / test green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-09

`bun run typecheck` および `bun run test` が両方 green。

---

### TC-008: request.md 宛の fixable finding は依然 escalation する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: spec-review の fixable canon finding は spec-fixer に route される > Scenario: request.md 宛の fixable finding は依然 escalation する

---

### TC-009: 初回経路は design → test-case-gen → spec-review のまま

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: test-case-gen は design 後に一度だけ走る producer である > Scenario: 初回経路は design → test-case-gen → spec-review のまま

---

### TC-010: medium test-cases.md finding が observation auto-fix に fall-through する

**Category**: unit
**Priority**: should
**Source**: design.md D2

**GIVEN** spec-review が test-cases.md 上の medium severity fixable finding を 1 件返す
**WHEN** `deriveSpecReviewVerdict` が verdict を導出する
**THEN** verdict は `"approved"` になり（observation auto-fix fall-through）、`"needs-fix"` にも `"escalation"` にもならない

---

### TC-011: high test-cases.md finding が needs-fix になる

**Category**: unit
**Priority**: should
**Source**: design.md D2

**GIVEN** spec-review が test-cases.md 上の high severity fixable finding を 1 件返す
**WHEN** `deriveSpecReviewVerdict` が verdict を導出する
**THEN** verdict は `"needs-fix"` になり spec-fixer が修正担当になる

---

### TC-012: STANDARD_TRANSITIONS に review loop 内の test-case-gen 行が存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** 現在の `STANDARD_TRANSITIONS` を参照する
**WHEN** `to === TEST_CASE_GEN` の transition 行を列挙する
**THEN** `DESIGN → TEST_CASE_GEN`（初回生成）の 1 本のみ存在し、`SPEC_REVIEW → TEST_CASE_GEN` と `SPEC_FIXER → TEST_CASE_GEN` は 0 本である

---

### TC-013: spec-fixer system prompt に test-cases.md と targeted 修正の記述がある

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の内容を参照する
**WHEN** test-cases.md への言及と再生成禁止の文言を検索する
**THEN** `test-cases.md` という文字列と「targeted」または「再生成しない」相当の文字列が prompt 内に含まれる

---

### TC-014: test-case-gen.ts が削除シンボルを参照しない

**Category**: unit
**Priority**: could
**Source**: tasks.md T-06

**GIVEN** `src/core/step/test-case-gen.ts` を参照する
**WHEN** `testCaseGenEffectiveFixer` / `selectRoutableCanonFindings` の import および使用箇所を検索する
**THEN** いずれも 0 件であり `buildMessage` は `buildTestCaseGenInitialMessage` のみを呼び出す

---

### TC-015: spec-fixer の transition 行が3本で行き先が正しい

**Category**: unit
**Priority**: could
**Source**: tasks.md T-04

**GIVEN** `STANDARD_TRANSITIONS` の `from === SPEC_FIXER` の行を列挙する
**WHEN** 行き先と guard 条件を確認する
**THEN** `approved → IMPLEMENTER`（`specFixerObservationForward` guarded）、`approved → SPEC_REVIEW`（unconditional）、`error → escalate` の 3 本のみ存在し、`approved → TEST_CASE_GEN` は存在しない

---

## Result

```yaml
result: completed
total: 15
automated: 13
manual: 0
must: 7
should: 6
could: 2
blocked_reasons: []
```
