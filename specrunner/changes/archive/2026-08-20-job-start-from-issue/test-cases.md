# Test Cases: job start --from-issue

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

- **Total**: 19 cases
- **Automated** (unit/integration): 14
- **Manual**: 2
- **Priority**: must: 14, should: 5, could: 0

---

### TC-001: --from-issue が issue 本文を request として起動する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job start SHALL accept --from-issue to launch a job directly from an issue body > Scenario: --from-issue が issue 本文を request として起動する

---

### TC-002: fidelity gate が inboxOrigin により comparator を skip する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue 起動の job は issue fidelity comparator を実行してはならない > Scenario: fidelity gate が inboxOrigin により comparator を skip する

---

### TC-003: 現在 branch が base-branch と不一致なら副作用ゼロで停止する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue はコマンド起動時に base-branch guard を適用しなければならない > Scenario: 現在 branch が base-branch と不一致なら副作用ゼロで停止する

---

### TC-004: detached HEAD は不一致として扱う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue はコマンド起動時に base-branch guard を適用しなければならない > Scenario: detached HEAD は不一致として扱う

---

### TC-005: --from-issue と positional の併用は usage エラー

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue と positional / --issue は排他でなければならない > Scenario: --from-issue と positional の併用は usage エラー

---

### TC-006: --from-issue と --issue の併用は usage エラー

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue と positional / --issue は排他でなければならない > Scenario: --from-issue と --issue の併用は usage エラー

---

### TC-007: --from-issue と --detach は併用できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from-issue と positional / --issue は排他でなければならない > Scenario: --from-issue と --detach は併用できる

---

### TC-008: fetch 失敗時に draft も job state も生成されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit しなければならない > Scenario: fetch 失敗時に draft も job state も生成されない

---

### TC-009: parse 失敗時に draft も job state も生成されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue 本文の request parse 失敗は副作用ゼロでエラー終了しなければならない > Scenario: parse 失敗時に draft も job state も生成されない

---

### TC-010: 占有 slug に対する --from-issue は既存 SlugOccupiedError 経路で拒否される

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: slug 占有時は既存の SlugOccupiedError 経路に乗らなければならない > Scenario: 占有 slug に対する --from-issue は既存 SlugOccupiedError 経路で拒否される

---

### TC-011: inbox と --from-issue が同一の core 関数を経由する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue → draft → start の連鎖は単一の core 関数に統合されなければならない > Scenario: inbox と --from-issue が同一の core 関数を経由する

---

### TC-012: --from-issue も positional も指定なしで usage エラー

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T-02

**GIVEN** `job start` コマンドが `--from-issue` なし・positional なしで呼ばれる
**WHEN** コマンドを実行する
**THEN** usage エラー（ARG_ERROR）で非ゼロ exit し、job state は作られない

---

### TC-013: getCurrentBranch が通常 branch で branch 名を返す

**Category**: unit
**Priority**: should
**Source**: design.md D4 / tasks.md T-04

**GIVEN** cwd が `main` branch の git リポジトリである
**WHEN** `getCurrentBranch(cwd)` を呼ぶ
**THEN** `"main"` が返る

---

### TC-014: getCurrentBranch が detached HEAD で null を返す

**Category**: unit
**Priority**: should
**Source**: design.md D4 / tasks.md T-04

**GIVEN** cwd が detached HEAD 状態の git リポジトリである
**WHEN** `getCurrentBranch(cwd)` を呼ぶ
**THEN** `null` が返る

---

### TC-015: `job start -h` の usage 出力に --from-issue が現れる

**Category**: manual
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** `job start` コマンドの help を表示する
**WHEN** `specrunner job start --help` を実行する
**THEN** `--from-issue` が出力に含まれ、fidelity skip・base-branch guard・positional/`--issue` 排他の説明が示される

---

### TC-016: `specrunner guide jobs` の出力に --from-issue の契約が反映される

**Category**: manual
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** guide の jobs topic を表示する
**WHEN** `specrunner guide jobs` を実行する
**THEN** `--from-issue` の契約（issue 番号のみで起動・fidelity skip・base-branch guard・排他）が出力に含まれる

---

### TC-017: bun run typecheck が green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-06

verification phase: typecheck (`bun run typecheck`)

---

### TC-018: bun run test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-06

verification phase: test (`bun run test`)

---

### TC-019: inbox の既存テストが無改変で green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-01 / T-06

verification phase: test (`bun run test` — `src/core/inbox/__tests__/run-inbox.test.ts` を含む)

---

## Result

```yaml
result: completed
total: 19
automated: 14
manual: 2
must: 13
should: 6
could: 0
blocked_reasons: []
```
