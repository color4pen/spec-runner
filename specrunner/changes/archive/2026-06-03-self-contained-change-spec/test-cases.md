# Test Cases: self-contained-change-spec

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 26
- **Manual**: 2
- **Priority**: must: 22, should: 4, could: 2

---

## Category: Pipeline Step Removal

### TC-001: design → spec-review 直結

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: Pipeline SHALL NOT include delta-spec-validation or delta-spec-fixer steps > Scenario: design step transitions directly to spec-review

### TC-002: spec-fixer → spec-review 直結

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: Pipeline SHALL NOT include delta-spec-validation or delta-spec-fixer steps > Scenario: spec-fixer transitions directly to spec-review

### TC-003: code-review approved → adr-gen 直結

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: Pipeline SHALL NOT include delta-spec-validation or delta-spec-fixer steps > Scenario: code-review approved transitions directly to adr-gen

### TC-004: delta-spec-validation step ファイルが存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01
- **GIVEN** T-01 の削除作業が完了している
- **WHEN** `src/core/step/delta-spec-validation.ts` のパスを確認する
- **THEN** ファイルが存在しない

### TC-005: delta-spec-fixer step ファイルが存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01
- **GIVEN** T-01 の削除作業が完了している
- **WHEN** `src/core/step/delta-spec-fixer.ts` のパスを確認する
- **THEN** ファイルが存在しない

