# Test Cases: spec-review loop の単一 fixer 化

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 16
- **Manual**: 0
- **Priority**: must: 16, should: 2, could: 0

---

### TC-001: test-cases.md 宛 fixable finding が spec-fixer に route され escalation にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review の fixable canon finding は spec-fixer に route される > Scenario: test-cases.md 宛の fixable finding が spec-fixer に route され escalation にならない

---

### TC-002: request.md 宛 fixable finding は依然 escalation する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review の fixable canon finding は spec-fixer に route される > Scenario: request.md 宛の fixable finding は依然 escalation する

---

### TC-003: spec-fixer の write scope に test-cases.md が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer は test-cases.md を targeted に修正し再生成しない > Scenario: spec-fixer の write scope に test-cases.md が含まれる

---

### TC-004: needs-fix 一巡に test-case-gen が現れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen は design 後に一度だけ走る producer である > Scenario: needs-fix 一巡に test-case-gen が現れない

---

### TC-005: 初回経路 design → test-case-gen → spec-review が維持される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: test-case-gen は design 後に一度だけ走る producer である > Scenario: 初回経路は design → test-case-gen → spec-review のまま

---

### TC-006: finding と無関係の operator 編集が一巡後も残る (#1015 の歯)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: operator が採用した test-cases.md 編集は needs-fix 一巡で保存される > Scenario: finding と無関係の operator 編集が一巡後も残る

---

### TC-007: needs-fix 継続で収束予算が枯渇し SPEC_REVIEW_RETRIES_EXHAUSTED に到達する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: spec-review ⇄ spec-fixer の収束予算は透過化なしで数えられる > Scenario: needs-fix 継続で予算が枯渇する

---

### TC-008: drift-guard — writableByFixer["spec-fixer"] ∩ canonPaths が writes() と一致する

**Category**: unit
**Priority**: must
**Source**: design.md > D1, tasks.md > T-01

**GIVEN** canon-write-scope drift-guard（TC-029）が「writableByFixer[fixer] ∩ protectedCanonPaths == writes()」を要求する
**WHEN** spec-fixer の writableByFixer エントリと SpecFixerStep.writes() の両方に test-cases.md を追加した状態でテストを実行する
**THEN** drift-guard は green を返す（map と writes() が一致し不整合がない）

---

### TC-009: SPEC_FIXER_SYSTEM_PROMPT に test-cases.md と targeted 修正の記述が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** spec-fixer system prompt が定義されている
**WHEN** SPEC_FIXER_SYSTEM_PROMPT 文字列を検査する
**THEN** "test-cases.md" が含まれ、かつ再生成しない / targeted 修正である旨の記述が含まれる

---

### TC-010: medium test-cases.md fixable finding → approved（observation auto-fix fall-through）

**Category**: unit
**Priority**: must
**Source**: design.md > D2

**GIVEN** spec-review が test-cases.md 上の medium fixable finding を 1 件返す
**WHEN** deriveSpecReviewVerdict を呼ぶ
**THEN** verdict は "approved"（low/medium は needs-fix でなく observation auto-fix fall-through）

---

### TC-011: high test-cases.md fixable finding → needs-fix

**Category**: unit
**Priority**: must
**Source**: design.md > D2

**GIVEN** spec-review が test-cases.md 上の high fixable finding を 1 件返す
**WHEN** deriveSpecReviewVerdict を呼ぶ
**THEN** verdict は "needs-fix"（high/critical は spec-fixer に route）

---

### TC-012: testCaseGenEffectiveFixer が src/ に存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** src/ 配下のソースコード全体
**WHEN** "testCaseGenEffectiveFixer" を grep する（テスト・成果物を除く）
**THEN** 0 件（削除済みシンボルへの参照が残存しない）

---

### TC-013: specReviewNeedsFixIsTcOnly / specFixerNeedsFixForward が src/ に存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** src/ 配下のソースコード全体
**WHEN** "specReviewNeedsFixIsTcOnly" または "specFixerNeedsFixForward" を grep する
**THEN** 0 件（削除済み述語が残存しない）

---

### TC-014: STANDARD_TRANSITIONS の TEST_CASE_GEN 宛行が DESIGN → のみになっている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** STANDARD_TRANSITIONS の定義
**WHEN** `to === TEST_CASE_GEN` となるエントリを列挙する
**THEN** DESIGN → TEST_CASE_GEN の 1 本のみ存在し、SPEC_REVIEW → TEST_CASE_GEN と SPEC_FIXER → TEST_CASE_GEN は 0 本

---

### TC-015: loopIntermediateSteps が src/ に存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** src/ 配下のソースコード全体（types.ts / pipeline.ts / registry.ts / run.ts を含む）
**WHEN** "loopIntermediateSteps" を grep する
**THEN** 0 件（パラメータごと削除され残存しない）

---

### TC-016: test-case-gen.ts が testCaseGenEffectiveFixer / selectRoutableCanonFindings を参照しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** src/core/step/test-case-gen.ts のソースコード
**WHEN** "testCaseGenEffectiveFixer" または "selectRoutableCanonFindings" を検索する
**THEN** 0 件（needs-fix finding 注入分岐が除去され compile 不能な参照が残存しない）

---

### TC-017: bun run typecheck green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

verification phase: `bun run typecheck`

---

### TC-018: bun run test green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

verification phase: `bun run test`

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
