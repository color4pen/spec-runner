# Test Cases: specrunner guide サブコマンド

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 19, should: 2, could: 0

### TC-001: 引数なしで topic 一覧を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guide コマンドは topic 一覧と topic 本文を静的に出力する > Scenario: 引数なしで topic 一覧を出力する

### TC-002: 全 9 topic の body が非空 (iterable 検証)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `GUIDE_TOPICS` が 9 topic を持つ
**WHEN** `GUIDE_TOPICS` を iterate して各 topic の body を取得する
**THEN** jobs / merge / audit / setup / escalation / request / review / inject / inbox の全 9 topic の body が空文字列でない

### TC-003: repo 外でも動作する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guide コマンドは topic 一覧と topic 本文を静的に出力する > Scenario: repo 外でも動作する

### TC-004: 未知 topic

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 未知 topic はエラーと一覧を返す > Scenario: 未知 topic

### TC-005: 一覧が registry から導出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 一覧・未知候補・init snippet の topic 列挙は単一 registry から導出される > Scenario: 一覧が registry から導出される

### TC-006: finish/archive escalation の導線

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: operator 向け escalation 出力に guide escalation 導線を含める > Scenario: finish/archive escalation の導線

### TC-007: 保護正典 escalation の導線

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: operator 向け escalation 出力に guide escalation 導線を含める > Scenario: 保護正典 escalation の導線

### TC-008: usage に guide が現れる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --help に guide の案内を含める > Scenario: usage に guide が現れる

### TC-009: init が snippet を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: init 完了時に CLAUDE.md 用 snippet を出力する > Scenario: init が snippet を出力する

### TC-010: escalation 本文の必須要素

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation topic 本文は復帰 flag 分岐と reopen 制約を含める > Scenario: escalation 本文の必須要素

### TC-011: 薄いトリガー化

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skill を薄いトリガーへ縮退し廃止コマンド文字列を排除する > Scenario: 薄いトリガー化

### TC-012: 廃止 skill とコマンド文字列の不在

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skill を薄いトリガーへ縮退し廃止コマンド文字列を排除する > Scenario: 廃止 skill とコマンド文字列の不在

### TC-013: 本文コマンドが registry で解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guide 本文の specrunner コマンドは現行 CLI に実在する > Scenario: 本文コマンドが registry で解決される

### TC-014: GUIDE_TOPICS が 9 件を宣言順で持つ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/core/command/guide.ts` が実装されている
**WHEN** `GUIDE_TOPICS` を参照する
**THEN** jobs / merge / audit / setup / escalation / request / review / inject / inbox の順で 9 件を持つ

### TC-015: renderTopicList() が全 topic の name と summary を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `GUIDE_TOPICS` が 9 topic を持つ
**WHEN** `renderTopicList()` を呼び出す
**THEN** 返却文字列は全 9 topic の name と summary を含む

### TC-016: findTopic が escalation topic を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `GUIDE_TOPICS` に escalation topic が定義されている
**WHEN** `findTopic("escalation")` を呼び出す
**THEN** body が非空の topic を返し、その body は `--apply-canon`・`--adopt-commits`・`--from`・`reopen` を含む

### TC-017: buildClaudeMdSnippet() が GUIDE_TOPICS 全 name を map 導出で含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D4

**GIVEN** `GUIDE_TOPICS` が 9 topic を持つ
**WHEN** `buildClaudeMdSnippet()` を呼び出す
**THEN** 返却文字列は `GUIDE_TOPICS.map(t => t.name)` から導出した全 topic 名を含む(手書き列挙ではない)

### TC-018: runGuide の戻り値が仕様どおり

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `runGuide` が実装されている
**WHEN** topic 未指定・既知 topic・未知 topic の各ケースで `runGuide` を呼び出す
**THEN** topic 未指定は 0、既知 topic は 0、未知 topic は 2 を返す

### TC-019: canon-escalation.ts が guide.ts を import しない (leaf 制約)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 / design.md > D3

**GIVEN** `src/core/step/canon-escalation.ts` が leaf モジュールとして実装されている
**WHEN** `canon-escalation.ts` の import 文を静的に確認する
**THEN** `src/core/command/guide` を import しない。guide.ts は stdout 等 I/O に依存するため、import 混入は unit test の分離性を損なう設計不変条件違反である

### TC-020: jobs topic body が並列起動 stagger 記述を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 (jobs topic 内容要件)

**GIVEN** `GUIDE_TOPICS` に jobs topic が定義されている
**WHEN** `findTopic("jobs")` で body を取得する
**THEN** body は `sleep 3` による stagger の記述と worktree ロック競合(#166)への言及を含む

### TC-021: escalation topic body が後片付けコマンドを含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 (escalation topic 内容要件)

**GIVEN** `GUIDE_TOPICS` に escalation topic が定義されている
**WHEN** `findTopic("escalation")` で body を取得する
**THEN** body は `specrunner job cancel --restore-draft`・`specrunner job prune --force`・`specrunner job attach --branch` を含む

## Result

```yaml
result: completed
total: 21
automated: 21
manual: 0
must: 19
should: 2
could: 0
blocked_reasons: []
```
