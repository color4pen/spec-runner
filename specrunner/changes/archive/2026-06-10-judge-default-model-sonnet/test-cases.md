# Test Cases:

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

- **Total**: 11 cases
- **Automated** (unit/integration): 5
- **Manual**: 6
- **Priority**: must: 10, should: 1, could: 0

---

### TC-001: spec-review.ts の SPEC_REVIEW_AGENT_MODEL が "claude-sonnet-4-6" である

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `src/core/step/spec-review.ts` を参照する
**WHEN** `SPEC_REVIEW_AGENT_MODEL` 定数の値を確認する
**THEN** 値が `"claude-sonnet-4-6"` である（`"claude-opus-4-6[1m]"` でない）

---

### TC-002: code-review.ts の CODE_REVIEW_AGENT_MODEL が "claude-sonnet-4-6" である

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `src/core/step/code-review.ts` を参照する
**WHEN** `CODE_REVIEW_AGENT_MODEL` 定数の値を確認する
**THEN** 値が `"claude-sonnet-4-6"` である（`"claude-opus-4-6[1m]"` でない）

---

### TC-003: conformance.ts の CONFORMANCE_AGENT_MODEL が "claude-sonnet-4-6" である

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `src/core/step/conformance.ts` を参照する
**WHEN** `CONFORMANCE_AGENT_MODEL` 定数の値を確認する
**THEN** 値が `"claude-sonnet-4-6"` である（`"claude-opus-4-6[1m]"` でない）

---

### TC-004: design.ts の DESIGN_AGENT_MODEL が "claude-opus-4-6[1m]" のまま維持される

**Category**: manual
**Priority**: must
**Source**: design.md Non-Goals

**GIVEN** `src/core/step/design.ts` を参照する
**WHEN** `DESIGN_AGENT_MODEL` 定数の値を確認する
**THEN** 値が `"claude-opus-4-6[1m]"` のまま変更されていない

---

### TC-005: src/core/step/ 配下で claude-opus を参照するファイルが design.ts のみである

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01 Acceptance Criteria

**GIVEN** リポジトリが変更後の状態である
**WHEN** `grep -r "claude-opus" src/core/step/` を実行する
**THEN** 出力に `design.ts` が含まれ、`spec-review.ts` / `code-review.ts` / `conformance.ts` は含まれない

---

### TC-006: SpecReviewStep のデフォルトモデルが model-registry で 'anthropic' に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** bare config（モデルオーバーライドなし）で `mergeModelRegistry` した registry
**WHEN** `resolveProvider(SpecReviewStep.agent.model, merged)` を呼び出す
**THEN** `'anthropic'` を返し、`CONFIG_INVALID` エラーをスローしない

---

### TC-007: CodeReviewStep のデフォルトモデルが model-registry で 'anthropic' に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** bare config（モデルオーバーライドなし）で `mergeModelRegistry` した registry
**WHEN** `resolveProvider(CodeReviewStep.agent.model, merged)` を呼び出す
**THEN** `'anthropic'` を返し、`CONFIG_INVALID` エラーをスローしない

---

### TC-008: ConformanceStep のデフォルトモデルが model-registry で 'anthropic' に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** bare config（モデルオーバーライドなし）で `mergeModelRegistry` した registry
**WHEN** `resolveProvider(ConformanceStep.agent.model, merged)` を呼び出す
**THEN** `'anthropic'` を返し、`CONFIG_INVALID` エラーをスローしない

---

### TC-009: bun run typecheck が green である

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 Acceptance Criteria

**GIVEN** 3 step のモデル定数変更が適用された状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなく終了する（exit code 0）

---

### TC-010: bun run test が green である

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 Acceptance Criteria

**GIVEN** 3 step のモデル定数変更が適用された状態
**WHEN** `bun run test` を実行する
**THEN** 全テストが pass し exit code 0 で終了する（model-registry.test.ts の "step default models resolve without CONFIG_INVALID" describe ブロックを含む）

---

### TC-011: worker 系 step のモデル定数が変更されていない

**Category**: manual
**Priority**: should
**Source**: design.md Context

**GIVEN** `src/core/step/` 配下の worker 系ファイル（implementer / build-fixer / code-fixer / spec-fixer / adr-gen / test-case-gen / request-review）を参照する
**WHEN** 各ファイルのモデル定数値を確認する
**THEN** すべて変更前と同じ `"claude-sonnet-4-6"` のままである（今回の変更による副作用がない）

---

## Result

```yaml
result: completed
total: 11
automated: 5
manual: 6
must: 10
should: 1
could: 0
blocked_reasons: []
```
