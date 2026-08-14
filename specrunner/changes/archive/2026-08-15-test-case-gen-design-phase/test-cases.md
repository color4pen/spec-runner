# Test Cases: test-case-gen を design phase の最終工程へ移動

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

- **Total**: 32 cases
- **Automated** (unit/integration): 30
- **Manual**: 0
- **Priority**: must: 20, should: 9, could: 3

---

### TC-001: 通常 type は design から test-case-gen へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 通常 type は test-case-gen を spec-review の前に実行する > Scenario: 通常 type は design から test-case-gen へ進む

---

### TC-002: 通常 type は test-case-gen から spec-review へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 通常 type は test-case-gen を spec-review の前に実行する > Scenario: 通常 type は test-case-gen から spec-review へ進む

---

### TC-003: 通常 type は spec-review 承認後に test-materialize へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 通常 type は test-case-gen を spec-review の前に実行する > Scenario: 通常 type は spec-review 承認後に test-materialize へ進む

---

### TC-004: 免除 type は design から spec-review へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 免除 type は test-case-gen を通らず design から spec-review へ直行する > Scenario: 免除 type は design から spec-review へ直行する

---

### TC-005: 免除 type は test-case-gen を通らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 免除 type は test-case-gen を通らず design から spec-review へ直行する > Scenario: 免除 type は test-case-gen を通らない

---

### TC-006: spec-fixer 修正後は test-case-gen を再生成する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-fix 後は test-case-gen を常時再生成してから再レビューする > Scenario: spec-fixer 修正後は test-case-gen を再生成する

---

### TC-007: 再生成後に spec-review へ戻る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-fix 後は test-case-gen を常時再生成してから再レビューする > Scenario: 再生成後に spec-review へ戻る

---

### TC-008: TC のみの needs-fix は test-case-gen へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TC のみの needs-fix は spec-fixer を経由せず test-case-gen を再生成する > Scenario: TC のみの needs-fix は test-case-gen へ直行する

---

### TC-009: TC と spec の混在 needs-fix は spec-fixer を経由する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: TC のみの needs-fix は spec-fixer を経由せず test-case-gen を再生成する > Scenario: TC と spec の混在 needs-fix は spec-fixer を経由する

---

### TC-010: 観察 pass の spec-fixer は test-materialize へ継続する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 観察 pass の意味論を維持する > Scenario: 観察 pass の spec-fixer は test-materialize へ継続する

---

### TC-011: 観察 pass 後に spec-review は再実行されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 観察 pass の意味論を維持する > Scenario: 観察 pass 後に spec-review は再実行されない

---

### TC-012: 通常 type の spec-review 入力に test-cases.md が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review は test-cases.md を照合対象に含める > Scenario: 通常 type の spec-review 入力に test-cases.md が含まれる

---

### TC-013: 免除 type の spec-review 入力に test-cases.md が含まれない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: spec-review は test-cases.md を照合対象に含める > Scenario: 免除 type の spec-review 入力に test-cases.md が含まれない

---

### TC-014: spec-review prompt に TC 照合観点が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review は test-cases.md を照合対象に含める > Scenario: spec-review prompt に TC 照合観点が含まれる

---

### TC-015: test-case-gen prompt に振る舞いレベル指示が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない > Scenario: test-case-gen prompt に振る舞いレベル指示が含まれる

---

### TC-016: test-case-gen の write 宣言は test-cases.md のみ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない > Scenario: test-case-gen の write 宣言は test-cases.md のみ

---

### TC-017: spec-review の test-cases.md fixable finding は needs-fix になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する > Scenario: spec-review の test-cases.md fixable finding は needs-fix になる

---

### TC-018: 再生成時に TC finding が test-case-gen へ渡される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する > Scenario: 再生成時に TC finding が test-case-gen へ渡される

---

### TC-019: 承認後の test-cases.md finding は operator 保護される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する > Scenario: 承認後の test-cases.md finding は operator 保護される

---

### TC-020: request.md finding は承認前でも escalation のまま

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する > Scenario: request.md finding は承認前でも escalation のまま

---

### TC-021: specFixerObservationForward が観察 pass 検出を正しく担う

**Category**: unit
**Priority**: should

**GIVEN** spec-fixer が起動し、最新 spec-review verdict が "approved" であり、conformance-triggered でない（getConformanceFixContext が null）
**WHEN** specFixerObservationForward(state) を評価する
**THEN** true を返す（旧 specFixerForwardsToTestGen と同一の不変条件を満たし、forward 先は遷移表が決定する）

**Source**: design.md > D2; tasks.md > T-03

---

### TC-022: specFixerNeedsFixForward が needs-fix/conformance-triggered で正しく真偽を返す

**Category**: unit
**Priority**: should

**GIVEN** ケース A: spec-fixer が起動し、最新 spec-review verdict が "needs-fix" で conformance-triggered でない / ケース B: conformance-triggered（getConformanceFixContext が非 null）
**WHEN** specFixerNeedsFixForward(state) を各ケースで評価する
**THEN** ケース A で true（TEST_CASE_GEN 方向）、ケース B で false（SPEC_REVIEW fallback）を返す