### TC-006: STANDARD_TRANSITIONS に delta 行がない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01
- **GIVEN** T-01 の削除作業が完了している
- **WHEN** `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を読む
- **THEN** `delta-spec-validation` / `delta-spec-fixer` のエントリが含まれない

### TC-007: LOOP_ERROR_CODES に DELTA_SPEC_VALIDATION エントリがない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01
- **GIVEN** T-01 の削除作業が完了している
- **WHEN** `src/core/pipeline/types.ts` の `LOOP_ERROR_CODES` を確認する
- **THEN** `DELTA_SPEC_VALIDATION` のキーが存在しない

---

## Category: Spec File Structure

### TC-008: spec.md が A-group として design step の template に含まれる

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Design step SHALL produce a single spec.md in the change folder > Scenario: spec.md placed as A-group template before design runs

### TC-009: delta-spec-template.md の配置・削除処理がない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-05
- **GIVEN** T-05 の変更が完了している
- **WHEN** `src/templates/step-output-templates.ts` を確認する
- **THEN** `delta-spec-template.md` の参照が存在しない
- **AND** `DELTA_SPEC_TEMPLATE` 定数が存在しない

### TC-010: SPEC_TEMPLATE に記述項目の指針が HTML コメントとして含まれる

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-05
- **GIVEN** T-05 の変更が完了している
- **WHEN** `src/templates/step-output-templates.ts` の `SPEC_TEMPLATE` 定数を確認する
- **THEN** Requirement / Scenario / normative keyword / Given-When-Then の書き方ガイダンスが HTML コメント形式で含まれる

### TC-011: design agent が spec.md に Layer-1 仕様を書き込む

- **Category**: manual
- **Priority**: should
- **Source**: spec.md > Requirement: Design step SHALL produce a single spec.md in the change folder > Scenario: design agent writes spec content to spec.md

---

## Category: Code Cleanup

### TC-012: src/core/spec/ ディレクトリが存在しない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Rules registry and validator SHALL be removed from src > Scenario: no references to rules or validator remain

### TC-013: src/ 内に rules / validator への import がない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Rules registry and validator SHALL be removed from src > Scenario: no references to rules or validator remain

### TC-014: deltaSpecValidationResultPath が src/ 内に存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-04
- **GIVEN** T-04 の削除作業が完了している
- **WHEN** `src/util/paths.ts` および `src/` 全体を確認する
- **THEN** `deltaSpecValidationResultPath` の定義・参照がない

### TC-015: 削除された 4 つのテストファイルが存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03
- **GIVEN** T-03 の削除作業が完了している
- **WHEN** 以下のパスを確認する: `tests/unit/core/spec/delta-spec-validator.test.ts`, `tests/unit/core/step/delta-spec-validation-step.test.ts`, `tests/unit/step/delta-spec-fixer.test.ts`, `tests/unit/step/delta-spec-validation.test.ts`
- **THEN** 4 ファイルとも存在しない

---

## Category: Naming

### TC-016: step-names.ts に delta 系定数が存在しない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Step names SHALL NOT include delta-prefixed entries > Scenario: step name constants exclude delta entries

### TC-017: src/ 内に "delta-spec" を含む文字列がない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: No "delta" naming SHALL remain in step names, template names, path helpers, or prompt text > Scenario: grep for delta-spec references in src

### TC-018: src/prompts/ 内に "delta spec" を含む文字列がない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: No "delta" naming SHALL remain in step names, template names, path helpers, or prompt text > Scenario: grep for "delta spec" in prompt text

### TC-019: AgentStepName union から delta-spec-fixer が除去されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01
- **GIVEN** T-01 の変更が完了している
- **WHEN** `src/kernel/agent-definition.ts` の `AgentStepName` 型を確認する
- **THEN** `"delta-spec-fixer"` が union に含まれない

---

## Category: Prompt Updates

### TC-020: spec-review が spec.md をセグメント単位で意味的にレビューする

- **Category**: manual
- **Priority**: must
- **Source**: spec.md > Requirement: spec-review SHALL review spec.md semantically without baseline reference > Scenario: spec-review evaluates spec.md segments

### TC-021: spec-review prompt に "delta" / "baseline" を含む文言がない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-07
- **GIVEN** T-07 の変更が完了している
- **WHEN** `src/prompts/spec-review-system.ts` を確認する
- **THEN** "delta" および "baseline" を含む文言が存在しない
- **AND** `spec.md` の存在確認指示がある

### TC-022: test-case-gen が specrunner/changes/<slug>/spec.md を読む

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: test-case-gen SHALL read spec.md from the change folder root > Scenario: test-case-gen reads the new spec path

### TC-023: design system prompt に "delta" を含む文言がない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-06
- **GIVEN** T-06 の変更が完了している
- **WHEN** `src/prompts/design-system.ts` を確認する
- **THEN** "delta" を含む文言が存在しない
- **AND** spec パスが `specrunner/changes/<slug>/spec.md` になっている

### TC-024: RULES_MD_CONTENT に delta 系ステップ・記法が残らない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-09
- **GIVEN** T-09 の変更が完了している
- **WHEN** `src/prompts/rules.ts` の `RULES_MD_CONTENT` を確認する
- **THEN** "delta-spec-validation" / "delta-spec-fixer" / "delta spec" を含む文言がない
- **AND** spec.md の書き方指針が指針として残っている

### TC-025: spec-fixer / code-fixer prompt が指針レベルに更新されている

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-08
- **GIVEN** T-08 の変更が完了している
- **WHEN** `src/prompts/spec-fixer-system.ts` および `src/prompts/code-fixer-system.ts` を確認する
- **THEN** "Delta Spec Format Rules" セクションが "Spec Format Guidelines" に変わっている
- **AND** delta-spec-validation 依存前提の Critical 記述がない

### TC-026: commit-push.ts のコメントに "delta-spec-validation" への言及がない

- **Category**: unit
- **Priority**: could
- **Source**: tasks.md > T-10
- **GIVEN** T-10 の変更が完了している
- **WHEN** `src/core/step/commit-push.ts` のコメントを確認する
- **THEN** "delta-spec-validation" への言及がない
- **AND** authority spec violation の警告ロジック自体は維持されている

---

## Category: Build & Test

### TC-027: bun run typecheck が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-12
- **GIVEN** 全タスク（T-01〜T-11）の実装が完了している
- **WHEN** `bun run typecheck` を実行する
- **THEN** exit 0 で完了する

### TC-028: bun run test が green

- **Category**: integration
- **Priority**: could
- **Source**: tasks.md > T-12
- **GIVEN** 全タスク（T-01〜T-11）の実装が完了している
- **WHEN** `bun run test` を実行する
- **THEN** exit 0 で完了する（削除したテスト以外が pass）

---

## Result

```yaml
result: completed
total: 28
automated: 26
manual: 2
must: 22
should: 4
could: 2
blocked_reasons: []
```
