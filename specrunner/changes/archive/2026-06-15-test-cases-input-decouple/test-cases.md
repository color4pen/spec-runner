# Test Cases: test-cases.md input decoupling と descriptor input-completeness preflight

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 15
- **Manual**: 1
- **Priority**: must: 14, should: 2, could: 0

---

### TC-001: fast で test-cases.md 不在でも code-review が止まらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review と custom reviewer は test-cases.md を soft input として扱う > Scenario: fast で test-cases.md 不在でも code-review が止まらない

---

### TC-002: standard で test-cases.md が在れば must-scenario 照合に使う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review と custom reviewer は test-cases.md を soft input として扱う > Scenario: standard で test-cases.md が在れば must-scenario 照合に使う

---

### TC-003: custom reviewer も test-cases.md 欠落で止まらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review と custom reviewer は test-cases.md を soft input として扱う > Scenario: custom reviewer も test-cases.md 欠落で止まらない

---

### TC-004: test-case-gen が完了したのに test-cases.md 未生成で STEP_OUTPUT_MISSING

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen は test-cases.md の生成を自身で保証する > Scenario: test-case-gen が完了したのに test-cases.md 未生成

---

### TC-005: producer 不在の必須 read を violation として返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: descriptor input-completeness validator は純関数で violation を返す > Scenario: producer 不在の必須 read を violation として返す

---

### TC-006: 適用後の全 base descriptor が input-complete

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: descriptor input-completeness validator は純関数で violation を返す > Scenario: 適用後の全 base descriptor が input-complete

---

### TC-007: loop-back の必須 read は paired reviewer の write で満たされる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: descriptor input-completeness validator は純関数で violation を返す > Scenario: loop-back の必須 read は paired reviewer の write で満たされる

---

### TC-008: violation 検出時に bootstrapJob を呼ばない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: validator は着手前 preflight で合成後 descriptor を検算する > Scenario: violation 検出時に bootstrapJob を呼ばない

---

### TC-009: 合成後 descriptor を検算するため custom reviewer の必須 read も対象になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: validator は着手前 preflight で合成後 descriptor を検算する > Scenario: 合成後 descriptor を検算するため custom reviewer の必須 read も対象になる

---

### TC-010: code-review の他の reads（design.md / tasks.md / gitState）が required のまま不変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `CodeReviewStep` の `reads()` 出力を取得する  
**WHEN** `test-cases.md` 以外の全エントリを検査する  
**THEN** `design.md`・`tasks.md` の read が `required !== false`（必須）のまま変わらず、gitState read も不変である

---

### TC-011: test-case-gen.writes() が test-cases.md を verify 有効で宣言する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `TestCaseGenStep` の `writes()` 出力を取得する  
**WHEN** `test-cases.md` エントリを検査する  
**THEN** `verify: false` が付いておらず、`producedContractsFromWrites` が `produced` / `halt` の output contract を導出できる

---

### TC-012: validateDescriptorInputCompleteness が fs / child_process を import しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D3

**GIVEN** `src/core/pipeline/descriptor-input-completeness.ts`（または同等モジュール）のソースを検査する  
**WHEN** import 宣言の一覧を確認する  
**THEN** `fs`・`child_process`（およびそのサブパス）はいずれも import されていない

---

### TC-013: test-case-gen.ts の stale コメントが実態に即した記述に是正されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** 変更後の `src/core/step/test-case-gen.ts` を開く  
**WHEN** 旧コメント該当箇所（"absence は downstream の code-review が検出" 等）を確認する  
**THEN** 当該記述が消え、output gate（`writes()` → `producedContractsFromWrites` → `validateStepOutputs`、policy `halt`）が `STEP_OUTPUT_MISSING` を検出するという正しい説明に置き換わっている

---

### TC-014: violation がない正常経路で prepare が bootstrapJob まで進む

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** input-complete な合成 descriptor（standard 相当、violation 0）が解決される  
**WHEN** `PipelineRunCommand.prepare()` を実行する  
**THEN** `validateDescriptorInputCompleteness` が violation を返さず、`bootstrapJob` が呼ばれ pipelineId が記録される

---

### TC-015: FindingResolution union が fixable | decision-needed のまま不変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `FindingResolution` 型の定義箇所を検査する  
**WHEN** 型定義の union variant を確認する  
**THEN** `fixable` と `decision-needed` の 2 variant のみで変更されていない

---

### TC-016: bun run typecheck && bun run test が全件 green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** 本 request の全変更（T-01〜T-08）が適用されたコードベース  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラーなし・全テスト green（arch 不変条件 B-1〜B-11 ＋ DSM を含む）

---

## Result

```yaml
result: completed
total: 16
automated: 15
manual: 1
must: 14
should: 2
could: 0
blocked_reasons: []
```
