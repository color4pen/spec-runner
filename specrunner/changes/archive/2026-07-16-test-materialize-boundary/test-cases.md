# Test Cases: scenario freeze と test-materialize→implement の commit 境界

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 25
- **Manual**: 1
- **Priority**: must: 23, should: 3, could: 0

---

### TC-001: test-case-gen lineage に test-cases.md の hash が記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen 境界での scenario freeze > Scenario: test-case-gen の lineage に test-cases.md の hash が記録される

---

### TC-002: test-cases.md の各 scenario が安定 TC-{NNN} ID を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen 境界での scenario freeze > Scenario: test-cases.md の各 scenario が安定 ID を持つ

---

### TC-003: STANDARD_DESCRIPTOR に test-materialize が含まれ role が gate/impl

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize ステップの topology > Scenario: STANDARD_DESCRIPTOR に test-materialize が含まれ role が gate/impl

---

### TC-004: 遷移順が test-case-gen→test-materialize→implementer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize ステップの topology > Scenario: 遷移順が test-case-gen→test-materialize→implementer

---

### TC-005: fast pipeline は test-materialize を含まない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize ステップの topology > Scenario: fast pipeline は test-materialize を含まない

---

### TC-006: test-materialize 後に test を含み実装を含まない commit が生じる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: base コミット境界（test 在り／実装無し） > Scenario: test-materialize 後に test を含み実装を含まない commit が生じる

---

### TC-007: 各 test に固定 scenario ID が埋め込まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: base コミット境界（test 在り／実装無し） > Scenario: 各 test に固定 scenario ID が埋め込まれる

---

### TC-008: test 存在契約は満たすが実装が無いため test は red でよい

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: base コミット境界（test 在り／実装無し） > Scenario: test 存在契約は満たすが実装が無いため test は red でよい

---

### TC-009: must scenario の test が欠落すると契約違反で halt する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: base コミット境界（test 在り／実装無し） > Scenario: must scenario の test が欠落すると契約違反で halt する

---

### TC-010: standard の implementer 初期メッセージが実装専用を指示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は実装専用（standard） > Scenario: standard の implementer 初期メッセージが実装専用を指示する

---

### TC-011: fast の implementer 初期メッセージは TDD 挙動を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は実装専用（standard） > Scenario: fast の implementer 初期メッセージは TDD 挙動を保持する

---

### TC-012: implementer の test-cases.md read は soft である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は実装専用（standard） > Scenario: implementer の test-cases.md read は soft である

---

### TC-013: verification の TC-ID grep が materialize 済み test に成立する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: implementer は実装専用（standard） > Scenario: verification の TC-ID grep が materialize 済み test に成立する

---

### TC-014: test-materialize を宛先とする遷移は test-case-gen からの 1 本のみ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-fix ループは implement に戻す > Scenario: test-materialize を宛先とする遷移は test-case-gen からの 1 本のみ

---

### TC-015: conformance needs-fix:implementer は implementer に戻る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-fix ループは implement に戻す > Scenario: conformance needs-fix:implementer は implementer に戻る

---

### TC-016: resume の allowed step に test-materialize が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 挙動保存（回帰なし）と checkpoint/resume 継続 > Scenario: resume の allowed step に test-materialize が含まれる

---

### TC-017: 既存の挙動保存テストが無変更で green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 挙動保存（回帰なし）と checkpoint/resume 継続 > Scenario: 既存の挙動保存テストが無変更で green

---

### TC-018: typecheck と test が green

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 挙動保存（回帰なし）と checkpoint/resume 継続 > Scenario: typecheck と test が green

---

### TC-019: TestMaterializeStep の基本プロパティ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** `TestMaterializeStep` のインスタンス
**WHEN** `kind` / `name` / `completionVerdict` / `maxTurns` / `needsProjectContext` を参照する
**THEN** `kind === "agent"`、`name === "test-materialize"`、`completionVerdict === "success"`、`maxTurns === 40`、`needsProjectContext === true`

---

### TC-020: TestMaterializeStep.reads() の required フラグ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** `TestMaterializeStep.reads()` が返す IoRef リスト
**WHEN** 各エントリの path と required フラグを走査する
**THEN** `test-cases.md` の IoRef は `required` が true（省略含む）であり、`spec.md` の IoRef は `required:false`（soft）である

---

### TC-021: test-materialize system prompt が production code 禁止と TC ID 必須を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** `TEST_MATERIALIZE_SYSTEM_PROMPT` の内容
**WHEN** プロンプトテキストを走査する
**THEN** 「production code（実装コード）を書かない」旨の記述と「各 test の関数名またはコメントに TC ID を記載する」旨の記述がそれぞれ含まれる

---

### TC-022: managed runtime が test-coverage contract を常に violation 空で通過する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** `ManagedRuntime.validateStepOutputs` に `kind:"test-coverage"` の OutputContract を渡す
**WHEN** バリデーションを実行する
**THEN** 返却される violations は空配列であり、test-cases.md の内容・test ファイルの有無に関わらず violation を生成しない

---

### TC-023: STEP_NAMES.TEST_MATERIALIZE が AGENT_STEP_NAMES に含まれ CLI_STEP_NAMES に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** `src/kernel/step-names.ts` の `STEP_NAMES`、`AGENT_STEP_NAMES`、`CLI_STEP_NAMES`
**WHEN** それぞれの値・配列を参照する
**THEN** `STEP_NAMES.TEST_MATERIALIZE === "test-materialize"`、`AGENT_STEP_NAMES` に `"test-materialize"` が含まれる、`CLI_STEP_NAMES` には含まれない

---

### TC-024: verification/code-review の needs-fix が test-materialize を宛先にしない

**Category**: unit
**Priority**: must
**Source**: design.md > D5

**GIVEN** `STANDARD_TRANSITIONS`
**WHEN** `verification failed → 次ノード` および `code-review needs-fix → 次ノード` を解決する
**THEN** それぞれ `build-fixer` / `code-fixer` に遷移し、`test-materialize` を宛先とする遷移は存在しない

---

### TC-025: test-case-gen system prompt に固定 scenario ID 再採番禁止の記述がある

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 > Acceptance Criteria

**GIVEN** `src/prompts/test-case-gen-system.ts` の TC ID 安定性ガイダンス近傍（`l.155-159`）
**WHEN** プロンプトテキストを走査する
**THEN** 生成する `TC-{NNN}` ID が後続ノード（test-materialize / implementer）によって再採番されない固定 ID であることを示す記述がある

---

### TC-026: TestMaterializeStep.writes() は gitState のみ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** `TestMaterializeStep.writes()` が返すリスト
**WHEN** エントリを走査する
**THEN** `artifact:"gitState"` の単一エントリのみを含み、tasks.md や他の個別ファイルへの直接 write エントリを含まない

---

## Result

```yaml
result: completed
total: 26
automated: 25
manual: 1
must: 23
should: 3
could: 0
blocked_reasons: []
```
