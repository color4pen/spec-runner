# Test Cases: judge 判定チャネルを typed findings に一本化し、result md を evidence report にする

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

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 16, should: 4, could: 0

---

## Requirement: judge 系の prompt・message・template は verdict 行の出力を要求しない

### TC-001: judge prompt 群に verdict 行の出力指示が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 系の prompt・message・template は verdict 行の出力を要求しない > Scenario: judge prompt 群に verdict 行の出力指示が存在しない

### TC-002: verdict 行なしの result md でも routing が成立する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 系の prompt・message・template は verdict 行の出力を要求しない > Scenario: verdict 行なしの result md でも routing が成立する

---

## Requirement: judge 系 result template は evidence report である

### TC-003: evidence report template が必須セクションを持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 系 result template は evidence report である > Scenario: evidence report template が必須セクションを持つ

### TC-004: evidence report template が 7 列 findings 表を要求しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 系 result template は evidence report である > Scenario: evidence report template が 7 列 findings 表を要求しない

---

## Requirement: code-review の content-format gate は evidence セクションを検証する

### TC-005: 必須セクションを持つ evidence report は gate を通過する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review の content-format gate は evidence セクションを検証する > Scenario: 必須セクションを持つ evidence report は gate を通過する

### TC-006: 必須セクションを欠く result は follow-up violation になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review の content-format gate は evidence セクションを検証する > Scenario: 必須セクションを欠く result は follow-up violation になる

### TC-007: gate は 7 列表 header をチェックしない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review の content-format gate は evidence セクションを検証する > Scenario: gate は 7 列表 header をチェックしない

---

## Requirement: PIPELINE_RULES は死装置を含まない

### TC-008: PIPELINE_RULES にスコアリング・停滞検出が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PIPELINE_RULES は死装置を含まない > Scenario: PIPELINE_RULES にスコアリング・停滞検出が存在しない

---

## Requirement: severity 定義は judge-rules.ts に単一ソース化される

### TC-009: 各 judge prompt が単一ソースの severity を埋め込む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: severity 定義は judge-rules.ts に単一ソース化される > Scenario: 各 judge prompt が単一ソースの severity を埋め込む

### TC-010: severity 文言が judge-rules.ts 以外に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: severity 定義は judge-rules.ts に単一ソース化される > Scenario: severity 文言が judge-rules.ts 以外に存在しない

---

## Requirement: verdict 導出（routing）は不変である

### TC-011: 既存の verdict 導出テストが無改変で green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verdict 導出（routing）は不変である > Scenario: 既存の verdict 導出テストが無改変で green

### TC-012: findings から導出される verdict が変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verdict 導出（routing）は不変である > Scenario: findings から導出される verdict が変わらない

---

## Non-Scenario: 実装補足検証

### TC-013: VERDICT_BLOCKING_RULES から findings-priority 但し書きが削除されている

**Category**: unit
**Priority**: should
**Source**: design.md > D6: VERDICT_BLOCKING_RULES から findings-priority 但し書きを削除する / tasks.md > T-01

**GIVEN** `src/prompts/judge-rules.ts` の `VERDICT_BLOCKING_RULES` 定数
**WHEN** 「findings 由来の導出が優先」「verdict 行は人間向けの要約」に相当する文言を検索する
**THEN** 該当文言は 0 件であり、blocking rules 本体（decision-needed → escalation / critical|high → needs-fix / else → approved）は引き続き存在する

### TC-014: VERDICT_BLOCKING_RULES が blocking rules 本体を保持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D6

**GIVEN** `src/prompts/judge-rules.ts` の `VERDICT_BLOCKING_RULES` 定数
**WHEN** decision-needed → escalation、critical|high → needs-fix の対応記述を検査する
**THEN** blocking rules 本体の記述が存在し、D6 の削除対象（findings-priority 但し書き）のみが除去されている

### TC-015: PIPELINE_RULES の 7 列 findings 表指示が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / design.md > D4

**GIVEN** `src/prompts/fragments.ts` の `PIPELINE_RULES` 定数
**WHEN** 7 列 findings 表 header（`# | Severity | Category | File | Description | How to Fix | Fix`）を検索する
**THEN** 該当は 0 件であり、findings 表出力を agent に指示するセクション（`## Findings Format`）が存在しない

### TC-016: PIPELINE_RULES の severity 表が存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / design.md > D5

**GIVEN** `src/prompts/fragments.ts` の `PIPELINE_RULES` 定数
**WHEN** severity 定義の signature 文言（例「本番障害、データ損失、セキュリティ侵害に直結」）を検索する
**THEN** severity 文言は PIPELINE_RULES に hardcoded で存在せず、severity 定義は judge-rules.ts の定数に集約されている

### TC-017: result template から verdict placeholder・Scores 表・iteration 行が削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `src/templates/step-output-templates.ts` の 4 judge template（`REQUEST_REVIEW_RESULT_TEMPLATE` / `SPEC_REVIEW_RESULT_TEMPLATE` / `REVIEW_FEEDBACK_TEMPLATE` / `CONFORMANCE_RESULT_TEMPLATE`）
**WHEN** 各 template に `- **verdict**:` placeholder、`- **total**:`、`- **iteration**:`、Scores 表が含まれるか検査する
**THEN** 上記フィールドはすべて 0 件であり、各 template は evidence report の 3 セクション（検証した項目 / 検証できなかった項目 / Findings 詳細）を持つ

### TC-018: 4 step の initial message builder 出力に verdict 行指示が存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `code-review.ts` / `conformance.ts` / `custom-reviewer.ts` / `regression-gate.ts` の initial message builder 関数の出力文字列
**WHEN** `**verdict**` の出力指示および「The file MUST contain a verdict line」に相当する文言を grep する
**THEN** 該当は 0 件であり、各 initial message は引き続き findings を `report_result` で報告する誘導を含む

### TC-019: pipeline-mock-client の judge result md が evidence report 形式であり統合テストが green

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-08 / design.md > Risks（pipeline-mock-client の判定 md 更新漏れ）

**GIVEN** `tests/helpers/pipeline-mock-client.ts` が judge step の result md を生成する
**WHEN** code-review の content-format gate を含む統合テストを実行する
**THEN** mock が生成する result md は evidence report 形式（検証した項目 / 検証できなかった項目セクション）を持ち、content-format gate が follow-up violation を発火させない

### TC-020: typecheck && test 全体が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09 / request.md > 受け入れ基準

**GIVEN** 本変更がすべて適用されたコードベース
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** typecheck エラーが 0 件、全 test suite が green であり、CLI stdout 関連テスト（cli-stdout-snapshot / loop-iter-stdout / job-stats）は無改変で green である

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 16
should: 4
could: 0
blocked_reasons: []
```
