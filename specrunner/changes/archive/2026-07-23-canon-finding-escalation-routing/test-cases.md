# Test Cases: 保護正典への fixable finding の escalation routing

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 29
- **Manual**: 1
- **Priority**: must: 23, should: 6, could: 1

### TC-001: regression-gate の test-cases.md fixable finding は escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 判定層は書けない fixer への正典 fixable finding を escalation に倒す > Scenario: regression-gate の test-cases.md fixable finding は escalation

### TC-002: request.md への fixable finding は fixTarget によらず escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 判定層は書けない fixer への正典 fixable finding を escalation に倒す > Scenario: request.md への fixable finding は fixTarget によらず escalation

### TC-003: 非正典 file への fixable finding は routing 不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 判定層は書けない fixer への正典 fixable finding を escalation に倒す > Scenario: 非正典 file への fixable finding は routing 不変

### TC-004: spec.md への spec-fixer finding は needs-fix:spec-fixer のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer / implementer の合法な正典修正ルートを保存する > Scenario: spec.md への spec-fixer finding は needs-fix:spec-fixer のまま

### TC-005: tasks.md への implementer finding は needs-fix:implementer のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer / implementer の合法な正典修正ルートを保存する > Scenario: tasks.md への implementer finding は needs-fix:implementer のまま

### TC-006: tasks.md への code-fixer finding は escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer / implementer の合法な正典修正ルートを保存する > Scenario: tasks.md への code-fixer finding は escalation

### TC-007: 正典 finding を含む reviewer round の後、code-fixer は正典 finding を受領しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: findings-ledger は書けない fixer に正典 finding を渡さない > Scenario: 正典 finding を含む reviewer round の後、code-fixer は正典 finding を受領しない

### TC-008: reason に file・title・operator 適用の必要性が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation reason は file / title と operator 適用の必要性を含む > Scenario: reason に file・title・operator 適用の必要性が含まれる

### TC-009: canon escalation は awaiting-resume に落ちる（failed でない）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: escalation reason は file / title と operator 適用の必要性を含む > Scenario: canon escalation は awaiting-resume に落ちる（failed でない）

### TC-010: selectUnroutableCanonFindings は resolution=fixable 以外を除外する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `selectUnroutableCanonFindings` に resolution=`"decision-needed"` の finding（file が正典パス）と canonScope を渡す
**WHEN** 関数を評価する
**THEN** 返り値は空配列（resolution が fixable でないため対象外）

### TC-011: selectUnroutableCanonFindings は実効 fixer が書ける正典 finding を除外する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** finding が `file = specrunner/changes/<slug>/spec.md`、`resolution = fixable`、`fixTarget = spec-fixer` であり、canonScope の `writableByFixer.get("spec-fixer")` が spec.md を含む
**WHEN** `selectUnroutableCanonFindings(findings, canonScope, conformanceEffectiveFixer)` を評価する
**THEN** 返り値は空配列（spec-fixer は spec.md を合法に書けるため対象外）

### TC-012: buildCanonEscalationReason は CANON_FINDING_ESCALATION prefix を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `file = specrunner/changes/<slug>/test-cases.md`、`title = "Category 誤分類"` の finding
**WHEN** `buildCanonEscalationReason([finding])` を評価する
**THEN** 返り値の文字列は `CANON_FINDING_ESCALATION` を含む

### TC-013: canonScope 省略時の deriveJudgeVerdict は現行挙動と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** severity=high、resolution=fixable の finding が 1 件（正典パスを含む）、canonScope は渡さない
**WHEN** `deriveJudgeVerdict(findings, ok=true)` を 3 引数で呼び出す
**THEN** verdict は `needs-fix`（canonScope 省略では file を参照せず、現行挙動と同一）

### TC-014: canonScope 省略時の deriveRegressionGateVerdict は現行挙動と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** resolution=fixable の finding が 1 件（正典パスを含む）、canonScope は渡さない
**WHEN** `deriveRegressionGateVerdict(findings, ok=true)` を 3 引数で呼び出す
**THEN** verdict は `needs-fix`（canonScope 省略では現行挙動と同一）

### TC-015: canonScope 省略時の deriveConformanceVerdict は現行挙動と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** severity=high、resolution=fixable、fixTarget=code-fixer の finding が 1 件（正典パスを含む）、canonScope は渡さない
**WHEN** `deriveConformanceVerdict(findings, ok=true)` を 3 引数で呼び出す
**THEN** verdict は `needs-fix:code-fixer`（canonScope 省略では現行挙動と同一）

### TC-016: deriveRegressionGateVerdict が judgeVerdictFn 型に代入可能

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** optional 4th 引数 `canonScope?` 追加後の `judgeVerdictFn` 型と `deriveRegressionGateVerdict` 関数
**WHEN** TypeScript の型チェックを実行する
**THEN** `deriveRegressionGateVerdict` は `judgeVerdictFn` 型へ代入可能（assignability エラーなし）

### TC-017: buildCanonWriteScope の code-fixer writable は空集合

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** 任意の slug を持つ state と deps を用意し `buildCanonWriteScope(state, deps)` を評価する
**WHEN** `writableByFixer.get("code-fixer")` を参照する
**THEN** 集合は空（code-fixer は正典 file を宣言 write に含まない）

