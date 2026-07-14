# Test Cases: added-turn 削減の仕上げ — 追加ターン metrics の journal 永続化と code-review post-work turn の除去

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 10
- **Manual**: 2
- **Priority**: must: 9, should: 3, could: 0

---

## Group 1: addedTurns — journal round-trip 永続化

### TC-001: addedTurns が write → fold round-trip を生き残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: addedTurns SHALL round-trip losslessly through the event journal > Scenario: addedTurns survives write → fold round-trip

### TC-002: addedTurns を持たない旧 record が fold で undefined になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: addedTurns SHALL round-trip losslessly through the event journal > Scenario: legacy record without addedTurns folds to undefined

---

## Group 2: local adapter — post-work turn 計上と addedTurns 整合

### TC-003: 失敗した post-work turn が addedTurns.postWork に計上される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The local adapter SHALL count consumed post-work turns and return consistent addedTurns on every path > Scenario: failed post-work turn is counted

### TC-004: 返却結果で reportRetry + outputRepair === followUpAttempts が成立する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The local adapter SHALL count consumed post-work turns and return consistent addedTurns on every path > Scenario: invariant holds on the returned result

### TC-005: error/timeout 早期 return 経路が ADDED_TURNS_ZERO を返し不変が成立する

**Category**: unit
**Priority**: should
**Source**: design.md > D2: post-work count を消費 turn 基準で計上し、全 return 経路に addedTurns を付与する

**GIVEN** local adapter の run() が agent redirect 超過・main query 失敗・timeout・error のいずれかの経路で早期 return する状況（follow-up turn を一切消費していない）
**WHEN** run() が返却する
**THEN** 返却値の `addedTurns` が `ADDED_TURNS_ZERO`（`{ reportRetry: 0, postWork: 0, outputRepair: 0 }`）であり、`addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts` （=0）が成立する

### TC-006: result file not found 経路が実カウンタの addedTurns を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: local adapter の post-work count-miss を修正し全 return 経路に addedTurns を付与する

**GIVEN** follow-up turn の消費後に result file not found で return する経路（`reportRetry`・`postWork`・`outputRepair` カウンタが 1 以上に積まれている）
**WHEN** run() が返却する
**THEN** 返却値の `addedTurns` が `{ reportRetry, postWork, outputRepair }` 実カウンタと一致し、`addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts` が成立する

---

## Group 3: code-review — 無条件 post-work turn の除去

### TC-007: CodeReviewStep が followUpPrompt および getFollowUpPrompt を持たない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review SHALL NOT run an unconditional post-work self-check turn > Scenario: code-review declares no follow-up prompt

### TC-008: 形式適合の review-feedback で post-work / repair turn が発火しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review SHALL NOT run an unconditional post-work self-check turn > Scenario: format-compliant review-feedback triggers no post-work or repair turn

### TC-009: 形式違反の review-feedback で従来どおり repair turn が発火する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review SHALL NOT run an unconditional post-work self-check turn > Scenario: malformed review-feedback still triggers a repair turn

### TC-010: routing verdict が構造化 findings から導出され .md に依存しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review SHALL NOT run an unconditional post-work self-check turn > Scenario: routing verdict is derived from structured findings, not the .md

---

## Group 4: 全体検証

### TC-011: typecheck && test が green になる

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04: 全体検証

**GIVEN** T-01・T-02・T-03 の実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラー 0 件、全テストが green（既存テストは期待が変わる箇所以外は無改変で通過）

### TC-012: スコープ外ファイルに変更が及んでいない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-04: 全体検証

**GIVEN** 変更が完了した状態
**WHEN** 変更ファイル一覧を確認する
**THEN** 編集が `src/store/event-journal.ts`・`src/adapter/claude-code/agent-runner.ts`・`src/core/step/code-review.ts` および各テストファイルに限定されており、managed adapter（`src/adapter/managed/`）・content-format seam・`src/core/step/code-fixer.ts` のフォールバック経路には一切変更がない

---

## Result

```yaml
result: completed
total: 12
automated: 10
manual: 2
must: 9
should: 3
could: 0
blocked_reasons: []
```
