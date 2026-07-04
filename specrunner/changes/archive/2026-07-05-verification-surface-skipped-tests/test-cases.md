# Test Cases: verification-surface-skipped-tests

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 22
- **Manual**: 0
- **Priority**: must: 11, should: 11, could: 0

---

## Spec Scenario 由来

### TC-001: test phase がスキップ数を stdout に含む場合、PhaseResult にカウントが記録される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Verification SHALL detect and record skipped tests from the test phase output > Scenario: test phase reports skipped tests

---

### TC-002: "pending" キーワードでもスキップ数が検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Verification SHALL detect and record skipped tests from the test phase output > Scenario: test phase reports pending tests under a different keyword

---

### TC-003: サマリー行が複数スキップカテゴリを含む場合、合計値が記録される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Verification SHALL detect and record skipped tests from the test phase output > Scenario: a summary line carries multiple skip categories

---

### TC-004: スキップが検出された場合、verification-result.md に passed-with-skips 注記が付く

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Verification SHALL distinguish a passed-with-skips result from a clean pass > Scenario: skips detected → annotation present

---

### TC-005: スキップが検出されない場合、clean pass のまま注記なし

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Verification SHALL distinguish a passed-with-skips result from a clean pass > Scenario: no skips detected → clean pass unchanged

---

### TC-006: テストが passed かつスキップあり → verdict は passed のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Skip detection MUST NOT change the exit-code-based verdict > Scenario: passing test phase with skips stays passed

---

### TC-007: テストが failed かつスキップあり → verdict は failed のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Skip detection MUST NOT change the exit-code-based verdict > Scenario: failing test phase with skips stays failed

---

### TC-008: 全 phase がスキップされた場合、VERIFICATION_NO_RUNNABLE_PHASES で failed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The existing no-runnable-phases behavior SHALL be unchanged > Scenario: all phases skipped remains a no-runnable-phases failure

---

### TC-009: commands path では skip 注記・skippedCount が付かない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Skip detection SHALL be scoped to the phase fallback path > Scenario: commands path is unaffected

---

## Skip Detector ユニットテスト（tasks.md > T-01 由来）

### TC-010: vitest 括弧付きサマリー形式の "skipped" を正しくパースする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `output` が `"Tests  1 passed | 2 skipped (3)"` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `2` を返す

---

### TC-011: カンマ区切り形式の "skipped" を正しくパースする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `output` が `"Tests: 2 skipped, 5 passed, 7 total"` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `2` を返す

---

### TC-012: "todo" キーワードをスキップとして検出する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `output` が `"3 todo"` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `3` を返す

---

### TC-013: キーワードの大文字・小文字を区別しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `output` が `"SKIPPED: 4 skipped"` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `4` を返す（`SKIPPED` はキーワードとして非マッチ、`4 skipped` のみマッチ）

---

### TC-014: `0 skipped` は 0 を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `output` が `"all green, 0 skipped"` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `0` を返す

---

### TC-015: スキップキーワードが含まれない出力は 0 を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `output` が `"42 tests passed"` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `0` を返す

---

### TC-016: 空文字列入力は 0 を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `output` が `""` である
**WHEN** `detectSkippedTests(output)` を呼ぶ
**THEN** `0` を返す

---

## Runner 統合テスト（tasks.md > T-03, T-06 および design.md > D2, D4 由来）

### TC-017: test phase の stderr にのみスキップ表示がある場合も検出される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 / design.md > D2

**GIVEN** test phase が exitCode 0 で終了し、stdout は空、stderr に `"2 skipped"` を含む
**WHEN** `runVerificationPhases` を実行する
**THEN** `test` phase の `skippedCount` が `2` である
**AND** `verification-result.md` に passed-with-skips 注記が含まれる

---

### TC-018: スクリプト未定義でスキップされた test phase は skippedCount を持たない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D4

**GIVEN** `test` スクリプトが package.json に存在しないため phase が skipped 扱いになる
**WHEN** `runVerificationPhases` を実行する
**THEN** `test` phase の `skippedCount` は `undefined` である
**AND** `verification-result.md` に skip 注記が付かない

---

### TC-019: test 以外の phase（build / lint 等）の出力はスキップ検出に使われない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D4

**GIVEN** lint phase の stdout が `"3 skipped"` を含み、test phase の stdout にはスキップ表示がない
**WHEN** `runVerificationPhases` を実行する
**THEN** lint phase に `skippedCount` は設定されない
**AND** `verification-result.md` に skip 注記が付かない

---

## 出力フォーマット不変条件（tasks.md > T-04 由来）

### TC-020: Phase Results テーブルヘッダーが変更されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** test phase に skippedCount が存在し verdict が passed である
**WHEN** `writeVerificationResult` が `verification-result.md` を書き出す
**THEN** `| # | Phase | Status | Duration | Exit Code |` ヘッダー行が変更なく存在する

---

### TC-021: `## Verdict:` 見出しのフォーマットが変更されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** skip 有無に関わらず任意の verdict で `verification-result.md` が書き出される
**WHEN** ファイル内容を確認する
**THEN** `/^## Verdict: (passed|failed)$/m` にマッチする行が存在する

---

### TC-022: verdict が failed のとき passed-with-skips 注記は書き出されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D5

**GIVEN** test phase が exitCode 非 0 で終了し、出力に `"2 skipped"` が含まれる
**WHEN** `writeVerificationResult` が `verification-result.md` を書き出す
**THEN** ファイル内に passed-with-skips 注記が含まれない
**AND** `skippedCount` は `test` phase result に記録されている（D6 不変）

---

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 11
should: 11
could: 0
blocked_reasons: []
```