### TC-018: buildCanonWriteScope の implementer writable は {tasks.md}

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** slug=`test-slug` の state と deps を用意し `buildCanonWriteScope(state, deps)` を評価する
**WHEN** `writableByFixer.get("implementer")` を参照する
**THEN** 集合は `specrunner/changes/test-slug/tasks.md` のみを含む（implementer の宣言 write が単一ソース）

### TC-019: buildCanonWriteScope の spec-fixer writable は {spec.md, design.md}

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** slug=`test-slug` の state と deps を用意し `buildCanonWriteScope(state, deps)` を評価する
**WHEN** `writableByFixer.get("spec-fixer")` を参照する
**THEN** 集合は `specrunner/changes/test-slug/spec.md` と `specrunner/changes/test-slug/design.md` を含む

### TC-020: test-cases.md fixable（fixTarget 欠落）→ deriveRegressionGateVerdict escalation（#890 実例）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** finding が `file = specrunner/changes/<slug>/test-cases.md`、`resolution = fixable`、`fixTarget` 未設定（欠落）であり、canonScope は `buildCanonWriteScope` により code-fixer の writable=∅
**WHEN** `deriveRegressionGateVerdict(findings, ok=true, evidence, canonScope)` を評価する
**THEN** verdict は `escalation`（#890 実例の再現。fixTarget 欠落でも実効 fixer=code-fixer として判定）

### TC-021: tasks.md fixable を deriveJudgeVerdict（実効 fixer=code-fixer）で評価 → escalation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** finding が `file = specrunner/changes/<slug>/tasks.md`、`resolution = fixable`、severity=high、canonScope あり
**WHEN** `deriveJudgeVerdict(findings, ok=true, evidence, canonScope)` を評価する（judge 経路の実効 fixer=code-fixer）
**THEN** verdict は `escalation`（judge/regression-gate 経路では tasks.md も常に escalation）

### TC-022: design.md fixable、fixTarget=spec-fixer → deriveConformanceVerdict needs-fix:spec-fixer

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** finding が `file = specrunner/changes/<slug>/design.md`、`resolution = fixable`、severity=high、`fixTarget = spec-fixer`、canonScope は spec-fixer の writable に design.md を含む
**WHEN** `deriveConformanceVerdict(findings, ok=true, evidence, canonScope)` を評価する
**THEN** verdict は `needs-fix:spec-fixer`（design.md + spec-fixer は合法な修正ルート、挙動保存）

### TC-023: 非 canon 由来 escalation で StepCompletion.escalationReason は未設定

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** decision-needed finding により verdict が escalation になる（正典 finding は含まない）場合
**WHEN** step-completion が StepCompletion を生成する
**THEN** `StepCompletion.escalationReason` は undefined（vacuous / decision-needed 由来の escalation には escalationReason 不要）

### TC-024: CANON_FINDING_ESCALATION は FATAL_ERROR_CODES に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `src/core/pipeline/pipeline.ts` の `FATAL_ERROR_CODES` 定数
**WHEN** `FATAL_ERROR_CODES` を参照する
**THEN** `"CANON_FINDING_ESCALATION"` は含まれない（awaiting-resume に倒れ failed にならない）

### TC-025: collectFindingsLedger は canonScope 省略時に現行挙動と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 正典 finding（test-cases.md fixable）を含む reviewerChain と state、canonScope は渡さない
**WHEN** `collectFindingsLedger(reviewerChain, state)` を 2 引数で呼び出す
**THEN** 返り値は正典 finding を含む（canonScope 省略では除外なし、現行挙動と同一）

### TC-026: collectParallelFixerFindings は canonScope 省略時に現行挙動と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 正典 finding（test-cases.md fixable）を含む state と members、canonScope は渡さない
**WHEN** `collectParallelFixerFindings(state, members)` を 2 引数で呼び出す
**THEN** 返り値は正典 finding を含む（canonScope 省略では除外なし、現行挙動と同一）

### TC-027: 破壊確認 — selectUnroutableCanonFindings 無効化で TC-001/TC-002/TC-020 が fail

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `selectUnroutableCanonFindings` を常に空配列を返すよう書き換えた状態
**WHEN** TC-001（regression-gate test-cases.md → escalation）、TC-002（request.md → escalation）、TC-020（#890 実例）のアサーションを実行する
**THEN** 3 テストすべてが fail する（file 非参照の routing に戻ると escalation 判定が失われる）

### TC-028: 破壊確認 — collectParallelFixerFindings の除外削除で TC-007 が fail

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `collectParallelFixerFindings` から正典 finding 除外ロジックを除去した状態
**WHEN** TC-007（code-fixer は正典 finding を受領しない）のアサーションを実行する
**THEN** TC-007 が fail する（除外なしでは正典 finding が code-fixer に渡る）

### TC-029: drift-guard — writableByFixer が各 fixer の writes() ∩ protectedCanonPaths と一致

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-09; design.md > D5

**GIVEN** D5 の明示 map fallback を採用した場合の `writableByFixer` マップ、および各 fixer の `writes(state, deps)` ∩ `protectedCanonPaths(slug)` の実測集合
**WHEN** drift-guard テストを実行する
**THEN** `writableByFixer` の各エントリが実測集合と一致する（map と writes() の乖離を検出できる）

### TC-030: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-11

**GIVEN** 本変更の実装が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** typecheck と test の両方が green（エラー・失敗ゼロ）

## Result

```yaml
result: completed
total: 30
automated: 29
manual: 1
must: 23
should: 6
could: 1
blocked_reasons: []
```