**Source**: design.md > D2; tasks.md > T-03

---

### TC-023: request.md + test-cases.md fixable 共存時は escalation が優先される

**Category**: unit
**Priority**: should

**GIVEN** spec-review が request.md に fixable finding を 1 件、test-cases.md に fixable finding を 1 件出す（canon scope あり）
**WHEN** deriveSpecReviewVerdict を呼ぶ
**THEN** verdict は "escalation" である（D3-4a: unroutable が 4b: TC routable より優先）

**Source**: design.md > D3 (優先順 4a); tasks.md > T-02

---

### TC-024: conformance step の test-cases.md fixable finding は escalation になる

**Category**: unit
**Priority**: should

**GIVEN** conformance step が test-cases.md に fixable finding を出す（fixTarget なし → implementer が effective fixer）
**WHEN** deriveConformanceVerdict を呼ぶ
**THEN** verdict は "escalation" である（implementer は test-cases.md を書けず unroutable）

**Source**: design.md > D3-5; tasks.md > T-02

---

### TC-025: judge/code-review step の test-cases.md fixable finding は escalation になる

**Category**: unit
**Priority**: should

**GIVEN** judge (code-review) step が test-cases.md に fixable finding を出す（code-fixer が effective fixer）
**WHEN** deriveJudgeVerdict を呼ぶ
**THEN** verdict は "escalation" である（code-fixer の writable set は空のため test-cases.md は unroutable）

**Source**: design.md > D3-5; tasks.md > T-02

---

### TC-026: 組み替え後の STANDARD_TRANSITIONS の行数は 52

**Category**: unit
**Priority**: should

**GIVEN** D1 の遷移ブロック 17 行に組み替えられた STANDARD_TRANSITIONS
**WHEN** STANDARD_TRANSITIONS.length を評価する
**THEN** length === 52 である（旧 49 + 3 行増）

**Source**: design.md > D1; tasks.md > T-04

---

### TC-027: FAST_TRANSITIONS は spec-review / spec-fixer / test-case-gen の row を含まない

**Category**: unit
**Priority**: could

**GIVEN** 組み替え後の FAST_TRANSITIONS
**WHEN** spec-review / spec-fixer / test-case-gen step の row 有無を評価する
**THEN** これらの step を含む row は存在しない（FAST pipeline は不変）

**Source**: design.md > D1 (制約: FAST pipeline は spec-review / test-case-gen を持たないため無変更); tasks.md > T-04

---

### TC-028: TC と severity 問わず spec routable finding の混在では specReviewNeedsFixIsTcOnly が false

**Category**: unit
**Priority**: must

**GIVEN** 最新 spec-review の fixable finding に test-cases.md への finding（TC routable）と spec.md への medium 以下 severity の finding（spec-fixer routable）が混在する（canon scope あり）
**WHEN** specReviewNeedsFixIsTcOnly(state) を評価する
**THEN** false を返す（spec routable が 1 件でも存在するため TC-only ではなく spec-fixer に仕事がある）

**Source**: tasks.md > T-10 acceptance criteria

---

### TC-029: spec-review initial message が test-cases.md を参照する

**Category**: unit
**Priority**: could

**GIVEN** spec-review step の system prompt に含まれる initial message テンプレート（"Review all spec files" 相当の節）
**WHEN** その内容を検査する
**THEN** test-cases.md を参照する記述が含まれる

**Source**: design.md > D6; tasks.md > T-07

---

### TC-030: test-case-gen prompt が tasks/TC 不整合の申し送り注記を指示する

**Category**: unit
**Priority**: could

**GIVEN** test-case-gen の system prompt（TEST_CASE_GEN_SYSTEM_PROMPT）
**WHEN** 責務固定に関する節を検査する
**THEN** tasks.md を編集せず、tasks と TC の不整合は test-cases.md 内の申し送り注記として記録し判定を spec-review に委ねるという指示が含まれる

**Source**: design.md > D7; tasks.md > T-08

---

### TC-031: typecheck && test が green

**Category**: gate
**Priority**: must

T-12 の検証コマンド `typecheck && test` を実行し、全件 green であることを確認する。

**Source**: tasks.md > T-12

---

### TC-032: design が「無変更 green」と列挙したテストが実際に green である

**Category**: gate
**Priority**: must

T-09 / T-12 の検証として以下が無変更で green であることを確認する:
`tests/unit/step/spec-review-reads.test.ts` / `tests/unit/core/pipeline/fast-descriptor.test.ts` / `pipeline-roles.test.ts` / spec-observation-autofix TC-015 / test-gen-exemption TC-016。

**Source**: design.md > 遷移表 pin テスト — 無変更で green を維持（列挙外・回帰確認）; tasks.md > T-09, T-12

---

## Result

```yaml
result: completed
total: 32
automated: 30
manual: 0
must: 20
should: 9
could: 3
blocked_reasons: []
```
