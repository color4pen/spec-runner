# Test Cases: test-materialize の自己 red 確認

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
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 7 cases
- **Automated** (unit/integration): 5
- **Manual**: 1
- **Priority**: must: 6, should: 1, could: 0

---

### TC-001: prompt に実行と red 観測の指示が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は新規テストの実行と fail 観測を義務化する > Scenario: prompt に実行と red 観測の指示が含まれる

---

### TC-002: prompt に期待分類と一致確認の指示が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は expected-red / expected-green の期待分類と一致確認を規定する > Scenario: prompt に期待分類と一致確認の指示が含まれる

---

### TC-003: Evidence 節に観測記録の指示が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt の Evidence 要求は実行観測記録を義務化する > Scenario: Evidence 節に観測記録の指示が含まれる

---

### TC-004: 既存の manual / gate / traceability / skeleton 契約が無改変で green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の test-materialize prompt 契約が回帰しない > Scenario: 既存の manual / gate / traceability / skeleton 契約が無改変で green

---

### TC-005: Evidence 節が "result file" を記録先として名指ししない

**Category**: unit
**Priority**: should
**Source**: design.md > D3: 観測記録を Evidence 節の step 固有要求に追加する（記録先は完了報告）

**GIVEN** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**WHEN** `## Evidence` 節を検査する
**THEN** "result file" を記録先として名指しする文言が Evidence 節に含まれない

---

### TC-006: red-check contract テストが変更前 prompt に対して RED になる（破壊確認）

**Category**: manual
**Priority**: must
**Source**: tasks.md > テストの取り扱い > 破壊確認

**GIVEN** `src/prompts/test-materialize-system.ts` の Method Step 6 を変更前の受動的許容文（「テストは意図的に red（fail）で構わない — 実装がまだ存在しないため。implementer が green にする。」）に一時的に戻した状態
**WHEN** red-check contract テストファイル（TC-001 / TC-002 / TC-003 の assertion を含む）を実行する
**THEN** `expected-red` / `expected-green` 等の base 不在リテラルを discriminator に使う assertion が fail する（歯の実在・fail-open でないことを確認）。確認後は変更を元に戻す。

---

### TC-007: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-03: 検証

verification phase: `bun run typecheck && bun run test`

## Result

```yaml
result: completed
total: 7
automated: 5
manual: 1
must: 6
should: 1
could: 0
blocked_reasons: []
```
